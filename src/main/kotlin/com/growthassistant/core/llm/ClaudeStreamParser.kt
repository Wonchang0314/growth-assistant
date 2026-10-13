package com.growthassistant.core.llm

import org.springframework.stereotype.Component
import tools.jackson.core.JacksonException
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.time.Instant

/** `claude -p --output-format stream-json --verbose`의 출력. 응답 샘플은 `src/test/resources/fixtures/claude/`. */
data class ClaudeOutput(
    val isError: Boolean,
    val result: String,
    val structuredOutput: JsonNode?,
    val apiErrorStatus: Int?,
    val rateLimit: RateLimitInfo?,
) {
    /** 실패한 호출이면 분류한 예외, 성공이면 null. */
    fun error(): ClaudeException? {
        // 응답을 받았으면 한도 상태가 rejected여도 성공으로 본다 (초과 사용으로 처리됐을 수 있다).
        if (!isError) return null
        val rateLimited = rateLimit?.status == RATE_LIMIT_REJECTED || apiErrorStatus == 429
        return when {
            rateLimited || RATE_LIMIT_TEXT.containsMatchIn(result) -> {
                ClaudeException(ClaudeErrorType.RATE_LIMIT, result, resetsAt = rateLimit?.resetsAt)
            }

            apiErrorStatus == 401 || AUTH_TEXT.containsMatchIn(result) -> {
                ClaudeException(ClaudeErrorType.AUTH, result)
            }

            else -> {
                ClaudeException(ClaudeErrorType.UNKNOWN, "api_error_status=$apiErrorStatus: $result")
            }
        }
    }

    private companion object {
        const val RATE_LIMIT_REJECTED = "rejected"

        // 한도 초과 출력은 아직 재현하지 못했다. rate_limit_event가 없을 때를 대비한 문자열 판별이다.
        val RATE_LIMIT_TEXT = Regex("(usage|rate) limit|hit your limit", RegexOption.IGNORE_CASE)
        val AUTH_TEXT = Regex("not logged in|/login|invalid api key|oauth token", RegexOption.IGNORE_CASE)
    }
}

data class RateLimitInfo(
    val status: String,
    val resetsAt: Instant?,
)

@Component
class ClaudeStreamParser(
    private val objectMapper: ObjectMapper,
) {
    fun parse(stdout: String): ClaudeOutput {
        var result: JsonNode? = null
        var rateLimit: JsonNode? = null
        stdout
            .lineSequence()
            .map { it.trim() }
            .filter { it.startsWith("{") }
            .forEach { line ->
                val event =
                    try {
                        objectMapper.readTree(line)
                    } catch (e: JacksonException) {
                        throw ClaudeException(ClaudeErrorType.INVALID_OUTPUT, "JSON이 아닌 출력 줄: ${line.take(200)}", cause = e)
                    }
                when (event.path("type").asString()) {
                    "result" -> result = event
                    "rate_limit_event" -> rateLimit = event.path("rate_limit_info")
                }
            }

        val r = result ?: throw ClaudeException(ClaudeErrorType.INVALID_OUTPUT, "result 이벤트가 없다: ${stdout.take(500)}")
        return ClaudeOutput(
            isError = r.path("is_error").asBoolean(),
            result = r.path("result").asString(""),
            structuredOutput = r.get("structured_output")?.takeUnless { it.isNull },
            apiErrorStatus = r.get("api_error_status")?.takeIf { it.isNumber }?.asInt(),
            rateLimit =
                rateLimit?.let { info ->
                    RateLimitInfo(
                        status = info.path("status").asString(""),
                        resetsAt = info.get("resetsAt")?.takeIf { it.isNumber }?.let { Instant.ofEpochSecond(it.asLong()) },
                    )
                },
        )
    }
}
