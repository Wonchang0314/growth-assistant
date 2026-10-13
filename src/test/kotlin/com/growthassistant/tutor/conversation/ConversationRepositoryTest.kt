package com.growthassistant.tutor.conversation

import com.growthassistant.TestcontainersConfiguration
import jakarta.persistence.EntityManager
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase
import org.springframework.context.annotation.Import
import org.springframework.dao.DataIntegrityViolationException
import java.time.Instant
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestcontainersConfiguration::class)
class ConversationRepositoryTest
    @Autowired
    constructor(
        private val sessions: ConversationSessionRepository,
        private val messages: ConversationMessageRepository,
        private val em: EntityManager,
    ) {
        private val now = Instant.parse("2026-10-13T00:00:00Z")

        @Test
        fun `스레드 ID로 세션을 찾고 종료 상태를 저장한다`() {
            val saved = sessions.save(ConversationSession(discordThreadId = 111L, topic = "트랜잭션 격리 수준", startedAt = now))
            em.flush()
            em.clear()

            val found = assertNotNull(sessions.findByDiscordThreadId(111L))
            assertEquals(ConversationStatus.ACTIVE, found.status)
            assertNull(found.closedAt)

            found.close(summary = "MVCC와 격리 수준을 다뤘다", at = now.plusSeconds(600))
            em.flush()
            em.clear()

            val closed = sessions.findById(saved.id!!).orElseThrow()
            assertEquals(ConversationStatus.CLOSED, closed.status)
            assertEquals("MVCC와 격리 수준을 다뤘다", closed.summary)
            assertEquals(now.plusSeconds(600), closed.closedAt)
            assertEquals(emptyList(), sessions.findAllByStatus(ConversationStatus.ACTIVE))
        }

        @Test
        fun `같은 스레드 ID로 세션을 두 개 만들 수 없다`() {
            sessions.saveAndFlush(ConversationSession(discordThreadId = 222L, topic = null, startedAt = now))

            assertThrows<DataIntegrityViolationException> {
                sessions.saveAndFlush(ConversationSession(discordThreadId = 222L, topic = null, startedAt = now))
            }
        }

        @Test
        fun `최근 메시지 8개를 최신순으로 가져온다`() {
            val session = sessions.save(ConversationSession(discordThreadId = 333L, topic = null, startedAt = now))
            (1..10).forEach { i ->
                val role = if (i % 2 == 1) MessageRole.USER else MessageRole.TUTOR
                messages.save(ConversationMessage(session.id!!, role, "메시지 $i", now.plusSeconds(i.toLong())))
            }
            em.flush()
            em.clear()

            val recent = messages.findTop8BySessionIdOrderByIdDesc(session.id!!)

            assertEquals((10 downTo 3).map { "메시지 $it" }, recent.map { it.content })
        }
    }
