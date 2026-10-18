import { Injectable } from '@nestjs/common';
import { Clock } from '../../../core/clock/clock.js';
import { DecisionCaseRepository } from '../../../core/memory/decision-case.repository.js';
import { ExperienceRepository } from '../../../core/memory/experience.repository.js';
import type { Confidence, ConceptMastery } from '../../mastery/mastery.js';
import { MasteryService } from '../../mastery/mastery.service.js';
import { grade, toGradedAnswers } from '../domain/grading.js';
import type { Question } from '../domain/quiz-question.js';
import { QuizAttemptRepository, QuizQuestionRepository } from './ports.js';

export type SubmitResult =
  | {
      readonly kind: 'GRADED';
      readonly correct: boolean;
      readonly question: Question;
      /** 객관식은 정답 보기 번호(1부터)와 글. */
      readonly correctAnswer: string;
      readonly userAnswer: string;
      /** 고른 오답 보기의 오개념. */
      readonly misconception: string | null;
      /**
       * 문제와 이어진 경험 카드 제목 (설계 문서 7.3). 가정 사례로 만든 문제는 상황을 지어낸 것이라
       * "실제로 겪은 경험"이 아니라 "같은 개념을 다룬 경험"이다 (ADR-0032).
       */
      readonly experience: { readonly title: string; readonly relation: 'LIVED' | 'SAME_CONCEPT' } | null;
      /** 숙련도에 반영한 뒤의 상태. 신고된 문제면 반영하지 않아 null이다. */
      readonly mastery: ConceptMastery | null;
    }
  | { readonly kind: 'UNKNOWN_QUESTION' }
  /** 객관식 답에서 보기를 알 수 없다. 보기 번호로 다시 받는다. */
  | { readonly kind: 'UNREADABLE_ANSWER'; readonly question: Question };

/** 채점과 오류 신고 (설계 문서 7.3·8장). LLM을 부르지 않는다. */
@Injectable()
export class QuizGradingService {
  constructor(
    private readonly questions: QuizQuestionRepository,
    private readonly attempts: QuizAttemptRepository,
    private readonly mastery: MasteryService,
    private readonly experiences: ExperienceRepository,
    private readonly cases: DecisionCaseRepository,
    private readonly clock: Clock,
  ) {}

  async submit(input: {
    questionId: number;
    answer: string;
    confidence: Confidence;
    hintUsed: boolean;
  }): Promise<SubmitResult> {
    const question = await this.questions.find(input.questionId);
    if (!question) return { kind: 'UNKNOWN_QUESTION' };
    const grading = grade(question, input.answer);
    if (!grading) return { kind: 'UNREADABLE_ANSWER', question };

    const record = {
      conceptId: question.conceptId,
      correct: grading.correct,
      confidence: input.confidence,
      hintUsed: input.hintUsed,
      misconception: grading.misconception,
      answeredAt: this.clock.now(),
    };
    const prior = await this.attempts.findForConcept(question.conceptId);
    await this.attempts.add({ ...record, questionId: question.id, userAnswer: grading.userAnswer });
    const answer = toGradedAnswers([...prior, record]).at(-1);
    const [mastery, experience, caseKind] = await Promise.all([
      question.reported || answer === undefined ? null : this.mastery.recordAnswer(answer),
      question.experienceId === null ? undefined : this.experiences.findById(question.experienceId),
      question.caseId === null ? undefined : this.cases.findKind(question.caseId),
    ]);
    return {
      kind: 'GRADED',
      correct: grading.correct,
      question,
      correctAnswer: correctAnswer(question),
      userAnswer: grading.userAnswer,
      misconception: grading.misconception,
      experience: experience
        ? { title: experience.title, relation: caseKind === 'HYPOTHETICAL' ? 'SAME_CONCEPT' : 'LIVED' }
        : null,
      mastery,
    };
  }

  /**
   * 문제를 신고한다. 출제에서 빼고, 이미 푼 적이 있으면 그 개념의 숙련도와 일정을
   * 신고된 문제의 풀이를 뺀 기록으로 처음부터 다시 계산한다 (설계 문서 7.3, 사용자 결정 2026-10-18).
   */
  async report(questionId: number, reason: string): Promise<Question | undefined> {
    const question = await this.questions.find(questionId);
    if (!question) return undefined;
    await this.questions.report(questionId, reason);
    if ((await this.attempts.countForQuestion(questionId)) > 0) {
      const answers = toGradedAnswers(await this.attempts.findForConcept(question.conceptId));
      await this.mastery.recompute(question.conceptId, answers, this.clock.now());
    }
    return question;
  }
}

function correctAnswer(q: Question): string {
  if (q.type === 'FILL_BLANK') return q.answer;
  return `${q.choices.findIndex((c) => c.text === q.answer) + 1}. ${q.answer}`;
}
