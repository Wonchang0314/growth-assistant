import { describe, expect, it } from 'vitest';
import { newSchedule, nextSchedule, type FsrsGrade, type Schedule } from './fsrs.js';

const t0 = new Date('2026-10-18T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const daysAfter = (from: Date, to: Date) => (to.getTime() - from.getTime()) / DAY;

// 기대 값은 ts-fsrs 5.4.2(FSRS-6 기본 가중치, 단기 학습 단계 끔, 최대 간격 180일)로 계산했다. 버전을 올려 값이 바뀌면 여기서 드러난다.
describe('FSRS 일정', () => {
  it('새 개념은 지금부터 복습할 수 있다', () => {
    expect(newSchedule(t0)).toEqual({
      state: 'NEW',
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      lastReviewAt: null,
      dueAt: t0,
    });
  });

  it.each([
    ['AGAIN', 1, 0.212],
    ['HARD', 2, 1.2931],
    ['GOOD', 3, 2.3065],
    ['EASY', 8, 8.2956],
  ] as const)('새 개념을 %s로 답하면 학습 단계 없이 %i일 뒤 복습한다', (grade, days, stability) => {
    const next = nextSchedule(newSchedule(t0), grade, t0);

    expect(next.state).toBe('REVIEW');
    expect(daysAfter(t0, next.dueAt)).toBe(days);
    expect(next.stability).toBeCloseTo(stability, 4);
    expect(next.lastReviewAt).toEqual(t0);
  });

  it('예정일마다 답하면 간격이 늘고, 틀리면 줄며 lapses가 는다', () => {
    const grades: FsrsGrade[] = ['GOOD', 'GOOD', 'AGAIN', 'EASY'];
    const intervals: number[] = [];
    let s: Schedule = newSchedule(t0);
    for (const grade of grades) {
      const next = nextSchedule(s, grade, s.dueAt);
      intervals.push(daysAfter(s.dueAt, next.dueAt));
      s = next;
    }

    expect(intervals).toEqual([3, 14, 2, 8]);
    expect(s).toMatchObject({ state: 'REVIEW', reps: 4, lapses: 1 });
    expect(s.stability).toBeCloseTo(8.0894, 4);
    expect(s.difficulty).toBeCloseTo(6.5061, 4);
  });

  // ts-fsrs는 180일로 자른 뒤 Hard < Good < Easy 간격을 하루씩 벌려서 Easy는 182일까지 간다.
  it.each([
    ['GOOD', 181],
    ['EASY', 182],
  ] as const)('계속 %s로 답해도 간격은 %i일에서 멈춘다', (grade, days) => {
    let s: Schedule = newSchedule(t0);
    for (let i = 0; i < 8; i++) s = nextSchedule(s, grade, s.dueAt);

    expect(daysAfter(s.lastReviewAt ?? t0, s.dueAt)).toBe(days);
  });
});
