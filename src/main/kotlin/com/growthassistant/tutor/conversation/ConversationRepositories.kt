package com.growthassistant.tutor.conversation

import org.springframework.data.jpa.repository.JpaRepository

interface ConversationSessionRepository : JpaRepository<ConversationSession, Long> {
    fun findByDiscordThreadId(discordThreadId: Long): ConversationSession?

    fun findAllByStatus(status: ConversationStatus): List<ConversationSession>
}

interface ConversationMessageRepository : JpaRepository<ConversationMessage, Long> {
    /** 아직 요약에 합쳐지지 않은 메시지, 시간순. 요약이 없으면 [afterId]로 0을 넘긴다. */
    fun findAllBySessionIdAndIdGreaterThanOrderByIdAsc(
        sessionId: Long,
        afterId: Long,
    ): List<ConversationMessage>

    /** 마지막 메시지. 유휴 판정에 쓴다. */
    fun findTopBySessionIdOrderByIdDesc(sessionId: Long): ConversationMessage?
}
