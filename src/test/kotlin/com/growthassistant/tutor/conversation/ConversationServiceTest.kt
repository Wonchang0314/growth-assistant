package com.growthassistant.tutor.conversation

import com.growthassistant.TestcontainersConfiguration
import com.growthassistant.core.llm.ClaudeErrorType
import com.growthassistant.core.llm.ClaudeException
import com.growthassistant.core.llm.FakeClaudeClient
import com.growthassistant.core.llm.LlmPurpose
import com.growthassistant.tutor.conversation.ConversationService.EndResult
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

// 서비스가 IO 스레드에서 저장하므로 테스트 트랜잭션을 끄고 직접 정리한다.
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestcontainersConfiguration::class)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class ConversationServiceTest
    @Autowired
    constructor(
        private val sessions: ConversationSessionRepository,
        private val messages: ConversationMessageRepository,
    ) {
        private val clock = MutableClock(Instant.parse("2026-10-13T00:00:00Z"))
        private val claude = FakeClaudeClient()
        private val service = ConversationService(sessions, messages, claude, clock)
        private val thread = 1001L

        @AfterEach
        fun cleanUp() {
            messages.deleteAll()
            sessions.deleteAll()
        }

        private fun tutor(
            reply: String,
            sources: String = "[]",
            answerRevealed: Boolean = false,
        ) = claude.reply("""{"reply":"$reply","sources":$sources,"answerRevealed":$answerRevealed}""")

        private fun session() = assertNotNull(sessions.findByDiscordThreadId(thread))

        @Test
        fun `첫 메시지로 세션을 만들고, 응답 뒤에 출처를 붙인다`() =
            runBlocking {
                tutor("격리 수준을 어떻게 이해하고 있나요?", sources = """[{"title":"PostgreSQL 문서","url":"https://www.postgresql.org/docs/"}]""")

                val text = service.chat(thread, "트랜잭션 격리 수준이 헷갈려\n특히 팬텀 리드")

                assertEquals(
                    "격리 수준을 어떻게 이해하고 있나요?\n\n**출처**\n- [PostgreSQL 문서](<https://www.postgresql.org/docs/>)",
                    text,
                )
                assertEquals("트랜잭션 격리 수준이 헷갈려", session().topic)
                val request = claude.requests.single()
                assertEquals(LlmPurpose.TUTOR_CHAT, request.purpose)
                assertEquals(ConversationPrompts.TUTOR_SYSTEM, request.systemPrompt)
                assertTrue(request.prompt.endsWith("[이번 메시지]\n트랜잭션 격리 수준이 헷갈려\n특히 팬텀 리드"))
                assertEquals(listOf(MessageRole.USER, MessageRole.TUTOR), messages.findAll().map { it.role })
            }

        @Test
        fun `이어지는 메시지에는 이전 대화를 맥락으로 넣는다`() =
            runBlocking {
                tutor("어떻게 이해하고 있나요?")
                tutor("좋아요. 그럼 팬텀 리드는?")
                service.chat(thread, "격리 수준")

                service.chat(thread, "더티 리드를 막는 거")

                val prompt = claude.requests.last().prompt
                assertTrue("[대화 주제]\n격리 수준" in prompt)
                assertTrue("[최근 대화]\n사용자: 격리 수준\n튜터: 어떻게 이해하고 있나요?" in prompt)
                assertFalse("[이전 대화 요약]" in prompt)
            }

        @Test
        fun `답을 보여 주면 세션에 기록한다`() =
            runBlocking {
                tutor("정답은 MVCC입니다.", answerRevealed = true)

                service.chat(thread, "그냥 답 알려줘")

                assertTrue(session().answerRevealed)
            }

        @Test
        fun `사용량 한도면 재개 시각을 안내하고, 사용자 메시지는 남긴다`() =
            runBlocking {
                claude.fail(ClaudeException(ClaudeErrorType.RATE_LIMIT, "limit", resetsAt = Instant.parse("2026-10-13T06:00:00Z")))

                val text = service.chat(thread, "질문")

                assertEquals("Claude 사용량 한도에 도달했습니다. 10월 13일 15:00 이후에 다시 보내 주세요.", text)
                assertEquals(listOf(MessageRole.USER), messages.findAll().map { it.role })
            }

        @Test
        fun `인증 오류면 관리 채널을 확인하라고 안내한다`() =
            runBlocking {
                claude.fail(ClaudeErrorType.AUTH)

                assertTrue("#관리" in service.chat(thread, "질문"))
            }

        @Test
        fun `요약되지 않은 메시지가 16개가 되면 오래된 8개를 요약에 합치고, 다음 맥락에서 뺀다`() =
            runBlocking {
                repeat(7) {
                    tutor("답 $it")
                    service.chat(thread, "질문 $it")
                    service.compact(thread)
                }
                assertTrue(claude.requestsFor(LlmPurpose.SESSION_SUMMARY).isEmpty())

                tutor("답 7")
                service.chat(thread, "질문 7")
                claude.reply("- 질문 0~3을 다뤘다")
                service.compact(thread)

                val summaryRequest = claude.requestsFor(LlmPurpose.SESSION_SUMMARY).single()
                assertTrue("사용자: 질문 3\n튜터: 답 3" in summaryRequest.prompt)
                assertFalse("질문 4" in summaryRequest.prompt)
                assertEquals("- 질문 0~3을 다뤘다", session().summary)

                tutor("답 8")
                service.chat(thread, "질문 8")
                val prompt = claude.requests.last().prompt
                assertTrue("[이전 대화 요약]\n- 질문 0~3을 다뤘다" in prompt)
                assertFalse("질문 3" in prompt)
                assertTrue("사용자: 질문 4" in prompt)
            }

        @Test
        fun `end는 요약하고 닫으며, 닫힌 스레드에는 안내만 한다`() =
            runBlocking {
                tutor("어떻게 이해하고 있나요?")
                service.chat(thread, "격리 수준")
                claude.reply("- 격리 수준을 다뤘다")

                assertEquals(EndResult.Ended("- 격리 수준을 다뤘다"), service.end(thread))
                assertEquals(ConversationStatus.CLOSED, session().status)
                assertEquals(EndResult.AlreadyClosed, service.end(thread))
                assertEquals(ConversationService.CLOSED_NOTICE, service.chat(thread, "다시"))
                assertEquals(EndResult.NotFound, service.end(9999L))
            }

        @Test
        fun `요약에 실패해도 세션은 닫는다`() =
            runBlocking {
                tutor("어떻게 이해하고 있나요?")
                service.chat(thread, "격리 수준")
                claude.fail(ClaudeErrorType.TIMEOUT)

                assertEquals(EndResult.Ended(null), service.end(thread))
                assertEquals(ConversationStatus.CLOSED, session().status)
            }

        @Test
        fun `마지막 메시지 후 20분이 지난 세션만 닫는다`() =
            runBlocking {
                tutor("답")
                service.chat(thread, "오래된 대화")
                clock.advance(Duration.ofMinutes(5))
                tutor("답")
                service.chat(2002L, "최근 대화")

                clock.advance(Duration.ofMinutes(16))
                claude.reply("- 요약")
                val closed = service.closeIdle()

                assertEquals(listOf(ConversationService.ClosedSession(thread, "- 요약")), closed)
                assertEquals(ConversationStatus.ACTIVE, sessions.findByDiscordThreadId(2002L)?.status)
                assertEquals(clock.instant(), session().closedAt)
            }
    }

class MutableClock(
    private var now: Instant,
    private val zone: ZoneId = ZoneId.of("Asia/Seoul"),
) : Clock() {
    fun advance(duration: Duration) {
        now = now.plus(duration)
    }

    override fun getZone(): ZoneId = zone

    override fun withZone(zone: ZoneId): Clock = MutableClock(now, zone)

    override fun instant(): Instant = now
}
