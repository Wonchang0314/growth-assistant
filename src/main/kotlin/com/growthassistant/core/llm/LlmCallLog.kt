package com.growthassistant.core.llm

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.springframework.data.jpa.repository.JpaRepository
import java.time.Instant

/** `claude` CLI 호출 한 번의 기록. 성공·실패 모두 남긴다. */
@Entity
@Table(name = "llm_call_log")
class LlmCallLog(
    @Column(nullable = false, updatable = false)
    val purpose: String,
    @Column(nullable = false, updatable = false)
    val model: String,
    @Column(nullable = false, updatable = false)
    val durationMs: Long,
    @Column(nullable = false, updatable = false)
    val success: Boolean,
    @Column(nullable = false, updatable = false)
    val inputChars: Int,
    @Column(nullable = false, updatable = false)
    val outputChars: Int,
    @Column(updatable = false)
    val error: String?,
    @Column(nullable = false, updatable = false)
    val createdAt: Instant,
) {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long? = null
}

interface LlmCallLogRepository : JpaRepository<LlmCallLog, Long>
