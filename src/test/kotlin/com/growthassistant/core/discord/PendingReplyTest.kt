package com.growthassistant.core.discord

import org.junit.jupiter.api.Test
import java.time.Instant
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PendingReplyTest {
    private val deferredAt = Instant.parse("2026-10-13T00:00:00Z")

    @Test
    fun `지연 응답 후 14분 안에는 상호작용으로 답한다`() {
        assertTrue(PendingReply.isInteractionUsable(deferredAt, deferredAt.plusSeconds(13 * 60 + 59)))
    }

    @Test
    fun `14분이 지나면 일반 메시지로 보낸다`() {
        assertFalse(PendingReply.isInteractionUsable(deferredAt, deferredAt.plusSeconds(14 * 60)))
    }
}
