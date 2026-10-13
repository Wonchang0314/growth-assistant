package com.growthassistant.core.discord

import com.growthassistant.core.setting.AppSetting
import com.growthassistant.core.setting.AppSettingRepository
import dev.minn.jda.ktx.coroutines.await
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import net.dv8tion.jda.api.JDA
import net.dv8tion.jda.api.entities.Guild
import net.dv8tion.jda.api.entities.channel.concrete.TextChannel
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty
import org.springframework.stereotype.Component
import java.util.concurrent.ConcurrentHashMap

/** 봇 채널의 ID를 관리한다. 시작할 때 [ensureAll]로 채널을 찾거나 만들고 ID를 `app_setting`에 저장한다. */
@Component
@ConditionalOnBooleanProperty("growth.discord.enabled")
class DiscordChannels(
    private val jda: JDA,
    private val settings: AppSettingRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val ids = ConcurrentHashMap<DiscordChannel, Long>()

    suspend fun ensureAll(guild: Guild) {
        val existing = guild.textChannels.map { ChannelRef(it.idLong, it.name) }
        for (channel in DiscordChannel.entries) {
            val storedId = withContext(Dispatchers.IO) { settings.findById(channel.settingKey).orElse(null) }?.value?.toLongOrNull()
            val id =
                when (val plan = ChannelPlan.decide(channel, storedId, existing)) {
                    is ChannelPlan.Use -> {
                        plan.id
                    }

                    ChannelPlan.Create -> {
                        guild.createTextChannel(channel.channelName).await().idLong.also {
                            log.info("채널을 만들었다: #{} ({})", channel.channelName, it)
                        }
                    }
                }
            if (id != storedId) withContext(Dispatchers.IO) { settings.save(AppSetting(channel.settingKey, id.toString())) }
            ids[channel] = id
        }
    }

    fun textChannel(channel: DiscordChannel): TextChannel {
        val id = checkNotNull(ids[channel]) { "채널이 아직 준비되지 않았다: $channel" }
        return checkNotNull(jda.getTextChannelById(id)) { "채널을 찾을 수 없다: #${channel.channelName} ($id)" }
    }

    fun isChannel(
        channel: DiscordChannel,
        channelId: Long,
    ): Boolean = ids[channel] == channelId
}
