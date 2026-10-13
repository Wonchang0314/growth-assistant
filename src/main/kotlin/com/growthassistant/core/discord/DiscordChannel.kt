package com.growthassistant.core.discord

/** 봇이 쓰는 채널. 시작할 때 이름으로 찾고 없으면 만든다 (설계 문서 7.6). */
enum class DiscordChannel(
    val channelName: String,
) {
    REVIEW_QUIZ("복습-퀴즈"),
    TUTOR("튜터"),
    REPORT("리포트"),
    CONCEPT_ADMIN("개념-관리"),
    ADMIN("관리"),
    ;

    /** 채널 ID를 저장하는 `app_setting` 키. */
    val settingKey: String get() = "discord.channel.${name.lowercase()}"
}

data class ChannelRef(
    val id: Long,
    val name: String,
)

sealed interface ChannelPlan {
    data class Use(
        val id: Long,
    ) : ChannelPlan

    data object Create : ChannelPlan

    companion object {
        /**
         * 저장된 ID의 채널이 남아 있으면 그대로 쓴다(사용자가 이름을 바꿨어도).
         * 없으면 같은 이름의 채널을 쓰고, 그것도 없으면 새로 만든다.
         */
        fun decide(
            channel: DiscordChannel,
            storedId: Long?,
            existing: List<ChannelRef>,
        ): ChannelPlan {
            existing.firstOrNull { it.id == storedId }?.let { return Use(it.id) }
            existing.firstOrNull { it.name == channel.channelName }?.let { return Use(it.id) }
            return Create
        }
    }
}
