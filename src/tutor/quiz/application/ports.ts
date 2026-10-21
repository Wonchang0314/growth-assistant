import type { RelatedConcept } from '../../../core/knowledge/concept.js';
import type { AttemptRecord } from '../domain/grading.js';
import type { Solution } from '../domain/question-solution.js';
import type { ConceptAngle, Question, QuestionDraft, QuestionType, ValidationStatus } from '../domain/quiz-question.js';
import type { QuestionHistory, VariantCheck } from '../domain/variant.js';

/*
 * application이 infrastructure 구현을 부르는 출력 포트 (ADR-0029). 레이어 방향(infrastructure → application)을 지키려면
 * 저장소와 출제 LLM 어댑터도 포트로 둬야 한다. 추상 클래스라 Nest 주입 토큰으로도 쓴다.
 */

export type NewQuestion = QuestionDraft & {
  readonly validationStatus: ValidationStatus;
  /** 검증에 걸린 이유. 통과했으면 null이다. */
  readonly validationNote: string | null;
  readonly createdAt: Date;
};

export abstract class QuizQuestionRepository {
  /** 저장한 문제의 id. */
  abstract add(question: NewQuestion): Promise<number>;
  /** 그 개념에서 이미 낸(검증을 통과한) 문제의 핵심. 새 문제는 다른 핵심을 고른다. */
  abstract keyPoints(conceptId: number): Promise<string[]>;
  abstract find(id: number): Promise<Question | undefined>;
  /**
   * 낼 수 있는 문제: 검증을 통과했고, 신고되지 않았고, 아직 풀지 않은 [angles] 각도의 문제. 변형 문제 먼저, 오래된 것부터.
   */
  abstract findServable(conceptId: number, angles: readonly ConceptAngle[], limit: number): Promise<Question[]>;
  /** 그 개념의 검증 통과·신고 안 된 문제와 마지막 풀이, 변형이 있는지. 오래된 것부터. 다음에 만들 문제를 정할 때 쓴다. */
  abstract findHistory(conceptId: number): Promise<QuestionHistory[]>;
  /** 검증을 통과한 문제 수. 다음에 만들 유형을 고를 때 쓴다. */
  abstract countValid(conceptId: number): Promise<Record<QuestionType, number>>;
  abstract markServed(ids: readonly number[]): Promise<void>;
  abstract report(id: number, reason: string): Promise<void>;
}

export type NewAttempt = AttemptRecord & {
  readonly questionId: number;
  readonly userAnswer: string;
};

export abstract class QuizAttemptRepository {
  abstract add(attempt: NewAttempt): Promise<number>;
  /** 그 개념의 풀이를 시간순으로. 신고된 문제의 풀이는 뺀다. */
  abstract findForConcept(conceptId: number): Promise<AttemptRecord[]>;
  abstract countForQuestion(questionId: number): Promise<number>;
  /** [timeZone]의 [date](`2026-10-18`)에 낸 풀이 수. 하루 상한에 쓴다. */
  abstract countOnDate(date: string, timeZone: string): Promise<number>;
  /** [timeZone]의 [date]에 푼 문제의 개념. 더 풀기 세트가 오늘 푼 개념을 뺄 때 쓴다 (ADR-0039). */
  abstract conceptIdsOnDate(date: string, timeZone: string): Promise<number[]>;
}

/** 날짜별 오늘 낼 개념 순서 (ADR-0040). 새벽 작업이나 그날 처음 고를 때 한 번 정하고 그날은 바꾸지 않는다. */
export abstract class ReviewPlanRepository {
  /** [date](`2026-10-21`)의 계획. 없으면 빈 배열이다. */
  abstract find(date: string): Promise<number[]>;
  /** [date]의 계획이 없으면 [conceptIds]로 저장한다. 이미 있으면(동시에 정했으면) 그대로 두고, 저장된 계획을 돌려준다. */
  abstract saveIfAbsent(date: string, conceptIds: readonly number[]): Promise<number[]>;
}

/**
 * 출제에 넣는 재료 (설계 문서 7.3 "문제 생성 규칙"). 경험 카드·판단 사례는 넣지 않는다.
 * 내 상황이 문제에 비치면 답이 짐작되기 때문이다 (ADR-0038). 경험은 어떤 개념을 낼지 고르는 데만 쓴다.
 */
export interface GenerationContext {
  readonly concept: RelatedConcept;
  readonly type: QuestionType;
  /** 숙련도로 정한 각도 (`nextAngle`). */
  readonly angle: ConceptAngle;
  readonly knownKeyPoints: readonly string[];
  /** 학습 기록에 남은, 사용자가 헷갈린 점. 오답 보기와 빈칸 자리가 겨냥한다. */
  readonly confusedPoints: readonly string[];
  readonly guideline: readonly string[];
  /** 변형 문제를 만들 때 원래 문제와 그때의 답·오개념 (설계 문서 7.3 "변형 문제"). */
  readonly variantOf: QuestionHistory | null;
}

export abstract class QuestionGenerator {
  /** [problems]는 지난 문제가 걸린 이유다. 처음이면 비어 있다. */
  abstract write(context: GenerationContext, problems: readonly string[]): Promise<QuestionDraft>;
  /** 정답을 숨기고 문제만 보여 줘서 풀게 한다. */
  abstract solve(draft: QuestionDraft): Promise<Solution>;
  abstract compareVariant(original: Question, variant: QuestionDraft): Promise<VariantCheck>;
}
