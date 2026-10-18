/** 문제 유형 (ADR-0019). 둘 다 코드가 즉시 채점한다. */
export const QUESTION_TYPES = ['MULTIPLE_CHOICE', 'FILL_BLANK'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/**
 * 출제 각도 (설계 문서 5.4). 개념 문제는 앞의 넷으로 낸다.
 * SCENARIO는 판단 사례로 내는 상황 판단형(ADR-0021), MY_PROJECT는 서술형과 함께 미룬다(ADR-0019).
 */
export const ANGLES = ['WHY', 'WHEN', 'TRADEOFF', 'MECHANISM', 'SCENARIO', 'MY_PROJECT'] as const;
export type Angle = (typeof ANGLES)[number];
export const CONCEPT_ANGLES = ['WHY', 'WHEN', 'TRADEOFF', 'MECHANISM'] as const satisfies readonly Angle[];

export const VALIDATION_STATUSES = ['PENDING', 'VALID', 'INVALID'] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

/** 객관식 보기. 오답 보기에는 그 보기를 고르게 만드는 오개념을 붙인다. 정답 보기는 null이다. */
export interface Choice {
  readonly text: string;
  readonly misconception: string | null;
}

/** 빈칸 문제의 빈칸 표시. 문제 문장에 정확히 한 번 들어간다. */
export const BLANK = '____';

/** 객관식 보기 수. */
export const CHOICE_COUNT = 4;

interface QuestionBase {
  readonly conceptId: number;
  readonly angle: Angle;
  /** 이 문제가 확인하는 핵심 한 가지. */
  readonly keyPoint: string;
  readonly difficulty: 1 | 2 | 3;
  readonly prompt: string;
  readonly explanation: string;
  /** 정답 근거. 출제할 때 함께 만들어 둔다 (설계 문서 7.3). */
  readonly referenceMaterial: string;
  /** 문제의 근거가 된 경험 카드. */
  readonly experienceId: number | null;
  /** 변형 문제면 원래 문제. 같은 핵심을 다른 상황으로 묻는다 (설계 문서 7.3 "변형 문제"). */
  readonly variantOf: number | null;
  /** 상황 판단형(SCENARIO)이면 재료가 된 판단 사례 (ADR-0021). */
  readonly caseId: number | null;
}

/** 가정 사례로 만든 상황 판단형 문제의 머리말 (ADR-0026·0032). 실제로 겪은 일처럼 읽히지 않게 코드가 붙인다. */
export const HYPOTHETICAL_PREFIX = '[가정한 상황] ';

/** 검증 전 문제. 객관식 [answer]는 정답 보기의 글이다. */
export type QuestionDraft = QuestionBase &
  (
    | { readonly type: 'MULTIPLE_CHOICE'; readonly choices: readonly Choice[]; readonly answer: string }
    | { readonly type: 'FILL_BLANK'; readonly answer: string; readonly acceptedAnswers: readonly string[] }
  );

/** 저장된 문제. 신고된 문제는 출제하지 않고 그 풀이는 숙련도에서 뺀다. */
export type Question = QuestionDraft & { readonly id: number; readonly reported: boolean };

/**
 * 표기 차이만 지운다: 유니코드 호환 정규화(전각 → 반각), 대소문자, 공백.
 * 빈칸 채점과 검증에서 같은 답인지 볼 때 쓴다 (설계 문서 7.3).
 */
export const normalizeAnswer = (answer: string): string => answer.normalize('NFKC').toLowerCase().replace(/\s+/g, '');

/** 빈칸 답이 정답이나 허용 답 중 하나와 같은가. */
export function isAcceptedAnswer(draft: Extract<QuestionDraft, { type: 'FILL_BLANK' }>, answer: string): boolean {
  const given = normalizeAnswer(answer);
  return [draft.answer, ...draft.acceptedAnswers].some((a) => normalizeAnswer(a) === given);
}
