import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../../core/clock/clock.js';
import { ConceptService } from '../../../core/knowledge/concept.service.js';
import { ExperienceRepository } from '../../../core/memory/experience.repository.js';
import { StudyNoteService } from '../../study/study-note.service.js';
import { draftProblems, shuffled } from '../domain/question-gate.js';
import { solutionProblems } from '../domain/question-solution.js';
import type { QuestionDraft, QuestionType, ValidationStatus } from '../domain/quiz-question.js';
import { type GenerationContext, QuestionGenerator, QuizQuestionRepository } from './ports.js';
import { QuizGuidelineService } from './quiz-guideline.service.js';

/** 보기 순서를 섞을 때 쓰는 [0, 1) 난수. 테스트에서 고정한다. */
export const RANDOM = Symbol('RANDOM');

/** 다시 쓰는 횟수까지 합친 시도 수. 걸리면 1회 다시 생성한다 (설계 문서 7.3, ADR-0021과 같다). */
const ATTEMPTS = 2;
/** 출제에 싣는 경험 카드 수. */
const EXPERIENCE_LIMIT = 3;

export interface GeneratedQuestion {
  readonly id: number;
  readonly status: Extract<ValidationStatus, 'VALID' | 'INVALID'>;
  readonly question: QuestionDraft;
  /** 마지막 시도가 걸린 이유. VALID면 비어 있다. */
  readonly problems: readonly string[];
}

/**
 * 개념 하나로 객관식·빈칸 문제를 만든다 (설계 문서 7.3).
 * 출제(Sonnet) → 모양 검사(코드) → 보기 섞기 → 정답을 숨긴 풀이 검증(Opus). 걸리면 이유를 붙여 한 번 다시 쓰고,
 * 그래도 걸리면 INVALID로 남긴다. 통과한 문제만 VALID가 되어 출제에 쓰인다.
 */
@Injectable()
export class QuizGenerationService {
  constructor(
    private readonly generator: QuestionGenerator,
    private readonly questions: QuizQuestionRepository,
    private readonly concepts: ConceptService,
    private readonly experiences: ExperienceRepository,
    private readonly studyNotes: StudyNoteService,
    private readonly guideline: QuizGuidelineService,
    private readonly clock: Clock,
    @Inject(RANDOM) private readonly random: () => number,
  ) {}

  async generate(input: { conceptId: number; type: QuestionType }): Promise<GeneratedQuestion> {
    const context = await this.context(input.conceptId, input.type);
    let problems: string[] = [];
    let question: QuestionDraft | undefined;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      question = this.shuffle(await this.generator.write(context, problems));
      problems = draftProblems(question);
      if (problems.length === 0) problems = solutionProblems(question, await this.generator.solve(question));
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

  private async context(conceptId: number, type: QuestionType): Promise<GenerationContext> {
    const [[concept], knownKeyPoints, confusedPoints, experiences, guideline] = await Promise.all([
      this.concepts.summaries([conceptId]),
      this.questions.keyPoints(conceptId),
      this.studyNotes.confusedPoints(conceptId),
      this.experiences.findByConcepts([conceptId], EXPERIENCE_LIMIT),
      this.guideline.rules(),
    ]);
    if (!concept) throw new Error(`개념이 없다: ${conceptId}`);
    return { concept, type, knownKeyPoints, confusedPoints, experiences, guideline };
  }

  private shuffle(draft: QuestionDraft): QuestionDraft {
    return draft.type === 'MULTIPLE_CHOICE' ? { ...draft, choices: shuffled(draft.choices, this.random) } : draft;
  }
}
