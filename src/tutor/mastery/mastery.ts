import { newSchedule, nextSchedule, type FsrsGrade, type Schedule } from './fsrs.js';

/** 답한 직후 받는 확신도 (설계 문서 8장). 빠지면 UNSURE로 본다(7.3). */
export const CONFIDENCES = ['SURE', 'UNSURE', 'GUESS'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

/** 개념 하나의 복습 일정과 숙련도·약점 (설계 문서 5.3). 점수는 힌트 없이 낸 응답만 반영한다. */
export interface ConceptMastery extends Schedule {
  readonly conceptId: number;
  /** 힌트 없는 응답의 최근 가중 정답률. 찍어서 맞힌 답은 정답으로 세지 않는다. */
  readonly masteryScore: number;
  readonly weaknessScore: number;
  /** 숙련도에 반영한(힌트 없는) 응답 수. */
  readonly gradedAttempts: number;
  readonly updatedAt: Date;
}

/** 채점된 응답 하나. 오류 신고된 문제의 응답은 넘기지 않는다. */
export type GradedAnswer = {
  readonly conceptId: number;
  readonly confidence: Confidence;
  readonly hintUsed: boolean;
  readonly answeredAt: Date;
} & (
  | { readonly result: 'CORRECT' }
  /** [repeatedMisconception]: 고른 오개념이 이 개념에서 전에도 나왔다(같은 오개념 2회 이상). */
  | { readonly result: 'WRONG'; readonly repeatedMisconception: boolean }
);

/** 최근 응답의 가중치(지수이동평균). 최근 4~5번이 점수 대부분을 정한다. */
const RECENT_WEIGHT = 0.4;
/** 확신했는데 틀림, 같은 오개념 반복에 각각 더하는 약점 가산점. */
const CONFIDENT_ERROR_BONUS = 0.5;
const REPEATED_MISCONCEPTION_BONUS = 0.5;
/** 이 수보다 적게 채점된 개념은 약점과 구분해 "미측정"이다. */
const MIN_GRADED_ATTEMPTS = 2;
const WEAK_THRESHOLD = 0.5;

/** 대화에서 처음 다룬 개념. 점수 없이 [at]부터 복습할 수 있는 일정만 둔다. */
export function newMastery(conceptId: number, at: Date): ConceptMastery {
  return { conceptId, ...newSchedule(at), masteryScore: 0, weaknessScore: 0, gradedAttempts: 0, updatedAt: at };
}

/** 응답 → FSRS 등급 (설계 문서 8장). 응답 시간을 재지 않으므로 확실한 정답은 모두 Easy다. */
export function gradeOf(answer: GradedAnswer): FsrsGrade {
  if (answer.result === 'WRONG') return 'AGAIN';
  if (answer.hintUsed || answer.confidence === 'GUESS') return 'HARD';
  return answer.confidence === 'SURE' ? 'EASY' : 'GOOD';
}

/**
 * 응답 하나를 반영한다. FSRS 일정은 모든 응답으로, 숙련도·약점은 힌트 없는 응답으로만 갱신한다.
 * 약점 = (1 − 숙련도) + 확신했는데 틀린 가산점 + 반복 오개념 가산점을 같은 가중치로 평균 낸 값이다(0~1로 자름).
 */
export function applyAnswer(prev: ConceptMastery, answer: GradedAnswer): ConceptMastery {
  const schedule = nextSchedule(prev, gradeOf(answer), answer.answeredAt);
  if (answer.hintUsed) return { ...prev, ...schedule, updatedAt: answer.answeredAt };

  const credit = answer.result === 'CORRECT' && answer.confidence !== 'GUESS' ? 1 : 0;
  const penalty =
    answer.result === 'WRONG'
      ? (answer.confidence === 'SURE' ? CONFIDENT_ERROR_BONUS : 0) +
        (answer.repeatedMisconception ? REPEATED_MISCONCEPTION_BONUS : 0)
      : 0;
  const first = prev.gradedAttempts === 0;
  const average = (previous: number, value: number) =>
    first ? value : RECENT_WEIGHT * value + (1 - RECENT_WEIGHT) * previous;
  return {
    ...prev,
    ...schedule,
    masteryScore: average(prev.masteryScore, credit),
    weaknessScore: Math.min(1, average(prev.weaknessScore, 1 - credit + penalty)),
    gradedAttempts: prev.gradedAttempts + 1,
    updatedAt: answer.answeredAt,
  };
}

export type WeaknessLevel = 'UNMEASURED' | 'WEAK' | 'OK';

/** 채점된 응답이 2회 미만이면 미측정, 약점 점수 0.5 이상이면 약점 (설계 문서 8장). */
export function weaknessLevel(m: Pick<ConceptMastery, 'gradedAttempts' | 'weaknessScore'>): WeaknessLevel {
  if (m.gradedAttempts < MIN_GRADED_ATTEMPTS) return 'UNMEASURED';
  return m.weaknessScore >= WEAK_THRESHOLD ? 'WEAK' : 'OK';
}
