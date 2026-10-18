import type { RelatedConcept } from '../../../core/knowledge/concept.js';
import type { FoundExperience } from '../../../core/memory/experience.repository.js';
import type { Solution } from '../domain/question-solution.js';
import type { QuestionDraft, QuestionType, ValidationStatus } from '../domain/quiz-question.js';

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
}

export abstract class QuestionGenerator {
  /** [problems]는 지난 문제가 걸린 이유다. 처음이면 비어 있다. */
  abstract write(context: GenerationContext, problems: readonly string[]): Promise<QuestionDraft>;
  /** 정답을 숨기고 문제만 보여 줘서 풀게 한다. */
  abstract solve(draft: QuestionDraft): Promise<Solution>;
}
