package com.growthassistant.core.llm

import kotlin.reflect.KClass

/**
 * 유스케이스 테스트용. 준비한 응답을 차례로 돌려주고 받은 요청을 기록한다.
 * 구조화된 응답은 JSON 문자열로 준비한다.
 */
class FakeClaudeClient : ClaudeClient {
    val requests = mutableListOf<ClaudeRequest>()
    private val responses = ArrayDeque<() -> String>()

    fun reply(text: String) = apply { responses += { text } }

    fun fail(
        type: ClaudeErrorType,
        message: String = type.name,
    ) = fail(ClaudeException(type, message))

    fun fail(exception: ClaudeException) = apply { responses += { throw exception } }

    fun requestsFor(purpose: LlmPurpose) = requests.filter { it.purpose == purpose }

    override suspend fun complete(request: ClaudeRequest): String {
        requests += request
        val next = checkNotNull(responses.removeFirstOrNull()) { "준비한 응답이 없다: $request" }
        return next()
    }

    override suspend fun <T : Any> completeStructured(
        request: ClaudeRequest,
        jsonSchema: String,
        type: KClass<T>,
    ): T = ClaudeFixtures.objectMapper.readValue(complete(request), type.java)
}
