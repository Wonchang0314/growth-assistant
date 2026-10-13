package com.growthassistant.core.llm

import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import java.time.Clock
import java.time.Duration
import kotlin.test.assertEquals

/**
 * 실제 `claude` CLI를 호출한다. 구독 사용량을 쓰므로 기본으로 건너뛴다.
 * CLI를 올리거나 다른 기기에서 처음 실행할 때 확인한다: `CLAUDE_LIVE=1 ./gradlew test --tests '*ClaudeCliLiveTest'`
 */
@EnabledIfEnvironmentVariable(named = "CLAUDE_LIVE", matches = "1")
class ClaudeCliLiveTest {
    @TempDir
    lateinit var workDir: Path

    data class Answer(
        val answer: Int,
    )

    @Test
    fun `실제 CLI로 텍스트와 구조화된 응답을 받는다`() =
        runBlocking {
            val client =
                ClaudeCliClient(
                    properties =
                        ClaudeProperties(
                            executable = System.getenv("CLAUDE_EXECUTABLE") ?: "claude",
                            workDir = workDir,
                            maxConcurrency = 2,
                            purposes =
                                LlmPurpose.entries.associateWith {
                                    ClaudeProperties.PurposeProperties(
                                        "haiku",
                                        Duration.ofSeconds(90),
                                    )
                                },
                        ),
                    runner = OsClaudeProcessRunner(),
                    parser = ClaudeStreamParser(ClaudeFixtures.objectMapper),
                    callLogs = mockk(relaxed = true) { every { save(any()) } answers { firstArg() } },
                    objectMapper = ClaudeFixtures.objectMapper,
                    clock = Clock.systemUTC(),
                )

            val text = client.complete(ClaudeRequest(LlmPurpose.SESSION_SUMMARY, "1+1은? 숫자만 답한다."))
            val structured =
                client.completeStructured<Answer>(
                    ClaudeRequest(LlmPurpose.SESSION_SUMMARY, "17*3은?"),
                    """{"type":"object","properties":{"answer":{"type":"integer"}},"required":["answer"],"additionalProperties":false}""",
                )

            assertEquals("2", text.trim())
            assertEquals(51, structured.answer)
        }
}
