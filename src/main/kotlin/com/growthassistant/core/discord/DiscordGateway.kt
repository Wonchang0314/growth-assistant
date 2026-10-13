package com.growthassistant.core.discord

import dev.minn.jda.ktx.coroutines.await
import dev.minn.jda.ktx.events.listener
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import net.dv8tion.jda.api.JDA
import net.dv8tion.jda.api.events.interaction.command.SlashCommandInteractionEvent
import net.dv8tion.jda.api.events.message.MessageReceivedEvent
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component

/** 채널을 준비하고 명령을 등록한 뒤, 소유자의 이벤트만 기능 모듈 처리기로 넘긴다. */
@Component
@ConditionalOnBooleanProperty("growth.discord.enabled")
class DiscordGateway(
    private val jda: JDA,
    private val properties: DiscordProperties,
    private val channels: DiscordChannels,
    private val commandHandlers: List<SlashCommandHandler>,
    private val messageHandlers: List<GuildMessageHandler>,
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val commands = commandHandlers.associateBy { it.command.name }

    init {
        require(commands.size == commandHandlers.size) { "슬래시 명령 이름이 겹친다: ${commandHandlers.map { it.command.name }}" }
    }

    @EventListener(ApplicationReadyEvent::class)
    fun start() =
        runBlocking {
            val guild = checkNotNull(jda.getGuildById(properties.guildId)) { "봇이 서버 ${properties.guildId}에 초대되지 않았다" }
            channels.ensureAll(guild)
            guild.updateCommands().addCommands(commandHandlers.map { it.command }).await()
            jda.listener<SlashCommandInteractionEvent> { onSlashCommand(it) }
            jda.listener<MessageReceivedEvent> { onMessage(it) }
            log.info("Discord 준비 완료: 서버 {}, 명령 {}", guild.name, commands.keys)
        }

    private suspend fun onSlashCommand(event: SlashCommandInteractionEvent) {
        if (event.guild?.idLong != properties.guildId) return
        if (event.user.idLong != properties.ownerUserId) {
            event.reply("이 봇은 소유자만 쓸 수 있습니다.").setEphemeral(true).await()
            return
        }
        val handler = commands[event.name] ?: return
        try {
            handler.handle(event)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            log.error("/{} 처리 실패", event.name, e)
            val notice = "처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요."
            if (event.isAcknowledged) {
                event.hook
                    .sendMessage(notice)
                    .setEphemeral(true)
                    .await()
            } else {
                event.reply(notice).setEphemeral(true).await()
            }
        }
    }

    private suspend fun onMessage(event: MessageReceivedEvent) {
        if (!event.isFromGuild || event.guild.idLong != properties.guildId) return
        if (event.author.isBot || event.isWebhookMessage || event.author.idLong != properties.ownerUserId) return
        for (handler in messageHandlers) {
            try {
                handler.handle(event)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                log.error("메시지 처리 실패: {}", handler.javaClass.simpleName, e)
            }
        }
    }
}
