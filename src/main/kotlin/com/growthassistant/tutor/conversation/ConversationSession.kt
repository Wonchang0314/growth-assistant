package com.growthassistant.tutor.conversation

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

/** 튜터링 대화 하나. Discord 스레드 하나와 1:1로 대응한다. */
@Entity
@Table(name = "conversation_session")
class ConversationSession(
    @Column(nullable = false, unique = true, updatable = false)
    val discordThreadId: Long,
    val topic: String?,
    @Column(nullable = false, updatable = false)
    val startedAt: Instant,
) {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long? = null

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    var status: ConversationStatus = ConversationStatus.ACTIVE
        protected set

    var summary: String? = null
        protected set

    @Column(nullable = false)
    var answerRevealed: Boolean = false
        protected set

    var closedAt: Instant? = null
        protected set

    fun close(
        summary: String?,
        at: Instant,
    ) {
        check(status == ConversationStatus.ACTIVE) { "이미 종료된 세션이다: $id" }
        this.status = ConversationStatus.CLOSED
        this.summary = summary
        this.closedAt = at
    }

    fun markAnswerRevealed() {
        answerRevealed = true
    }
}

enum class ConversationStatus { ACTIVE, CLOSED }
