package com.growthassistant.core.llm

import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds
import kotlin.time.measureTime

/** 실제 프로세스를 띄운다. 개발(WSL)·운영(macOS) 모두 `sh`가 있다. */
class OsClaudeProcessRunnerTest {
    @TempDir
    lateinit var workDir: Path

    private val runner = OsClaudeProcessRunner()

    @Test
    fun `표준입력을 넘기고 표준출력·표준오류·종료 코드를 받는다`() =
        runBlocking {
            val result = runner.run(listOf("sh", "-c", "cat; echo err >&2; exit 3"), "안녕", workDir, 5.seconds)

            assertEquals(ProcessResult(3, "안녕", "err\n"), result)
        }

    @Test
    fun `작업 디렉터리에서 실행한다`() =
        runBlocking {
            val result = runner.run(listOf("pwd"), "", workDir, 5.seconds)

            assertEquals(workDir.toRealPath().toString(), result.stdout.trim())
        }

    @Test
    fun `시간을 넘기면 프로세스를 끝내고 TIMEOUT을 던진다`() =
        runBlocking {
            val elapsed =
                measureTime {
                    val e = assertThrows<ClaudeException> { runner.run(listOf("sleep", "30"), "", workDir, 300.milliseconds) }
                    assertEquals(ClaudeErrorType.TIMEOUT, e.type)
                }

            assertTrue(elapsed < 5.seconds, "프로세스를 기다리지 않고 바로 끝나야 한다: $elapsed")
        }
}
