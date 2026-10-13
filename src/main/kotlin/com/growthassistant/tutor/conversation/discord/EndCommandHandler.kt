package com.growthassistant.tutor.conversation.discord

import com.growthassistant.core.discord.DiscordChannel
import com.growthassistant.core.discord.DiscordChannels
import com.growthassistant.core.discord.PendingReply
import com.growthassistant.core.discord.SlashCommandHandler
import com.growthassistant.tutor.conversation.ConversationService
import com.growthassistant.tutor.conversation.ConversationService.EndResult
import dev.minn.jda.ktx.coroutines.await
import net.dv8tion.jda.api.entities.channel.concrete.ThreadChannel
import net.dv8tion.jda.api.events.interaction.command.SlashCommandInteractionEvent
import net.dv8tion.jda.api.interactions.commands.build.Commands
import net.dv8tion.jda.api.interactions.commands.build.SlashCommandData
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty
import org.springframework.stereotype.Component
import java.time.Clock

/** 튜터 스레드에서 `/end`: 대화를 요약하고 닫는다. */
@Component
@ConditionalOnBooleanProperty("growth.discord.enabled")
class EndCommandHandler(
    private val channels: DiscordChannels,
    private val conversations: ConversationService,
    private val clock: Clock,
) : SlashCommandHandler {
    override val command: SlashCommandData = Commands.slash("end", "튜터 대화를 요약하고 끝냅니다")

    override suspend fun handle(event: SlashCommandInteractionEvent) {
        val channel = event.channel
        if (channel !is ThreadChannel || !channels.isChannel(DiscordChannel.TUTOR, channel.parentChannel.idLong)) {
            event.reply("`#튜터`의 대화 스레드 안에서 쓸 수 있습니다.").setEphemeral(true).await()
            return
        }
        val pending = PendingReply.defer(event, clock)
        val text =
            when (val result = conversations.end(channel.idLong)) {
                is EndResult.Ended -> closedMessage("대화를 종료했습니다.", result.summary)
                EndResult.AlreadyClosed -> "이미 종료된 대화입니다."
                EndResult.NotFound -> "이 스레드에는 진행 중인 대화가 없습니다."
            }
        pending.complete(text)
    }
}

internal fun closedMessage(
    headline: String,
    summary: String?,
): String = if (summary == null) headline else "$headline\n\n**요약**\n$summary"
