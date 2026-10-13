package com.growthassistant.core.discord

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals

class ChannelPlanTest {
    private val existing = listOf(ChannelRef(1, "일반"), ChannelRef(2, "튜터"), ChannelRef(3, "내-튜터"))

    @Test
    fun `저장된 ID의 채널이 있으면 이름이 바뀌었어도 그 채널을 쓴다`() {
        assertEquals(ChannelPlan.Use(3), ChannelPlan.decide(DiscordChannel.TUTOR, storedId = 3, existing))
    }

    @Test
    fun `저장된 채널이 지워졌으면 같은 이름의 채널을 쓴다`() {
        assertEquals(ChannelPlan.Use(2), ChannelPlan.decide(DiscordChannel.TUTOR, storedId = 99, existing))
    }

    @Test
    fun `저장된 ID도 같은 이름도 없으면 새로 만든다`() {
        assertEquals(ChannelPlan.Create, ChannelPlan.decide(DiscordChannel.ADMIN, storedId = null, existing))
    }
}
