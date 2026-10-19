import type { RelatedConcept } from '../../../core/knowledge/concept.js';
import type { ActiveCase } from '../../../core/memory/decision-case.repository.js';
import type { FoundExperience } from '../../../core/memory/experience.repository.js';
import type { AttemptRecord } from '../domain/grading.js';
import type { Solution } from '../domain/question-solution.js';
import type { Question, QuestionDraft, QuestionType, ValidationStatus } from '../domain/quiz-question.js';
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
  /** 낼 수 있는 문제: 검증을 통과했고, 신고되지 않았고, 아직 풀지 않은 문제. 변형 문제 먼저, 오래된 것부터. */
  abstract findServable(conceptId: number, limit: number): Promise<Question[]>;
  /** 검증을 통과했고 신고되지 않은 그 유형의 문제 하나를 아무거나. 풀었는지와 개념은 보지 않는다. */
  abstract findAnyValid(type: QuestionType): Promise<Question | undefined>;
  /** 그 개념의 검증 통과·신고 안 된 문제와 마지막 풀이, 변형이 있는지. 오래된 것부터. 다음에 만들 문제를 정할 때 쓴다. */
  abstract findHistory(conceptId: number): Promise<QuestionHistory[]>;
  /** 그 개념에서 문제로 만들어 본(검증 결과와 상관없이) 판단 사례. 검증에 걸린 사례를 매번 다시 쓰지 않게 한다. */
  abstract usedCaseIds(conceptId: number): Promise<number[]>;
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
}

/** 출제에 넣는 재료 (설계 문서 7.3 "문제 생성 규칙"). */
export interface GenerationContext {
  readonly concept: RelatedConcept;
  readonly type: QuestionType;
  readonly knownKeyPoints: readonly string[];
  /** 학습 기록에 남은, 사용자가 헷갈린 점. 오답 보기와 빈칸 자리가 겨냥한다. */
  readonly confusedPoints: readonly string[];
  readonly experiences: readonly FoundExperience[];
  readonly guideline: readonly string[];
  /** 변형 문제를 만들 때 원래 문제와 그때의 답·오개념 (설계 문서 7.3 "변형 문제"). */
  readonly variantOf: QuestionHistory | null;
  /** 상황 판단형 문제의 재료가 되는 판단 사례 (ADR-0021). 있으면 객관식으로만 낸다. */
  readonly decisionCase: ActiveCase | null;
}

export abstract class QuestionGenerator {
  /** [problems]는 지난 문제가 걸린 이유다. 처음이면 비어 있다. */
  abstract write(context: GenerationContext, problems: readonly string[]): Promise<QuestionDraft>;
  /** 정답을 숨기고 문제만 보여 줘서 풀게 한다. */
  abstract solve(draft: QuestionDraft): Promise<Solution>;
  abstract compareVariant(original: Question, variant: QuestionDraft): Promise<VariantCheck>;
}
