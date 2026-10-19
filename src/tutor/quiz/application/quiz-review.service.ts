import { inspect } from 'node:util';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Clock, localDate } from '../../../core/clock/clock.js';
import { ConceptService } from '../../../core/knowledge/concept.service.js';
import { MasteryService } from '../../mastery/mastery.service.js';
import { StudyNoteService } from '../../study/study-note.service.js';
import { DAILY_LIMIT, pickConcepts } from '../domain/review-selection.js';
import { ENABLED_TYPES, type Question, type QuestionType } from '../domain/quiz-question.js';
import { nextQuestion } from '../domain/variant.js';
import { QuizAttemptRepository, QuizQuestionRepository } from './ports.js';
import { QuizGenerationService, RANDOM } from './quiz-generation.service.js';
import { QuizWeaknessService } from './quiz-weakness.service.js';

/** 개념 하나를 골라 달라고 했을 때 기본으로 내는 문제 수. */
const CONCEPT_DEFAULT_COUNT = 3;
/**
 * 뒤에서 만들기가 검증을 하나도 통과하지 못한 개념은 이만큼 다시 만들지 않는다. 부를 때마다 다시 만들면
 * 사용량만 쓰고 계속 "만드는 중"으로 보인다(2026-10-18 Desktop 시험).
 */
