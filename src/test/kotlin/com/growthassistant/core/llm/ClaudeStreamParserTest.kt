package com.growthassistant.core.llm

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.Instant
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class ClaudeStreamParserTest {
    private val parser = ClaudeStreamParser(ClaudeFixtures.objectMapper)

    @Test
    fun `텍스트 응답과 한도 상태를 읽는다`() {
        val output = parser.parse(ClaudeFixtures.read("stream-text-success.jsonl"))

        assertEquals("2", output.result)
        assertNull(output.error())
        assertEquals(RateLimitInfo("allowed", Instant.ofEpochSecond(1791868200)), output.rateLimit)
    }

    @Test
    fun `스키마 응답은 structured_output으로 읽는다`() {
        val output = parser.parse(ClaudeFixtures.read("stream-schema-success.jsonl"))

        assertEquals(51, assertNotNull(output.structuredOutput).path("answer").asInt())
        assertNull(output.error())
    }

    @Test
    fun `웹 검색 응답의 출처를 구조화된 값으로 받는다`() {
        val output = parser.parse(ClaudeFixtures.read("stream-websearch-schema-success.jsonl"))

        val sources = assertNotNull(output.structuredOutput).path("sources")
        assertEquals("https://github.com/discord-jda/JDA/releases/latest", sources[0].path("url").asString())
    }

    @Test
    fun `미로그인은 subtype이 success여도 AUTH로 분류한다`() {
        val error = parser.parse(ClaudeFixtures.read("stream-error-not-logged-in.jsonl")).error()

        assertEquals(ClaudeErrorType.AUTH, assertNotNull(error).type)
    }

    @Test
    fun `알 수 없는 모델은 UNKNOWN으로 분류한다`() {
        val error = parser.parse(ClaudeFixtures.read("stream-error-unknown-model.jsonl")).error()

        assertEquals(ClaudeErrorType.UNKNOWN, assertNotNull(error).type)
    }

    @Test
    fun `한도 초과는 재개 시각과 함께 RATE_LIMIT으로 분류한다`() {
        val error = parser.parse(ClaudeFixtures.ASSUMED_RATE_LIMITED).error()

        assertEquals(ClaudeErrorType.RATE_LIMIT, assertNotNull(error).type)
        assertEquals(Instant.ofEpochSecond(1791868200), error.resetsAt)
    }

    @Test
    fun `result 이벤트가 없으면 INVALID_OUTPUT이다`() {
        val stdout =
            ClaudeFixtures
                .read("stream-text-success.jsonl")
                .lines()
                .filterNot { "\"type\":\"result\"" in it }
                .joinToString("\n")

        val e = assertThrows<ClaudeException> { parser.parse(stdout) }
        assertEquals(ClaudeErrorType.INVALID_OUTPUT, e.type)
    }
}
