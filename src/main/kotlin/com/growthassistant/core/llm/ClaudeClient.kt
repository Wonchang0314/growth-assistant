package com.growthassistant.core.llm

import java.time.Instant
import kotlin.reflect.KClass

/** 모든 LLM 호출이 지나가는 유일한 경로 (ADR-0012). */
interface ClaudeClient {
    /** 자유 텍스트 응답. */
    suspend fun complete(request: ClaudeRequest): String

    /** [jsonSchema]를 만족하는 응답을 [type]으로 받는다. 변환에 실패하면 오류 내용을 붙여 한 번 다시 요청한다. */
    suspend fun <T : Any> completeStructured(
        request: ClaudeRequest,
        jsonSchema: String,
        type: KClass<T>,
    ): T
}

suspend inline fun <reified T : Any> ClaudeClient.completeStructured(
    request: ClaudeRequest,
    jsonSchema: String,
): T = completeStructured(request, jsonSchema, T::class)

data class ClaudeRequest(
    val purpose: LlmPurpose,
    val prompt: String,
    val systemPrompt: String? = null,
)

/** 용도마다 모델·타임아웃·웹 허용 여부를 따로 설정한다 (`growth.claude.purposes`). */
enum class LlmPurpose {
    TUTOR_CHAT,
    SESSION_SUMMARY,
}

enum class ClaudeErrorType { AUTH, RATE_LIMIT, TIMEOUT, INVALID_OUTPUT, UNKNOWN }

class ClaudeException(
    val type: ClaudeErrorType,
    message: String,
    /** 사용량 한도에 걸렸을 때 다시 쓸 수 있는 시각. 알 수 없으면 null. */
    val resetsAt: Instant? = null,
    cause: Throwable? = null,
) : RuntimeException(message, cause)
