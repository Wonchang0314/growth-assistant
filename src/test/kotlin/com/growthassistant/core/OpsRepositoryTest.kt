package com.growthassistant.core

import com.growthassistant.TestcontainersConfiguration
import com.growthassistant.core.llm.LlmCallLog
import com.growthassistant.core.llm.LlmCallLogRepository
import com.growthassistant.core.setting.AppSetting
import com.growthassistant.core.setting.AppSettingRepository
import jakarta.persistence.EntityManager
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase
import org.springframework.context.annotation.Import
import java.time.Instant
import kotlin.test.assertEquals

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestcontainersConfiguration::class)
class OpsRepositoryTest
    @Autowired
    constructor(
        private val callLogs: LlmCallLogRepository,
        private val settings: AppSettingRepository,
        private val em: EntityManager,
    ) {
        @Test
        fun `실패한 LLM 호출도 오류 내용과 함께 기록한다`() {
            val saved =
                callLogs.save(
                    LlmCallLog(
                        purpose = "TUTOR_CHAT",
                        model = "sonnet",
                        durationMs = 1500,
                        success = false,
                        inputChars = 1200,
                        outputChars = 0,
                        error = "RATE_LIMIT: usage limit reached",
                        createdAt = Instant.parse("2026-10-13T00:00:00Z"),
                    ),
                )
            em.flush()
            em.clear()

            val found = callLogs.findById(saved.id!!).orElseThrow()
            assertEquals(false, found.success)
            assertEquals("RATE_LIMIT: usage limit reached", found.error)
        }

        @Test
        fun `같은 키로 저장하면 값을 덮어쓴다`() {
            settings.save(AppSetting("discord.channel.tutor", "1"))
            em.flush()
            em.clear()

            settings.save(AppSetting("discord.channel.tutor", "2"))
            em.flush()
            em.clear()

            assertEquals("2", settings.findById("discord.channel.tutor").orElseThrow().value)
            assertEquals(1, settings.count())
        }
    }
