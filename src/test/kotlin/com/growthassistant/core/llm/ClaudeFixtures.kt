package com.growthassistant.core.llm

import tools.jackson.databind.ObjectMapper
import tools.jackson.module.kotlin.jacksonObjectMapper

object ClaudeFixtures {
    val objectMapper: ObjectMapper = jacksonObjectMapper()

    /** `src/test/resources/fixtures/claude/`의 실제 CLI 출력. */
    fun read(name: String): String = requireNotNull(javaClass.getResource("/fixtures/claude/$name")) { "픽스처가 없다: $name" }.readText()

    /**
     * 한도 초과 출력은 재현하지 못해 실제 이벤트 형식에 값만 바꿔 만든 것이다.
     * 실제 출력을 처음 겪으면 픽스처로 교체한다.
     */
    const val ASSUMED_RATE_LIMITED =
        """{"type":"rate_limit_event","rate_limit_info":{"status":"rejected","resetsAt":1791868200,"rateLimitType":"five_hour"}}
{"type":"result","subtype":"success","is_error":true,"api_error_status":429,"result":"You've hit your limit · resets 3pm"}"""
}
