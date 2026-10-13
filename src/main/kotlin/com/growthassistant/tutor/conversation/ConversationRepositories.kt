package com.growthassistant.tutor.conversation

import org.springframework.data.jpa.repository.JpaRepository

interface ConversationSessionRepository : JpaRepository<ConversationSession, Long> {
    fun findByDiscordThreadId(discordThreadId: Long): ConversationSession?

    fun findAllByStatus(status: ConversationStatus): List<ConversationSession>
}

interface ConversationMessageRepository : JpaRepository<ConversationMessage, Long> {
    /** 최신순. 맥락 조립 때 뒤집어서 시간순으로 쓴다. */
    fun findTop8BySessionIdOrderByIdDesc(sessionId: Long): List<ConversationMessage>
}
