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

@Entity
@Table(name = "conversation_message")
class ConversationMessage(
    @Column(nullable = false, updatable = false)
    val sessionId: Long,
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    val role: MessageRole,
    @Column(nullable = false, updatable = false)
    val content: String,
    @Column(nullable = false, updatable = false)
    val createdAt: Instant,
) {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long? = null
}

enum class MessageRole { USER, TUTOR }
