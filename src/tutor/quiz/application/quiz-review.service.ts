import { inspect } from 'node:util';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Clock, localDate } from '../../../core/clock/clock.js';
import { ConceptService } from '../../../core/knowledge/concept.service.js';
import { MasteryService } from '../../mastery/mastery.service.js';
import { StudyNoteService } from '../../study/study-note.service.js';
import { DAILY_LIMIT, pickConcepts } from '../domain/review-selection.js';
import type { Question, QuestionType } from '../domain/quiz-question.js';
import { QuizAttemptRepository, QuizQuestionRepository } from './ports.js';
import { QuizGenerationService, RANDOM } from './quiz-generation.service.js';

/** 개념 하나를 골라 달라고 했을 때 기본으로 내는 문제 수. */
const CONCEPT_DEFAULT_COUNT = 3;

/** 사용자에게 보여 줄 문제. 정답·해설·오개념·기준 자료는 싣지 않는다 (설계 문서 7.3). */
export interface ServedQuestion {
  readonly questionId: number;
  readonly concept: string;
  readonly type: QuestionType;
  readonly prompt: string;
  /** 객관식 보기 글. 번호는 1부터 순서대로다. 빈칸이면 null. */
  readonly choices: readonly string[] | null;
}

export type ReviewSet =
  | {
      readonly kind: 'READY';
      readonly questions: readonly ServedQuestion[];
      /** 문제 풀에 없어 지금 만들고 있는 개념. 잠시 뒤 다시 부르면 나온다. */
      readonly preparing: readonly string[];
      /** 오늘 더 풀 수 있는 수. 개념을 골라 달라고 했으면 null(하루 상한을 적용하지 않음). */
      readonly remainingToday: number | null;
    }
  | { readonly kind: 'DAILY_LIMIT_REACHED' }
  | { readonly kind: 'UNKNOWN_CONCEPT'; readonly name: string };

/**
 * 복습할 문제를 고른다 (설계 문서 7.3). 문제 풀에 문제가 없는 개념은 뒤에서 만들고 기다리지 않는다.
 * 출제·검증에 1분 넘게 걸려 도구 호출이 끊길 수 있어서다 (ADR-0030).
 */
@Injectable()
export class QuizReviewService {
  private readonly logger = new Logger(QuizReviewService.name);
  /** 개념별로 만들고 있는 작업. 같은 개념을 겹쳐 만들면 이미 낸 핵심을 서로 몰라 같은 문제가 나온다. */
  private readonly preparing = new Map<number, Promise<void>>();

  constructor(
    private readonly questions: QuizQuestionRepository,
    private readonly attempts: QuizAttemptRepository,
    private readonly generation: QuizGenerationService,
    private readonly concepts: ConceptService,
    private readonly mastery: MasteryService,
    private readonly studyNotes: StudyNoteService,
    private readonly clock: Clock,
    @Inject(RANDOM) private readonly random: () => number,
  ) {}

  /** [concept]를 주면 그 개념의 문제를, 아니면 우선순위대로 개념마다 한 문제씩 하루 상한 안에서 낸다. */
  async reviewSet(input: { concept?: string | undefined; count?: number | undefined }): Promise<ReviewSet> {
    if (input.concept !== undefined) {
      const { resolved } = await this.concepts.resolve([input.concept]);
      const found = resolved[0];
      if (!found) return { kind: 'UNKNOWN_CONCEPT', name: input.concept };
      return this.serve([{ conceptId: found.id, count: input.count ?? CONCEPT_DEFAULT_COUNT }], null);
    }
    const now = this.clock.now();
    const remaining =
      DAILY_LIMIT - (await this.attempts.countOnDate(localDate(now, this.clock.timeZone), this.clock.timeZone));
    if (remaining <= 0) return { kind: 'DAILY_LIMIT_REACHED' };
    const limit = Math.min(input.count ?? remaining, remaining);
    const [candidates, confused] = await Promise.all([
      this.mastery.reviewCandidates(now, limit),
      this.studyNotes.unresolvedConfusedConcepts(limit),
    ]);
    const conceptIds = pickConcepts({ ...candidates, confused, limit, random: this.random });
    return this.serve(
      conceptIds.map((conceptId) => ({ conceptId, count: 1 })),
      remaining,
    );
  }

  /** 뒤에서 만들고 있는 문제가 모두 끝날 때까지 기다린다. 테스트에서 쓴다. MCP 서버가 끝나면 만들던 문제는 버려진다. */
  async idle(): Promise<void> {
    await Promise.all(this.preparing.values());
  }

  private async serve(wanted: readonly { conceptId: number; count: number }[], remainingToday: number | null) {
    const [summaries, found] = await Promise.all([
      this.concepts.summaries(wanted.map((w) => w.conceptId)),
      Promise.all(wanted.map((w) => this.questions.findServable(w.conceptId, w.count))),
    ]);
    const names = new Map(summaries.map((c) => [c.id, c.name]));
    const questions = found.flat();
    const preparing = wanted.flatMap((w, i) => {
      const missing = w.count - (found[i]?.length ?? 0);
      if (missing <= 0) return [];
      this.prepare(w.conceptId, missing);
      return [names.get(w.conceptId) ?? `개념 ${w.conceptId}`];
    });
    await this.questions.markServed(questions.map((q) => q.id));
    return {
      kind: 'READY' as const,
      questions: questions.map((q) => toServed(q, names.get(q.conceptId) ?? `개념 ${q.conceptId}`)),
      preparing,
      remainingToday,
    };
  }

  /** [count]개를 뒤에서 차례로 만든다. 이미 만들고 있는 개념이면 그 작업에 맡긴다. */
  private prepare(conceptId: number, count: number): void {
    if (this.preparing.has(conceptId)) return;
    const task = (async () => {
      for (let i = 0; i < count; i++) {
        const counts = await this.questions.countValid(conceptId);
        const type = counts.FILL_BLANK < counts.MULTIPLE_CHOICE ? 'FILL_BLANK' : 'MULTIPLE_CHOICE';
        await this.generation.generate({ conceptId, type });
      }
    })()
      .catch((e: unknown) => {
        this.logger.warn(`문제 만들기 실패: 개념 ${conceptId} ${inspect(e)}`);
      })
      .finally(() => this.preparing.delete(conceptId));
    this.preparing.set(conceptId, task);
  }
}

function toServed(q: Question, concept: string): ServedQuestion {
  return {
    questionId: q.id,
    concept,
    type: q.type,
    prompt: q.prompt,
    choices: q.type === 'MULTIPLE_CHOICE' ? q.choices.map((c) => c.text) : null,
  };
}
