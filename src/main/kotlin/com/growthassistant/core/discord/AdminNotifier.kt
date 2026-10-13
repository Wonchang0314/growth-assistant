package com.growthassistant.core.discord

import dev.minn.jda.ktx.coroutines.await
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty
import org.springframework.stereotype.Component

/** `#관리` 채널 알림 포트 (인증 만료, 수집 실패 등). 유스케이스는 이 인터페이스에만 의존한다. */
fun interface AdminNotifier {
    suspend fun notify(message: String)
}

@Component
@ConditionalOnBooleanProperty("growth.discord.enabled")
class DiscordAdminNotifier(
    private val channels: DiscordChannels,
) : AdminNotifier {
    override suspend fun notify(message: String) {
        val channel = channels.textChannel(DiscordChannel.ADMIN)
        MessageSplitter.split(message).forEach { channel.sendMessage(it).await() }
    }
}

/** Discord를 끈 실행(테스트 프로필)에서는 로그로만 남긴다. */
@Component
@ConditionalOnBooleanProperty("growth.discord.enabled", havingValue = false)
class LoggingAdminNotifier : AdminNotifier {
    private val log = LoggerFactory.getLogger(javaClass)

    override suspend fun notify(message: String) {
        log.warn("[관리 알림] {}", message)
    }
}
