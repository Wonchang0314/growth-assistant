package com.growthassistant.core.llm

import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ClaudeCliClientTest {
    @TempDir
    lateinit var workDir: Path

    private val logs = mutableListOf<LlmCallLog>()
    private val callLogs =
        mockk<LlmCallLogRepository> {
            val saved = slot<LlmCallLog>()
            every { save(capture(saved)) } answers { saved.captured.also { logs += it } }
        }

    /** 호출된 명령·표준입력을 기록하고, 준비한 응답을 차례로 돌려준다. */
    private class ScriptedRunner(
        vararg responses: () -> ProcessResult,
    ) : ClaudeProcessRunner {
        private val queue = ArrayDeque(responses.toList())
        val calls = mutableListOf<Pair<List<String>, String>>()

        override suspend fun run(
            command: List<String>,
            stdin: String,
            workDir: Path,
            timeout: kotlin.time.Duration,
        ): ProcessResult {
            calls += command to stdin
            return queue.removeFirst().invoke()
        }
    }

    private fun success(fixture: String) = { ProcessResult(0, ClaudeFixtures.read(fixture), "") }

    private val timeout = { throw ClaudeException(ClaudeErrorType.TIMEOUT, "시간 초과") }

    private fun client(
        runner: ClaudeProcessRunner,
        maxConcurrency: Int = 2,
    ) = ClaudeCliClient(
        properties =
            ClaudeProperties(
                executable = "claude",
                workDir = workDir,
                maxConcurrency = maxConcurrency,
                purposes =
                    mapOf(
                        LlmPurpose.TUTOR_CHAT to ClaudeProperties.PurposeProperties("sonnet", Duration.ofSeconds(180), webAccess = true),
                        LlmPurpose.SESSION_SUMMARY to ClaudeProperties.PurposeProperties("haiku", Duration.ofSeconds(60)),
                    ),
            ),
        runner = runner,
        parser = ClaudeStreamParser(ClaudeFixtures.objectMapper),
        callLogs = callLogs,
        objectMapper = ClaudeFixtures.objectMapper,
        clock = Clock.fixed(Instant.parse("2026-10-13T00:00:00Z"), ZoneOffset.UTC),
    )

    data class Answer(
        val answer: Int,
        val explanation: String,
    )

    @Test
    fun `격리 옵션을 붙이고 프롬프트는 표준입력으로 보낸다`() =
        runTest {
            val runner = ScriptedRunner(success("stream-text-success.jsonl"))

            val reply = client(runner).complete(ClaudeRequest(LlmPurpose.SESSION_SUMMARY, "1+1은?", systemPrompt = "요약가"))

            assertEquals("2", reply)
            val (command, stdin) = runner.calls.single()
            assertEquals("1+1은?", stdin)
            assertEquals(
                listOf(
                    "claude",
                    "-p",
                    "--output-format",
                    "stream-json",
                    "--verbose",
                    "--model",
                    "haiku",
                    "--setting-sources",
                    "",
                    "--strict-mcp-config",
                    "--no-session-persistence",
                    "--tools",
                    "",
                    "--system-prompt",
                    "요약가",
                ),
                command,
            )
        }

    @Test
    fun `웹을 허용한 용도는 WebSearch와 WebFetch만 연다`() =
        runTest {
            val runner = ScriptedRunner(success("stream-text-success.jsonl"))

            client(runner).complete(ClaudeRequest(LlmPurpose.TUTOR_CHAT, "질문"))

            val command = runner.calls.single().first
            val tools = command.indexOf("--tools")
            assertEquals("WebSearch,WebFetch", command[tools + 1])
            assertEquals("WebSearch,WebFetch", command[command.indexOf("--allowedTools") + 1])
        }

    @Test
    fun `스키마 응답을 DTO로 바꾼다`() =
        runTest {
            val runner = ScriptedRunner(success("stream-schema-success.jsonl"))

            val answer = client(runner).completeStructured<Answer>(ClaudeRequest(LlmPurpose.SESSION_SUMMARY, "17*3은?"), SCHEMA)

            assertEquals(51, answer.answer)
            assertEquals(
                SCHEMA,
                runner.calls
                    .single()
                    .first
                    .let { it[it.indexOf("--json-schema") + 1] },
            )
        }

    @Test
    fun `DTO로 바꾸지 못하면 오류를 붙여 한 번 다시 요청한다`() =
        runTest {
            val runner = ScriptedRunner(success("stream-text-success.jsonl"), success("stream-schema-success.jsonl"))

            val answer = client(runner).completeStructured<Answer>(ClaudeRequest(LlmPurpose.SESSION_SUMMARY, "17*3은?"), SCHEMA)

            assertEquals(51, answer.answer)
            val retryPrompt = runner.calls[1].second
            assertTrue(retryPrompt.startsWith("17*3은?") && "structured_output이 없다" in retryPrompt)
            assertEquals(listOf(false, true), logs.map { it.success })
        }

    @Test
    fun `다시 요청해도 형식이 틀리면 INVALID_OUTPUT으로 실패한다`() =
        runTest {
            val runner = ScriptedRunner(success("stream-text-success.jsonl"), success("stream-text-success.jsonl"))

            val e =
                assertThrows<ClaudeException> {
                    client(runner).completeStructured<Answer>(ClaudeRequest(LlmPurpose.SESSION_SUMMARY, "q"), SCHEMA)
                }

            assertEquals(ClaudeErrorType.INVALID_OUTPUT, e.type)
            assertEquals(2, runner.calls.size)
        }

    @Test
    fun `타임아웃이면 한 번 재시도한다`() =
        runTest {
            val runner = ScriptedRunner(timeout, success("stream-text-success.jsonl"))

            assertEquals("2", client(runner).complete(ClaudeRequest(LlmPurpose.SESSION_SUMMARY, "q")))
            assertEquals(2, runner.calls.size)
        }

    @Test
    fun `두 번 연속 타임아웃이면 TIMEOUT으로 실패하고 두 번 모두 기록한다`() =
        runTest {
            val runner = ScriptedRunner(timeout, timeout)

            val e = assertThrows<ClaudeException> { client(runner).complete(ClaudeRequest(LlmPurpose.SESSION_SUMMARY, "q")) }

            assertEquals(ClaudeErrorType.TIMEOUT, e.type)
            assertEquals(2, logs.size)
            assertTrue(logs.all { !it.success && it.error!!.startsWith("TIMEOUT") })
        }

    @Test
    fun `인증 오류는 재시도하지 않고 기록한다`() =
        runTest {
            val runner = ScriptedRunner({ ProcessResult(1, ClaudeFixtures.read("stream-error-not-logged-in.jsonl"), "") })

            val e = assertThrows<ClaudeException> { client(runner).complete(ClaudeRequest(LlmPurpose.TUTOR_CHAT, "q")) }

            assertEquals(ClaudeErrorType.AUTH, e.type)
            assertEquals(1, runner.calls.size)
            val entry = logs.single()
            assertEquals("TUTOR_CHAT", entry.purpose)
            assertEquals("sonnet", entry.model)
            assertEquals(false, entry.success)
        }

    @Test
    fun `동시 실행은 설정한 개수를 넘지 않는다`() =
        runTest {
            val running = AtomicInteger()
            val peak = AtomicInteger()
            val runner =
                ClaudeProcessRunner { _, _, _, _ ->
                    peak.accumulateAndGet(running.incrementAndGet(), ::maxOf)
                    delay(100)
                    running.decrementAndGet()
                    ProcessResult(0, ClaudeFixtures.read("stream-text-success.jsonl"), "")
                }
            val client = client(runner, maxConcurrency = 2)

            (1..5).map { async { client.complete(ClaudeRequest(LlmPurpose.SESSION_SUMMARY, "q$it")) } }.awaitAll()

            assertEquals(2, peak.get())
        }

    private companion object {
        const val SCHEMA = """{"type":"object","properties":{"answer":{"type":"integer"},"explanation":{"type":"string"}}}"""
    }
}
