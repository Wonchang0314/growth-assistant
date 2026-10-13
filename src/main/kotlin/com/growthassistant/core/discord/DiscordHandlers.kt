package com.growthassistant.core.discord

import net.dv8tion.jda.api.events.interaction.command.SlashCommandInteractionEvent
import net.dv8tion.jda.api.events.message.MessageReceivedEvent
import net.dv8tion.jda.api.interactions.commands.build.SlashCommandData

/*
 * 기능 모듈의 Discord 입력 어댑터가 구현해 빈으로 등록한다 (ADR-0013).
 * DiscordGateway가 모아서 명령을 등록하고, 소유자 검사를 통과한 이벤트만 넘긴다.
 */

interface SlashCommandHandler {
    /** 서버 전용 명령으로 등록할 정의. 이름은 처리기마다 달라야 한다. */
    val command: SlashCommandData

    suspend fun handle(event: SlashCommandInteractionEvent)
}

interface GuildMessageHandler {
    /** 소유자가 개인 서버에 쓴 모든 메시지를 받는다. 자기와 관계없는 메시지는 무시한다. */
    suspend fun handle(event: MessageReceivedEvent)
}
