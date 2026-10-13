package com.growthassistant.tutor.conversation.discord

import com.growthassistant.core.discord.DiscordChannel
import com.growthassistant.core.discord.DiscordChannels
import com.growthassistant.core.discord.GuildMessageHandler
import com.growthassistant.core.discord.PendingReply
import com.growthassistant.tutor.conversation.ConversationService
import dev.minn.jda.ktx.coroutines.await
import net.dv8tion.jda.api.entities.Message
import net.dv8tion.jda.api.entities.MessageType
import net.dv8tion.jda.api.entities.channel.concrete.ThreadChannel
import net.dv8tion.jda.api.events.message.MessageReceivedEvent
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty
import org.springframework.stereotype.Component

/**
 * `#튜터`에 쓴 메시지는 그 메시지로 스레드를 만들어 대화를 시작하고,
 * `#튜터` 아래 스레드에 쓴 메시지는 그 스레드의 대화로 이어 간다 (설계 문서 7.2).
 */
@Component
@ConditionalOnBooleanProperty("growth.discord.enabled")
class TutorMessageHandler(
    private val channels: DiscordChannels,
    private val conversations: ConversationService,
) : GuildMessageHandler {
    override suspend fun handle(event: MessageReceivedEvent) {
        val message = event.message
        if (message.type != MessageType.DEFAULT && message.type != MessageType.INLINE_REPLY) return
        val content = message.contentRaw.trim()
        if (content.isEmpty()) return

        val channel = event.channel
        when {
            channels.isChannel(DiscordChannel.TUTOR, channel.idLong) -> start(message, content)
            channel is ThreadChannel && channels.isChannel(DiscordChannel.TUTOR, channel.parentChannel.idLong) -> answer(channel, content)
        }
    }

    private suspend fun start(
        message: Message,
        content: String,
    ) {
        val thread = message.createThreadChannel(ConversationService.topicOf(content)).await()
        answer(thread, content)
    }

    private suspend fun answer(
        thread: ThreadChannel,
        content: String,
    ) {
        val pending = PendingReply.post(thread)
        pending.complete(conversations.chat(thread.idLong, content))
        conversations.compact(thread.idLong)
    }
}
