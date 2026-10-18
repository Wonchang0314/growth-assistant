import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from 'ts-fsrs';

/** FSRS 카드 상태 (설계 문서 5.3). 단기 학습 단계를 끄므로(ADR-0028) 실제로는 NEW와 REVIEW만 생긴다. */
export const FSRS_STATES = ['NEW', 'LEARNING', 'REVIEW', 'RELEARNING'] as const;
export type FsrsState = (typeof FSRS_STATES)[number];

export const FSRS_GRADES = ['AGAIN', 'HARD', 'GOOD', 'EASY'] as const;
export type FsrsGrade = (typeof FSRS_GRADES)[number];

/** 개념 하나의 복습 일정. `ts-fsrs`의 `Card`에서 이 프로젝트가 저장하는 값만 둔다. */
export interface Schedule {
  readonly state: FsrsState;
  readonly stability: number;
  readonly difficulty: number;
  readonly reps: number;
  readonly lapses: number;
  readonly lastReviewAt: Date | null;
  readonly dueAt: Date;
}

/**
 * `ts-fsrs` 5.4.2(FSRS-6) 기본 파라미터에서 단기 학습 단계(1분·10분)만 끈다 (ADR-0028).
 * 기본값: 목표 기억률 0.9, 최대 간격 36500일, 간격 흔들기(fuzz) 끔.
 * 출처: https://github.com/open-spaced-repetition/ts-fsrs (`default_request_retention` 등, 2026-10-18 확인)
 */
const scheduler = fsrs(generatorParameters({ enable_short_term: false }));

const toState: Record<State, FsrsState> = {
  [State.New]: 'NEW',
  [State.Learning]: 'LEARNING',
  [State.Review]: 'REVIEW',
  [State.Relearning]: 'RELEARNING',
};
const fromState: Record<FsrsState, State> = {
  NEW: State.New,
  LEARNING: State.Learning,
  REVIEW: State.Review,
  RELEARNING: State.Relearning,
};
const toRating: Record<FsrsGrade, Grade> = {
  AGAIN: Rating.Again,
  HARD: Rating.Hard,
  GOOD: Rating.Good,
  EASY: Rating.Easy,
};

/** 아직 한 번도 풀지 않은 개념의 일정. [now]부터 복습할 수 있다. */
export function newSchedule(now: Date): Schedule {
  return fromCard(createEmptyCard(now));
}

/** [grade]로 답한 뒤의 일정. 예정일 전에 풀어도 그 시각 기준으로 계산한다. */
export function nextSchedule(schedule: Schedule, grade: FsrsGrade, now: Date): Schedule {
  return fromCard(scheduler.next(toCard(schedule), now, toRating[grade]).card);
}

function toCard(s: Schedule): Card {
  // scheduled_days·elapsed_days(폐기 예정)·learning_steps는 단기 학습 단계를 끈 계산에 쓰이지 않는다.
  return {
    state: fromState[s.state],
    stability: s.stability,
    difficulty: s.difficulty,
    reps: s.reps,
    lapses: s.lapses,
    last_review: s.lastReviewAt ?? undefined,
    due: s.dueAt,
    scheduled_days: 0,
    elapsed_days: 0,
    learning_steps: 0,
  };
}

function fromCard(card: Card): Schedule {
  return {
    state: toState[card.state],
    stability: card.stability,
    difficulty: card.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    lastReviewAt: card.last_review ?? null,
    dueAt: card.due,
  };
}
