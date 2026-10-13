package com.growthassistant.core.llm

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.future.await
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.springframework.stereotype.Component
import java.nio.file.Path
import kotlin.time.Duration

data class ProcessResult(
    val exitCode: Int,
    val stdout: String,
    val stderr: String,
)

/** 외부 프로세스 실행. 테스트에서 실제 CLI 없이 바꿔 끼우려고 분리했다. */
fun interface ClaudeProcessRunner {
    /** [timeout]을 넘기면 프로세스를 강제 종료하고 [ClaudeErrorType.TIMEOUT]을 던진다. */
    suspend fun run(
        command: List<String>,
        stdin: String,
        workDir: Path,
        timeout: Duration,
    ): ProcessResult
}

@Component
class OsClaudeProcessRunner : ClaudeProcessRunner {
    override suspend fun run(
        command: List<String>,
        stdin: String,
        workDir: Path,
        timeout: Duration,
    ): ProcessResult =
        withContext(Dispatchers.IO) {
            val process = ProcessBuilder(command).directory(workDir.toFile()).start()
            coroutineScope {
                // 출력을 읽는 쪽이 막혀 있으면 프로세스가 파이프 버퍼에서 멈추므로 동시에 읽는다.
                val stdout = async { process.inputStream.bufferedReader().use { it.readText() } }
                val stderr = async { process.errorStream.bufferedReader().use { it.readText() } }
                try {
                    process.outputStream.bufferedWriter().use { it.write(stdin) }
                    withTimeoutOrNull(timeout) { process.onExit().await() }
                        ?: throw ClaudeException(ClaudeErrorType.TIMEOUT, "${timeout}을 넘겨 프로세스를 종료했다")
                    ProcessResult(process.exitValue(), stdout.await(), stderr.await())
                } finally {
                    // 타임아웃·취소 시 프로세스를 끝내야 출력 스트림이 닫히고 읽기 작업도 끝난다.
                    if (process.isAlive) {
                        process.descendants().forEach { it.destroyForcibly() }
                        process.destroyForcibly()
                    }
                }
            }
        }
}
