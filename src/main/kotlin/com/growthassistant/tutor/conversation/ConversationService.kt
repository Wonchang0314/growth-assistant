package com.growthassistant.tutor.conversation

import com.growthassistant.core.llm.ClaudeClient
import com.growthassistant.core.llm.ClaudeErrorType
import com.growthassistant.core.llm.ClaudeException
import com.growthassistant.core.llm.ClaudeRequest
import com.growthassistant.core.llm.LlmPurpose
import com.growthassistant.core.llm.completeStructured
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Duration
import java.time.format.DateTimeFormatter
import java.util.concurrent.ConcurrentHashMap

/**
 * 튜터링 대화 유스케이스 (설계 문서 7.2). Discord 스레드 ID로 세션을 찾는다.
 *
 * 맥락은 "요약 + 아직 요약되지 않은 메시지"다. 요약되지 않은 메시지가 [KEEP_RECENT] + [COMPACT_BATCH]개 이상 쌓이면
 * [compact]가 오래된 [COMPACT_BATCH]개 이상을 요약에 합친다. 그래서 원문으로 넣는 메시지는 항상 8~15개다.
 *
 * 같은 세션의 작업은 세션마다 하나씩 차례로 처리한다(빠르게 연달아 보낸 메시지, 유휴 종료와의 경합).
 */
