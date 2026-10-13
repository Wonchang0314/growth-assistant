package com.growthassistant

import com.growthassistant.tutor.conversation.TutorReply
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import tools.jackson.databind.ObjectMapper
import kotlin.test.assertEquals

@SpringBootTest
@Import(TestcontainersConfiguration::class)
class GrowthAssistantApplicationTests {
    @Autowired
    lateinit var objectMapper: ObjectMapper

    @Test
    fun contextLoads() {
    }

    @Test
    fun `앱의 ObjectMapper가 Kotlin 응답 DTO를 만든다`() {
        // ClaudeCliClient는 이 ObjectMapper로 structured_output을 바꾼다. Kotlin 모듈이 없으면 실제 실행에서만 실패한다.
        val node = objectMapper.readTree("""{"reply":"답","sources":[{"title":"t","url":"https://e.com"}],"answerRevealed":true}""")

        val reply = objectMapper.treeToValue(node, TutorReply::class.java)

        assertEquals(TutorReply("답", listOf(TutorReply.Source("t", "https://e.com")), answerRevealed = true), reply)
    }
}
