package com.growthassistant.core.llm

import com.growthassistant.core.discord.AdminNotifier
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper
import java.nio.file.Files
import java.time.Clock
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.reflect.KClass
import kotlin.time.toKotlinDuration

/** `claude -p` 서브프로세스로 호출한다 (ADR-0012, 설계 문서 7.0). */
@Component
class ClaudeCliClient(
    private val properties: ClaudeProperties,
    private val runner: ClaudeProcessRunner,
    private val parser: ClaudeStreamParser,
    private val callLogs: LlmCallLogRepository,
    private val objectMapper: ObjectMapper,
    private val clock: Clock,
    private val adminNotifier: AdminNotifier,
) : ClaudeClient {
    private val log = LoggerFactory.getLogger(javaClass)
    private val permits = Semaphore(properties.maxConcurrency)

    /** 인증 오류를 이미 알렸는지. 다시 로그인해 호출이 성공하면 풀린다. */
    private val authAlerted = AtomicBoolean(false)

    override suspend fun complete(request: ClaudeRequest): String = callWithTimeoutRetry(request, jsonSchema = null) { it.result }

    override suspend fun <T : Any> completeStructured(
        request: ClaudeRequest,
        jsonSchema: String,
        type: KClass<T>,
    ): T {
        val convert = { output: ClaudeOutput ->
            val node =
                output.structuredOutput
                    ?: throw ClaudeException(ClaudeErrorType.INVALID_OUTPUT, "structured_output이 없다")
            try {
                objectMapper.treeToValue(node, type.java)
            } catch (e: Exception) {
                throw ClaudeException(ClaudeErrorType.INVALID_OUTPUT, "응답을 ${type.simpleName}으로 바꾸지 못했다: ${e.message}", cause = e)
            }
        }
        return try {
            callWithTimeoutRetry(request, jsonSchema, convert)
        } catch (e: ClaudeException) {
            if (e.type != ClaudeErrorType.INVALID_OUTPUT) throw e
            val retry = request.copy(prompt = request.prompt + "\n\n[이전 응답 오류] ${e.message}\n스키마를 정확히 지켜 다시 답한다.")
            callWithTimeoutRetry(retry, jsonSchema, convert)
        }
    }

    private suspend fun <T> callWithTimeoutRetry(
        request: ClaudeRequest,
        jsonSchema: String?,
        convert: (ClaudeOutput) -> T,
    ): T =
        try {
            callOnce(request, jsonSchema, convert)
        } catch (e: ClaudeException) {
            if (e.type != ClaudeErrorType.TIMEOUT) throw e
            callOnce(request, jsonSchema, convert)
        }

    /** 프로세스 한 번 실행. 결과와 상관없이 `llm_call_log`에 한 줄을 남긴다. */
    private suspend fun <T> callOnce(
        request: ClaudeRequest,
        jsonSchema: String?,
        convert: (ClaudeOutput) -> T,
    ): T =
        permits.withPermit {
            val purpose = properties.of(request.purpose)
            val inputChars = request.prompt.length + (request.systemPrompt?.length ?: 0)
            val startedAt = System.nanoTime()
            try {
                withContext(Dispatchers.IO) { Files.createDirectories(properties.workDir) }
                val process =
                    runner.run(
                        command(request, purpose, jsonSchema),
                        request.prompt,
                        properties.workDir,
                        purpose.timeout.toKotlinDuration(),
                    )
                val output = parser.parse(process.stdout)
                output.error()?.let { throw it }
                val value = convert(output)
                authAlerted.set(false)
                record(request, purpose, startedAt, inputChars, output.result.length, error = null)
                value
            } catch (e: CancellationException) {
                throw e
            } catch (e: ClaudeException) {
                record(request, purpose, startedAt, inputChars, 0, error = "${e.type}: ${e.message}")
                if (e.type == ClaudeErrorType.AUTH) alertAuthOnce(e)
                throw e
            } catch (e: Exception) {
                record(request, purpose, startedAt, inputChars, 0, error = "${ClaudeErrorType.UNKNOWN}: $e")
                throw ClaudeException(ClaudeErrorType.UNKNOWN, e.toString(), cause = e)
            }
        }

    private fun command(
        request: ClaudeRequest,
        purpose: ClaudeProperties.PurposeProperties,
        jsonSchema: String?,
    ): List<String> =
        buildList {
            addAll(listOf(properties.executable, "-p", "--output-format", "stream-json", "--verbose"))
            addAll(listOf("--model", purpose.model))
            // 다른 프로젝트의 설정·CLAUDE.md·MCP 서버가 섞이지 않게 격리한다.
            addAll(listOf("--setting-sources", "", "--strict-mcp-config", "--no-session-persistence"))
            if (purpose.webAccess) {
                addAll(listOf("--tools", WEB_TOOLS, "--allowedTools", WEB_TOOLS))
            } else {
                addAll(listOf("--tools", ""))
            }
            request.systemPrompt?.let { addAll(listOf("--system-prompt", it)) }
            jsonSchema?.let { addAll(listOf("--json-schema", it)) }
        }

    private suspend fun record(
        request: ClaudeRequest,
        purpose: ClaudeProperties.PurposeProperties,
        startedAtNanos: Long,
        inputChars: Int,
        outputChars: Int,
        error: String?,
    ) {
        val entry =
            LlmCallLog(
                purpose = request.purpose.name,
                model = purpose.model,
                durationMs = (System.nanoTime() - startedAtNanos) / 1_000_000,
                success = error == null,
                inputChars = inputChars,
                outputChars = outputChars,
                error = error?.take(MAX_ERROR_CHARS),
                createdAt = clock.instant(),
            )
        // 로그 저장 실패가 호출 결과를 바꾸면 안 된다.
        try {
            withContext(Dispatchers.IO) { callLogs.save(entry) }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            log.warn("llm_call_log 저장 실패", e)
        }
    }

    /** 인증 오류는 호출마다 반복되므로 `#관리`에는 한 번만 알린다 (설계 문서 9장). */
    private suspend fun alertAuthOnce(e: ClaudeException) {
        if (!authAlerted.compareAndSet(false, true)) return
        try {
            adminNotifier.notify("Claude CLI 인증 오류: ${e.message}\n봇을 실행하는 기기에서 `claude`를 실행해 다시 로그인하면 이후 호출부터 정상으로 돌아옵니다.")
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            log.warn("인증 오류 알림 실패", e)
        }
    }

    private companion object {
        const val WEB_TOOLS = "WebSearch,WebFetch"
        const val MAX_ERROR_CHARS = 2000
    }
}
