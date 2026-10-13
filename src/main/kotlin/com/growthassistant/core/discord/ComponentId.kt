package com.growthassistant.core.discord

/**
 * 버튼·선택 메뉴의 custom_id 규칙: `모듈:동작:인자1:인자2…` (Discord 제한 100자).
 * 예: `quiz:answer:42:B`. 처리기는 [module]로 고르고 [action]과 [args]로 해석한다.
 */
data class ComponentId(
    val module: String,
    val action: String,
    val args: List<String> = emptyList(),
) {
    init {
        require(module.isNotEmpty() && action.isNotEmpty()) { "module과 action은 비어 있을 수 없다" }
        require((listOf(module, action) + args).none { SEPARATOR in it }) { "'$SEPARATOR'는 쓸 수 없다: $this" }
    }

    fun encode(): String {
        val encoded = (listOf(module, action) + args).joinToString(SEPARATOR.toString())
        require(encoded.length <= MAX_LENGTH) { "custom_id가 ${MAX_LENGTH}자를 넘는다: $encoded" }
        return encoded
    }

    companion object {
        const val MAX_LENGTH = 100
        private const val SEPARATOR = ':'

        /** 이 규칙을 따르지 않는 ID면 null. */
        fun decode(raw: String): ComponentId? {
            val parts = raw.split(SEPARATOR)
            if (parts.size < 2 || parts[0].isEmpty() || parts[1].isEmpty()) return null
            return ComponentId(parts[0], parts[1], parts.drop(2))
        }
    }
}
