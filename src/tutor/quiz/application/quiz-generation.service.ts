import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../../core/clock/clock.js';
import { ConceptService } from '../../../core/knowledge/concept.service.js';
import { ExperienceRepository } from '../../../core/memory/experience.repository.js';
import { MasteryService } from '../../mastery/mastery.service.js';
import { StudyNoteService } from '../../study/study-note.service.js';
import { draftProblems, shuffled } from '../domain/question-gate.js';
import { solutionProblems } from '../domain/question-solution.js';
import type { QuestionDraft, QuestionType, ValidationStatus } from '../domain/quiz-question.js';
import { nextAngle, type QuestionHistory, variantCheckProblems, variantProblems } from '../domain/variant.js';
import { type GenerationContext, QuestionGenerator, QuizQuestionRepository } from './ports.js';
import { QuizGuidelineService } from './quiz-guideline.service.js';

/** 보기 순서를 섞을 때 쓰는 [0, 1) 난수. 테스트에서 고정한다. */
export const RANDOM = Symbol('RANDOM');

/** 다시 쓰는 횟수까지 합친 시도 수. 걸리면 1회 다시 생성한다 (설계 문서 7.3, ADR-0021과 같다). */
const ATTEMPTS = 2;

export interface GeneratedQuestion {
  readonly id: number;
  readonly status: Extract<ValidationStatus, 'VALID' | 'INVALID'>;
  readonly question: QuestionDraft;
  /** 마지막 시도가 걸린 이유. VALID면 비어 있다. */
  readonly problems: readonly string[];
}

/**
 * 개념 하나로 객관식·빈칸 문제를 만든다 (설계 문서 7.3).
 * 출제(Sonnet) → 모양·길이 검사(코드) → 보기 섞기 → 정답을 숨긴 풀이 검증(Opus) → 변형이면 원래 문제와 비교(Opus).
 * 걸리면 이유를 붙여 한 번 다시 쓰고, 그래도 걸리면 INVALID로 남긴다. 통과한 문제만 VALID가 되어 출제에 쓰인다.
 */
@Injectable()
export class QuizGenerationService {
  constructor(
    private readonly generator: QuestionGenerator,
    private readonly questions: QuizQuestionRepository,
    private readonly concepts: ConceptService,
    private readonly experiences: ExperienceRepository,
    private readonly mastery: MasteryService,
    private readonly studyNotes: StudyNoteService,
    private readonly guideline: QuizGuidelineService,
    private readonly clock: Clock,
    @Inject(RANDOM) private readonly random: () => number,
  ) {}

  /**
   * [variantOf]를 주면 그 문제의 변형을(같은 핵심, 다른 상황) 만든다.
   * 출제 프롬프트에 싣지 않은 그 개념의 경험 카드 하나를 문제에 이어, 채점 결과에 "같은 개념을 다룬 내 경험"으로 보여 준다.
   */
  async generate(input: {
    conceptId: number;
    type: QuestionType;
    variantOf?: QuestionHistory | undefined;
  }): Promise<GeneratedQuestion> {
    const variantOf = input.variantOf ?? null;
    const [context, [experience]] = await Promise.all([
      this.context(input.conceptId, input.type, variantOf),
      this.experiences.findByConcepts([input.conceptId], 1),
    ]);
    let problems: string[] = [];
    let question: QuestionDraft | undefined;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      question = {
        ...this.shuffle(await this.generator.write(context, problems)),
        experienceId: experience?.id ?? null,
      };
      problems = await this.problemsOf(question, context.variantOf);
      if (problems.length === 0) break;
    }
    if (question === undefined) throw new Error('문제를 만들지 못했다');
    const status = problems.length === 0 ? 'VALID' : 'INVALID';
    const id = await this.questions.add({
      ...question,
      validationStatus: status,
      validationNote: problems.length === 0 ? null : problems.join('\n'),
      createdAt: this.clock.now(),
    });
    return { id, status, question, problems };
  }

  /**
   * 모양 검사(코드) → 정답을 숨긴 풀이 → 변형이면 원래 문제와 비교. 앞 단계에서 걸리면 뒤 단계(LLM 호출)는 건너뛴다.
   */
  private async problemsOf(question: QuestionDraft, variantOf: QuestionHistory | null): Promise<string[]> {
    const shape = [...draftProblems(question), ...(variantOf ? variantProblems(variantOf.question, question) : [])];
    if (shape.length > 0) return shape;
    const solved = solutionProblems(question, await this.generator.solve(question));
    if (solved.length > 0 || !variantOf) return solved;
    return variantCheckProblems(await this.generator.compareVariant(variantOf.question, question));
  }

  private async context(
    conceptId: number,
    type: QuestionType,
    variantOf: QuestionHistory | null,
  ): Promise<GenerationContext> {
    const [[concept], knownKeyPoints, confusedPoints, guideline, mastery, history] = await Promise.all([
      this.concepts.summaries([conceptId]),
      this.questions.keyPoints(conceptId),
      this.studyNotes.confusedPoints(conceptId),
      this.guideline.rules(),
      this.mastery.find(conceptId),
      this.questions.findHistory(conceptId),
    ]);
    if (!concept) throw new Error(`개념이 없다: ${conceptId}`);
    return {
      concept,
      type,
      angle: nextAngle(mastery, history),
      knownKeyPoints,
      confusedPoints,
      guideline,
      variantOf,
    };
  }

  private shuffle(draft: QuestionDraft): QuestionDraft {
    return draft.type === 'MULTIPLE_CHOICE' ? { ...draft, choices: shuffled(draft.choices, this.random) } : draft;
  }
}