@Service
class ConversationService(
    private val sessions: ConversationSessionRepository,
    private val messages: ConversationMessageRepository,
    private val claude: ClaudeClient,
    private val clock: Clock,
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val locks = ConcurrentHashMap<Long, Mutex>()

    /** 스레드의 메시지에 답한다. 세션이 없으면 이 메시지로 시작한다. 종료된 세션이면 안내문을 돌려준다. */
    suspend fun chat(
        threadId: Long,
        message: String,
    ): String =
        lock(threadId).withLock {
            val session =
                db { sessions.findByDiscordThreadId(threadId) }
                    ?: db { sessions.save(ConversationSession(threadId, topicOf(message), clock.instant())) }
            if (session.status == ConversationStatus.CLOSED) return CLOSED_NOTICE

            val context = db { unsummarized(session) }
            db { messages.save(ConversationMessage(session.id!!, MessageRole.USER, message, clock.instant())) }
            val request =
                ClaudeRequest(
                    LlmPurpose.TUTOR_CHAT,
                    ConversationPrompts.tutor(session.topic, session.summary, context, message),
                    systemPrompt = ConversationPrompts.TUTOR_SYSTEM,
                )
            val reply =
                try {
                    claude.completeStructured<TutorReply>(request, ConversationPrompts.TUTOR_REPLY_SCHEMA)
                } catch (e: ClaudeException) {
                    log.warn("튜터 응답 실패: thread={} {}", threadId, e.type)
                    return notice(e)
                }
            db {
                messages.save(ConversationMessage(session.id!!, MessageRole.TUTOR, reply.reply, clock.instant()))
                if (reply.answerRevealed && !session.answerRevealed) {
                    session.markAnswerRevealed()
                    sessions.save(session)
                }
            }
            ConversationPrompts.render(reply)
        }

    /** 요약되지 않은 메시지가 충분히 쌓였으면 오래된 것을 요약에 합친다. 응답을 보낸 뒤 부른다. 실패하면 다음 기회로 미룬다. */
    suspend fun compact(threadId: Long) {
        lock(threadId).withLock {
            val session = db { sessions.findByDiscordThreadId(threadId) } ?: return
            if (session.status != ConversationStatus.ACTIVE) return
            val older = db { unsummarized(session) }.dropLast(KEEP_RECENT)
            if (older.size < COMPACT_BATCH) return
            val summary = summarize(session.summary, older) ?: return
            session.updateSummary(summary, older.last().id!!)
            db { sessions.save(session) }
        }
    }

    /** `/end`. */
    suspend fun end(threadId: Long): EndResult =
        lock(threadId).withLock {
            val session = db { sessions.findByDiscordThreadId(threadId) } ?: return EndResult.NotFound
            if (session.status == ConversationStatus.CLOSED) return EndResult.AlreadyClosed
            EndResult.Ended(close(session))
        }

    /** [IDLE_TIMEOUT] 동안 메시지가 없는 세션을 닫는다. 닫은 세션을 돌려준다. */
    suspend fun closeIdle(): List<ClosedSession> {
        val active = db { sessions.findAllByStatus(ConversationStatus.ACTIVE) }
        return active.mapNotNull { candidate ->
            lock(candidate.discordThreadId).withLock {
                // 기다리는 동안 메시지가 오거나 종료됐을 수 있어 다시 읽는다.
                val session = db { sessions.findById(candidate.id!!).orElse(null) } ?: return@withLock null
                if (session.status != ConversationStatus.ACTIVE) return@withLock null
                val lastActivity = db { messages.findTopBySessionIdOrderByIdDesc(session.id!!) }?.createdAt ?: session.startedAt
                if (Duration.between(lastActivity, clock.instant()) < IDLE_TIMEOUT) return@withLock null
                ClosedSession(session.discordThreadId, close(session))
            }
        }
    }

    /** 남은 메시지를 요약에 합치고 닫는다. 요약에 실패해도 닫는다. 호출자가 잠금을 잡고 있어야 한다. */
    private suspend fun close(session: ConversationSession): String? {
        val pending = db { unsummarized(session) }
        val summary = if (pending.isEmpty()) session.summary else summarize(session.summary, pending) ?: session.summary
        session.close(summary, clock.instant())
        db { sessions.save(session) }
        locks.remove(session.discordThreadId)
        return summary
    }

    private suspend fun summarize(
        previous: String?,
        messages: List<ConversationMessage>,
    ): String? =
        try {
            claude
                .complete(
                    ClaudeRequest(
                        LlmPurpose.SESSION_SUMMARY,
                        ConversationPrompts.summary(previous, messages),
                        systemPrompt = ConversationPrompts.SUMMARY_SYSTEM,
                    ),
                ).trim()
                .ifEmpty { null }
        } catch (e: ClaudeException) {
            log.warn("세션 요약 실패: {}", e.type)
            null
        }

    private fun unsummarized(session: ConversationSession): List<ConversationMessage> =
        messages.findAllBySessionIdAndIdGreaterThanOrderByIdAsc(session.id!!, session.summarizedMessageId ?: 0)

    private fun notice(e: ClaudeException): String =
        when (e.type) {
            ClaudeErrorType.AUTH -> {
                "Claude 로그인이 만료되어 답할 수 없습니다. `#관리` 채널을 확인해 주세요."
            }

            ClaudeErrorType.RATE_LIMIT -> {
                val at = e.resetsAt?.let { " ${RESET_FORMAT.format(it.atZone(clock.zone))} 이후에" } ?: " 잠시 뒤에"
                "Claude 사용량 한도에 도달했습니다.$at 다시 보내 주세요."
            }

            else -> {
                "답을 받지 못했습니다. 잠시 뒤 다시 보내 주세요."
            }
        }

    private fun lock(threadId: Long): Mutex = locks.computeIfAbsent(threadId) { Mutex() }

    private suspend fun <T> db(block: () -> T): T = withContext(Dispatchers.IO) { block() }

    sealed interface EndResult {
        data class Ended(
            val summary: String?,
        ) : EndResult

        data object AlreadyClosed : EndResult

        data object NotFound : EndResult
    }

    data class ClosedSession(
        val threadId: Long,
        val summary: String?,
    )

    companion object {
        val IDLE_TIMEOUT: Duration = Duration.ofMinutes(20)
        const val KEEP_RECENT = 8
        const val COMPACT_BATCH = 8
        const val CLOSED_NOTICE = "이 대화는 종료되었습니다. `#튜터` 채널에 새 메시지를 남기면 새 대화를 시작합니다."
        private const val TOPIC_MAX = 100
        private val RESET_FORMAT = DateTimeFormatter.ofPattern("M월 d일 HH:mm")

        /** 첫 메시지의 첫 줄을 주제로 쓴다. 스레드 이름에도 쓴다. */
        fun topicOf(message: String): String =
            message
                .lineSequence()
                .map { it.trim() }
                .firstOrNull { it.isNotEmpty() }
                ?.take(TOPIC_MAX)
                ?: "튜터 대화"
    }
}
