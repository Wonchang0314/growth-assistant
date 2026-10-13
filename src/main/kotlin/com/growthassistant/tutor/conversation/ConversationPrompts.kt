package com.growthassistant.tutor.conversation

/** 튜터 응답 스키마 (ADR-0012: 출처는 스키마로 받는다). */
data class TutorReply(
    val reply: String,
    val sources: List<Source> = emptyList(),
    val answerRevealed: Boolean = false,
) {
    data class Source(
        val title: String,
        val url: String,
    )
}

/** 프롬프트 조립. 순수 함수로 두어 Discord·CLI 없이 확인한다. */
object ConversationPrompts {
    val TUTOR_SYSTEM: String = resource("/prompts/tutor-system.md")
    val SUMMARY_SYSTEM: String = resource("/prompts/session-summary.md")

    val TUTOR_REPLY_SCHEMA: String =
        """
        {"type":"object","properties":{
          "reply":{"type":"string"},
          "sources":{"type":"array","items":{"type":"object","properties":{
            "title":{"type":"string"},"url":{"type":"string"}},
            "required":["title","url"],"additionalProperties":false}},
          "answerRevealed":{"type":"boolean"}},
         "required":["reply","sources","answerRevealed"],"additionalProperties":false}
        """.trimIndent().replace("\n", "")

    fun tutor(
        topic: String?,
        summary: String?,
        recent: List<ConversationMessage>,
        message: String,
    ): String =
        buildString {
            topic?.let { section("대화 주제", it) }
            summary?.let { section("이전 대화 요약", it) }
            if (recent.isNotEmpty()) section("최근 대화", transcript(recent))
            section("이번 메시지", message)
        }.trimEnd()

    fun summary(
        previous: String?,
        messages: List<ConversationMessage>,
    ): String =
        buildString {
            previous?.let { section("이전 요약", it) }
            section("새 대화", transcript(messages))
        }.trimEnd()

    /** 본문 뒤에 출처 목록을 붙인다. `<url>`로 감싸 Discord 링크 미리보기를 끈다. */
    fun render(reply: TutorReply): String {
        val sources = reply.sources.filter { it.url.isNotBlank() }.distinctBy { it.url }
        if (sources.isEmpty()) return reply.reply
        val links = sources.joinToString("\n") { "- [${it.title.ifBlank { it.url }}](<${it.url}>)" }
        return "${reply.reply}\n\n**출처**\n$links"
    }

    private fun transcript(messages: List<ConversationMessage>): String =
        messages.joinToString("\n") {
            val speaker =
                when (it.role) {
                    MessageRole.USER -> "사용자"
                    MessageRole.TUTOR -> "튜터"
                }
            "$speaker: ${it.content}"
        }

    private fun StringBuilder.section(
        title: String,
        body: String,
    ) {
        append("[")
            .append(title)
            .append("]\n")
            .append(body.trim())
            .append("\n\n")
    }

    private fun resource(path: String): String =
        requireNotNull(ConversationPrompts::class.java.getResource(path)) { "프롬프트가 없다: $path" }.readText().trim()
}
