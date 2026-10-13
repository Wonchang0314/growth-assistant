package com.growthassistant.core.discord

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties("growth.discord")
data class DiscordProperties(
    /** false면 Discord에 접속하지 않는다 (테스트 프로필). */
    val enabled: Boolean,
    val token: String,
    /** 봇이 동작할 개인 서버. 다른 서버의 이벤트는 무시한다. */
    val guildId: Long,
    /** 봇 명령을 쓸 수 있는 유일한 사용자. */
    val ownerUserId: Long,
) {
    init {
        if (enabled) {
            require(token.isNotBlank()) { "DISCORD_BOT_TOKEN이 비어 있다" }
            require(guildId > 0) { "DISCORD_GUILD_ID가 비어 있다" }
            require(ownerUserId > 0) { "DISCORD_OWNER_USER_ID가 비어 있다" }
        }
    }
}
