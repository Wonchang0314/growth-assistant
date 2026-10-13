package com.growthassistant.core.discord

/** Discord 메시지 길이 제한(2000자)에 맞춰 나눈다. 코드 블록 중간에서 나뉘면 닫고 다음 조각에서 다시 연다. */
object MessageSplitter {
    const val LIMIT = 2000
    private const val FENCE = "```"
    private const val CLOSE_FENCE = "\n$FENCE"

    fun split(
        text: String,
        limit: Int = LIMIT,
    ): List<String> {
        require(limit > 50) { "limit이 너무 작다: $limit" }
        val chunks = mutableListOf<String>()
        var reopen = ""
        var rest = text
        while (true) {
            val body = reopen + rest
            if (body.length <= limit) {
                chunks += body
                break
            }
            // 코드 블록을 닫을 자리를 남겨 둔다.
            val (headEnd, restStart) = cutPoint(body, budget = limit - CLOSE_FENCE.length, minIndex = reopen.length + 1)
            val head = body.substring(0, headEnd).trimEnd()
            val openFence = openFenceAtEnd(head)
            chunks += if (openFence != null) head + CLOSE_FENCE else head
            reopen = if (openFence != null) openFence + "\n" else ""
            rest = body.substring(restStart)
        }
        return chunks.filter { it.isNotBlank() }
    }

    /** 줄바꿈 → 공백 → 글자 경계 순으로 자를 곳을 찾는다. 구분 문자는 다음 조각에 넘기지 않는다. */
    private fun cutPoint(
        body: String,
        budget: Int,
        minIndex: Int,
    ): Pair<Int, Int> {
        val window = body.substring(0, budget)
        val floor = maxOf(minIndex, budget / 2)
        for (separator in charArrayOf('\n', ' ')) {
            val index = window.lastIndexOf(separator)
            if (index >= floor) return index to index + 1
        }
        // 서로게이트 쌍(이모지 등)을 가르지 않는다.
        val hard = if (body[budget - 1].isHighSurrogate()) budget - 1 else budget
        return hard to hard
    }

    /** [chunk] 끝에서 코드 블록이 열려 있으면 그 블록의 여는 줄(언어 표기 포함), 아니면 null. */
    private fun openFenceAtEnd(chunk: String): String? {
        var open: String? = null
        chunk.lineSequence().map { it.trim() }.filter { it.startsWith(FENCE) }.forEach { line ->
            open = if (open == null) line else null
        }
        return open
    }
}
