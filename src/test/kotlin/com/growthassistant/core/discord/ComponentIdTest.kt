package com.growthassistant.core.discord

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ComponentIdTest {
    @Test
    fun `인코딩한 값을 그대로 되돌린다`() {
        val id = ComponentId("quiz", "answer", listOf("42", "B"))

        assertEquals("quiz:answer:42:B", id.encode())
        assertEquals(id, ComponentId.decode(id.encode()))
    }

    @Test
    fun `인자가 없어도 된다`() {
        assertEquals(ComponentId("tutor", "start"), ComponentId.decode("tutor:start"))
    }

    @Test
    fun `규칙에 맞지 않는 ID는 null이다`() {
        assertNull(ComponentId.decode("legacy-button"))
        assertNull(ComponentId.decode(":start"))
        assertNull(ComponentId.decode("tutor:"))
    }

    @Test
    fun `구분자가 들어간 값과 100자를 넘는 ID는 만들 수 없다`() {
        assertThrows<IllegalArgumentException> { ComponentId("quiz", "answer", listOf("a:b")) }
        assertThrows<IllegalArgumentException> { ComponentId("quiz", "answer", listOf("x".repeat(100))).encode() }
    }
}
