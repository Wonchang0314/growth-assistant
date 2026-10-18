import { z } from 'zod';

/** 판단 사례 상태 (ADR-0021). 게이트를 다 통과하면 ACTIVE, 끝내 걸리면 PENDING으로 두고 사람이 검토한다. */
export const DECISION_CASE_STATUSES = ['PENDING', 'ACTIVE', 'REJECTED'] as const;
export type DecisionCaseStatus = (typeof DECISION_CASE_STATUSES)[number];

/**
 * 판단 사례 종류 (ADR-0026). 경험 사례는 카드에 있는 사실만 쓰고, 가정 사례는 카드의 개념을 살려 상황·조건을 새로 가정한다.
 * 경험 사례가 끝내 검증에 걸리면 가정 사례로 자동 폴백한다.
 */
export const DECISION_CASE_KINDS = ['EXPERIENCE', 'HYPOTHETICAL'] as const;
export type DecisionCaseKind = (typeof DECISION_CASE_KINDS)[number];

/** 경험 카드를 판단 사례 후보로 골랐는지 (선별 결과). 아직 보지 않은 카드는 null이다. */
export const CASE_SCREENS = ['DECISION', 'NO_DECISION'] as const;
export type CaseScreen = (typeof CASE_SCREENS)[number];

/**
 * 판단 사례 본문 (설계 문서 5.2, 7.1). 경험 카드에서 회사 맥락을 걷어낸 버전이다.
 * 추상화 응답의 모양이기도 해서 필드 설명이 프롬프트로 쓰인다.
 */
export const decisionCaseBodySchema = z.object({
  situation: z
    .string()
    .min(1)
    .describe('상황: 어떤 시스템에서 무엇을 결정해야 했나. 특정 조직을 가리키는 이름 없이 역할 설명으로 쓴다'),
  constraints: z.array(z.string()).describe('제약: 선택을 좁힌 조건. 예: "다운타임 불가", "구버전 앱이 함께 떠 있음"'),
  // 선택지에는 설명을 달지 않는다. 고른·버린 이유를 묻는 설명이 있으면 Sonnet의 안전 장치(reasoning_extraction)에
  // 걸려 응답을 받지 못했다(2026-10-18, 카드 4장 중 3장). 같은 규칙은 시스템 프롬프트(case-abstraction.md)에 둔다.
  options: z.array(z.object({ text: z.string(), chosen: z.boolean(), reason: z.string() })).min(2),
  decision: z.string().min(1).describe('결정: 최종으로 무엇을 했나'),
  rationale: z.string().min(1).describe('근거: 회사 사정이 아니라 일반 원칙으로 쓴 이유'),
  outcome: z.string().describe('결과: 결정 뒤 무엇이 어떻게 됐나'),
  invariants: z
    .array(z.string())
    .min(1)
    .describe('불변 조건: 도메인을 바꿔도 반드시 남아야 하는 사실. 이것이 바뀌면 정답이 달라진다'),
});
export type DecisionCaseBody = z.infer<typeof decisionCaseBodySchema>;
