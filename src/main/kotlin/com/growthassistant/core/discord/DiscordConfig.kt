package com.growthassistant.core.discord

import dev.minn.jda.ktx.jdabuilder.light
import net.dv8tion.jda.api.JDA
import net.dv8tion.jda.api.entities.Message
import net.dv8tion.jda.api.requests.GatewayIntent
import net.dv8tion.jda.api.utils.messages.MessageRequest
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import java.util.EnumSet

@Configuration(proxyBeanMethods = false)
@ConditionalOnBooleanProperty("growth.discord.enabled")
class DiscordConfig {
    @Bean(destroyMethod = "shutdown")
    fun jda(properties: DiscordProperties): JDA {
        // LLM 응답에 @everyone 같은 멘션이 섞여도 알림이 가지 않게 한다.
        MessageRequest.setDefaultMentions(EnumSet.noneOf(Message.MentionType::class.java))
        return light(
            properties.token,
            enableCoroutines = true,
            intents = listOf(GatewayIntent.GUILD_MESSAGES, GatewayIntent.MESSAGE_CONTENT),
        ).awaitReady()
    }
}
