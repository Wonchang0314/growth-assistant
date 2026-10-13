package com.growthassistant.core.llm

import org.springframework.boot.context.properties.ConfigurationProperties
import java.nio.file.Path
import java.time.Duration

@ConfigurationProperties("growth.claude")
data class ClaudeProperties(
    /** `claude` 실행 파일. OS마다 경로·이름이 다를 수 있다. */
    val executable: String,
    /** CLI를 실행할 빈 디렉터리. 이 디렉터리와 상위 디렉터리에 CLAUDE.md가 없어야 한다. */
    val workDir: Path,
    val maxConcurrency: Int,
    val purposes: Map<LlmPurpose, PurposeProperties>,
) {
    init {
        val missing = LlmPurpose.entries - purposes.keys
        require(missing.isEmpty()) { "growth.claude.purposes에 설정이 없는 용도: $missing" }
        require(maxConcurrency > 0) { "growth.claude.max-concurrency는 1 이상이어야 한다" }
    }

    fun of(purpose: LlmPurpose): PurposeProperties = purposes.getValue(purpose)

    data class PurposeProperties(
        val model: String,
        val timeout: Duration,
        /** true면 WebSearch·WebFetch 도구를 허용한다. */
        val webAccess: Boolean = false,
    )
}
