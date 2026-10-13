package com.growthassistant.core.discord

import dev.minn.jda.ktx.coroutines.await
import net.dv8tion.jda.api.entities.Message
import net.dv8tion.jda.api.entities.channel.middleman.MessageChannel
import net.dv8tion.jda.api.events.interaction.command.SlashCommandInteractionEvent
import net.dv8tion.jda.api.exceptions.ErrorResponseException
import net.dv8tion.jda.api.interactions.InteractionHook
import java.time.Clock
import java.time.Duration
import java.time.Instant

/**
 * 오래 걸리는 응답을 위한 자리. 먼저 "생각 중…"을 보여 주고, [complete]로 결과를 채운다.
 * 결과가 2000자를 넘으면 나눠서 이어 보낸다.
 */
sealed class PendingReply {
    suspend fun complete(text: String) {
        val parts = MessageSplitter.split(text).ifEmpty { listOf("(빈 응답)") }
        deliver(parts)
    }

    protected abstract suspend fun deliver(parts: List<String>)

    /** 일반 메시지에 대한 응답: 자리 메시지를 보내고 나중에 수정한다. */
    private class ChannelReply(
        private val placeholder: Message,
    ) : PendingReply() {
        override suspend fun deliver(parts: List<String>) {
            placeholder.editMessage(parts.first()).await()
            parts.drop(1).forEach { placeholder.channel.sendMessage(it).await() }
        }
    }

    /** 슬래시 명령에 대한 응답: 지연 응답 후 원본을 수정한다. 상호작용 토큰(15분)이 만료되면 일반 메시지로 보낸다. */
    private class InteractionReply(
        private val hook: InteractionHook,
        private val channel: MessageChannel,
        private val deferredAt: Instant,
        private val clock: Clock,
    ) : PendingReply() {
        override suspend fun deliver(parts: List<String>) {
            if (isInteractionUsable(deferredAt, clock.instant())) {
                try {
                    hook.editOriginal(parts.first()).await()
                    parts.drop(1).forEach { hook.sendMessage(it).await() }
                    return
                } catch (_: ErrorResponseException) {
                    // 토큰이 예상보다 먼저 만료됐다. 아래에서 일반 메시지로 보낸다.
                }
            }
            parts.forEach { channel.sendMessage(it).await() }
        }
    }

    companion object {
        const val THINKING = "생각 중…"

        /** 상호작용 토큰 유효 시간(15분)보다 여유를 둔다. */
        private val INTERACTION_TTL: Duration = Duration.ofMinutes(14)

        fun isInteractionUsable(
            deferredAt: Instant,
            now: Instant,
        ): Boolean = Duration.between(deferredAt, now) < INTERACTION_TTL

        suspend fun post(channel: MessageChannel): PendingReply = ChannelReply(channel.sendMessage(THINKING).await())

        suspend fun defer(
            event: SlashCommandInteractionEvent,
            clock: Clock,
        ): PendingReply {
            val hook = event.deferReply().await()
            return InteractionReply(hook, event.messageChannel, clock.instant(), clock)
        }
    }
}
