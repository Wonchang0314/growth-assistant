package com.growthassistant.core.discord

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class MessageSplitterTest {
    @Test
    fun `제한 이하면 그대로 한 조각이다`() {
        assertEquals(listOf("짧은 답"), MessageSplitter.split("짧은 답"))
    }

    @Test
    fun `줄바꿈 경계에서 나누고 모든 조각이 제한 이하다`() {
        val paragraphs = (1..30).map { "문단 $it " + "가".repeat(90) }
        val text = paragraphs.joinToString("\n")

        val chunks = MessageSplitter.split(text, limit = 500)

        assertTrue(chunks.all { it.length <= 500 })
        assertEquals(paragraphs, chunks.flatMap { it.lines() })
    }

    @Test
    fun `줄바꿈이 없으면 공백에서 나눈다`() {
        val words = (1..200).map { "단어$it" }

        val chunks = MessageSplitter.split(words.joinToString(" "), limit = 100)

        assertTrue(chunks.all { it.length <= 100 })
        assertEquals(words, chunks.flatMap { it.split(" ") })
    }

    @Test
    fun `코드 블록이 나뉘면 닫고 같은 언어로 다시 연다`() {
        val code = (1..40).joinToString("\n") { "    val x$it = $it" }
        val text = "설명\n```kotlin\n$code\n```\n끝"

        val chunks = MessageSplitter.split(text, limit = 300)

        assertTrue(chunks.size > 1)
        assertTrue(chunks.all { it.length <= 300 })
        chunks.dropLast(1).forEach { assertTrue(it.endsWith("\n```"), "닫히지 않은 조각: $it") }
        chunks.drop(1).dropLast(1).forEach { assertTrue(it.startsWith("```kotlin\n"), "다시 열지 않은 조각: $it") }
        // 들여쓰기가 보존된다.
        assertTrue(chunks.joinToString("\n").contains("    val x40 = 40"))
    }

    @Test
    fun `구분할 곳이 없으면 글자 단위로 자르되 이모지를 가르지 않는다`() {
        val text = "😀".repeat(200)

        val chunks = MessageSplitter.split(text, limit = 101)

        assertTrue(chunks.all { it.length <= 101 && !it.last().isHighSurrogate() })
        assertEquals(text, chunks.joinToString(""))
    }
}