export const RETRY_AFTER_MS = 30 * 60 * 1000;

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
      /** 최근에 만들어 봤지만 검증을 통과한 문제가 없어 지금은 다시 만들지 않는 개념. */
      readonly failed: readonly string[];
      /** 오늘 더 풀 수 있는 수. 개념을 골라 달라고 했거나 더 풀기 세트면 null(하루 상한을 적용하지 않음). */
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
  private readonly preparing = new Map<number, Promise<number>>();
  /** 개념별로 마지막 만들기가 검증을 하나도 통과하지 못한 시각. 서버를 다시 띄우면 비워진다. */
  private readonly failedAt = new Map<number, Date>();

  constructor(
    private readonly questions: QuizQuestionRepository,
    private readonly attempts: QuizAttemptRepository,
    private readonly generation: QuizGenerationService,
    private readonly concepts: ConceptService,
    private readonly mastery: MasteryService,
    private readonly studyNotes: StudyNoteService,
    private readonly weakness: QuizWeaknessService,
    private readonly clock: Clock,
    @Inject(RANDOM) private readonly random: () => number,
  ) {}

  /**
   * [concept]를 주면 그 개념의 문제를, 아니면 우선순위대로 개념마다 한 문제씩 하루 상한 안에서 낸다.
   * [more]면 하루 상한과 상관없이 같은 우선순위로 [DAILY_LIMIT]개 개념까지 내되, 오늘 푼 개념은 뺀다 (ADR-0039).
   */
  async reviewSet(input: {
    concept?: string | undefined;
    count?: number | undefined;
    more?: boolean | undefined;
  }): Promise<ReviewSet> {
    if (input.concept !== undefined) {
      const { resolved } = await this.concepts.resolve([input.concept]);
      const found = resolved[0];
      if (!found) return { kind: 'UNKNOWN_CONCEPT', name: input.concept };
      return this.serve([{ conceptId: found.id, count: input.count ?? CONCEPT_DEFAULT_COUNT }], null);
    }
    if (input.more) {
      const date = localDate(this.clock.now(), this.clock.timeZone);
      const [fresh, solved] = await Promise.all([
        this.mastery.unscheduled(),
        this.attempts.conceptIdsOnDate(date, this.clock.timeZone),
      ]);
      return this.serve(onePerConcept(await this.pick(date, input.count ?? DAILY_LIMIT, fresh, solved)), null);
    }
    const { date, answered } = await this.answeredToday();
    const remaining = DAILY_LIMIT - answered;
    if (remaining <= 0) return { kind: 'DAILY_LIMIT_REACHED' };
    const limit = Math.min(input.count ?? remaining, remaining);
    return this.serve(onePerConcept(await this.pick(date, limit, await this.mastery.unscheduled())), remaining);
  }

  /**
   * 오늘([Clock.timeZone]) 푼 수와 오늘 더 복습할 개념. 학습 알림과 새벽 문제 만들기가 쓴다.
   * 개념은 복습 세트와 같은 우선순위로 오늘 남은 수까지이고, 새 개념(복습 세트가 그때그때 무작위로 뽑음)은 넣지 않는다.
   */
  async today(): Promise<{ answered: number; conceptIds: number[] }> {
    const { date, answered } = await this.answeredToday();
    const limit = DAILY_LIMIT - answered;
    if (limit <= 0) return { answered, conceptIds: [] };
    return { answered, conceptIds: await this.pick(date, limit, []) };
  }

  private async answeredToday(): Promise<{ date: string; answered: number }> {
    const date = localDate(this.clock.now(), this.clock.timeZone);
    return { date, answered: await this.attempts.countOnDate(date, this.clock.timeZone) };
  }

  /**
   * 오늘 복습할 개념을 우선순위(근본 원인 → [date] 안에 때가 되는 개념 → 헷갈린 개념 → 약점)대로 [limit]개 고르고,
   * 모자라면 [fresh]에서 채운다. 아침에 받은 알림의 개수와 그날 복습 세트가 같은 개념을 세도록 "지금"이 아니라 날짜로 본다.
   * [exclude]의 개념은 고르지 않으므로 그만큼 더 읽는다.
   */
  private async pick(
    date: string,
    limit: number,
    fresh: readonly { conceptId: number; weight: number }[],
    exclude: readonly number[] = [],
  ): Promise<number[]> {
    const n = limit + exclude.length;
    const [rootCauses, due, confused, weak] = await Promise.all([
      this.weakness.rootCauseIds(n),
      this.mastery.dueOn(date, this.clock.timeZone, n),
      this.studyNotes.unresolvedConfusedConcepts(n),
      this.mastery.weakConcepts(n),
    ]);
    return pickConcepts({
      rootCauses,
      due,
      confused,
      weak: weak.map((m) => m.conceptId),
      fresh,
      exclude,
      limit,
      random: this.random,
    });
  }

  /**
   * 오늘 복습할 개념 중 낼 문제가 없는 개념의 문제를 [limit]개 개념까지 하나씩 만들고 끝날 때까지 기다린다.
   * 새벽 예약 작업이 불러 아침 복습의 "만드는 중" 대기를 줄인다 (ADR-0036).
   */
  async prepareToday(limit: number): Promise<{ concepts: number; ready: number }> {
    const { conceptIds } = await this.today();
    const servable = await Promise.all(conceptIds.map((id) => this.questions.findServable(id, 1)));
    const missing = conceptIds.filter((_, i) => servable[i]?.length === 0).slice(0, limit);
    let ready = 0;
    for (const conceptId of missing) if ((await this.prepare(conceptId, 1)) > 0) ready += 1;
    return { concepts: missing.length, ready };
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
    const nameOf = (conceptId: number) => names.get(conceptId) ?? `개념 ${conceptId}`;
    const questions = found.flat();
    const preparing: string[] = [];
    const failed: string[] = [];
    wanted.forEach((w, i) => {
      const missing = w.count - (found[i]?.length ?? 0);
      if (missing <= 0) return;
      if (this.recentlyFailed(w.conceptId)) {
        failed.push(nameOf(w.conceptId));
        return;
      }
      void this.prepare(w.conceptId, missing);
      preparing.push(nameOf(w.conceptId));
    });
    await this.questions.markServed(questions.map((q) => q.id));
    return {
      kind: 'READY' as const,
      questions: questions.map((q) => toServed(q, nameOf(q.conceptId))),
      preparing,
      failed,
      remainingToday,
    };
  }

  /** 만들고 있지 않고, 마지막 만들기가 [RETRY_AFTER_MS] 안에 실패했는지. */
  private recentlyFailed(conceptId: number): boolean {
    if (this.preparing.has(conceptId)) return false;
    const at = this.failedAt.get(conceptId);
    return at !== undefined && this.clock.now().getTime() - at.getTime() < RETRY_AFTER_MS;
  }

  /**
   * [count]개를 뒤에서 차례로 만든다. 흔들린 문제의 변형이 먼저이고, 다음은 확인된 핵심의 변형과 새 핵심을 번갈아 만든다
   * (`nextQuestion`).
   * 이미 만들고 있는 개념이면 그 작업에 맡긴다. 검증을 통과한 문제가 하나도 없으면 실패로 남긴다. 검증을 통과한 수를 돌려준다.
   */
  private prepare(conceptId: number, count: number): Promise<number> {
    const running = this.preparing.get(conceptId);
    if (running) return running;
    const task = (async () => {
      let valid = 0;
      for (let i = 0; i < count; i++) {
        const [counts, history] = await Promise.all([
          this.questions.countValid(conceptId),
          this.questions.findHistory(conceptId),
        ]);
        // 낼 수 있는 유형 중 검증을 통과한 문제가 적은 쪽.
        const type = ENABLED_TYPES.reduce((a, b) => (counts[b] < counts[a] ? b : a));
        const next = nextQuestion(history);
        const { status } = await this.generation.generate({
          conceptId,
          type,
          variantOf: next.kind === 'VARIANT' ? next.of : undefined,
        });
        if (status === 'VALID') valid += 1;
      }
      return valid;
    })()
      .catch((e: unknown) => {
        this.logger.warn(`문제 만들기 실패: 개념 ${conceptId} ${inspect(e)}`);
        return 0;
      })
      .then((valid) => {
        if (valid === 0) this.failedAt.set(conceptId, this.clock.now());
        else this.failedAt.delete(conceptId);
        return valid;
      })
      .finally(() => this.preparing.delete(conceptId));
    this.preparing.set(conceptId, task);
    return task;
  }
}

const onePerConcept = (conceptIds: readonly number[]) => conceptIds.map((conceptId) => ({ conceptId, count: 1 }));

function toServed(q: Question, concept: string): ServedQuestion {
  return {
    questionId: q.id,
    concept,
    type: q.type,
    prompt: q.prompt,
    choices: q.type === 'MULTIPLE_CHOICE' ? q.choices.map((c) => c.text) : null,
  };
}
