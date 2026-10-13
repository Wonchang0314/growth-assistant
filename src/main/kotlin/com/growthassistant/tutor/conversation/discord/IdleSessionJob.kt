package com.growthassistant.tutor.conversation.discord

import com.growthassistant.core.discord.MessageSplitter
import com.growthassistant.tutor.conversation.ConversationService
import dev.minn.jda.ktx.coroutines.await
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import net.dv8tion.jda.api.JDA
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

/** 1분마다 유휴 세션을 닫고 그 스레드에 요약을 남긴다. */
@Component
@ConditionalOnBooleanProperty("growth.discord.enabled")
class IdleSessionJob(
    private val conversations: ConversationService,
    private val jda: JDA,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Scheduled(fixedDelayString = "PT1M", initialDelayString = "PT1M")
    fun run() =
        runBlocking {
            for (closed in conversations.closeIdle()) {
                val minutes = ConversationService.IDLE_TIMEOUT.toMinutes()
                val text = closedMessage("${minutes}분 동안 대화가 없어 종료했습니다.", closed.summary)
                try {
                    val thread = jda.getThreadChannelById(closed.threadId) ?: continue
                    MessageSplitter.split(text).forEach { thread.sendMessage(it).await() }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    log.warn("유휴 종료 안내 실패: thread={}", closed.threadId, e)
                }
            }
        }
}
