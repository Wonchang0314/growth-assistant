import { describe, expect, it } from 'vitest';
import { cronOf, isDue, runStage, stagesText } from './daily-job.js';

const at = (iso: string) => new Date(iso);

describe('isDue', () => {
  it.each([
    ['오늘 시각이 지났고 기록이 없으면 돌린다', '2026-10-20T05:00:00+09:00', undefined, true],
    ['오늘 시각이 지났고 마지막이 어제 몫이면 돌린다', '2026-10-20T04:00:00+09:00', '2026-10-19', true],
    ['오늘 몫을 이미 돌렸으면 돌리지 않는다', '2026-10-20T23:00:00+09:00', '2026-10-20', false],
    ['오늘 시각 전이면 어제 몫을 놓쳤어도 따라잡지 않는다', '2026-10-20T03:59:59+09:00', '2026-10-18', false],
    ['시각은 서울 기준이다(UTC로는 전날 19시)', '2026-10-19T19:00:00Z', '2026-10-19', true],
  ])('%s', (_, now, lastSlot, expected) => {
    expect(isDue('04:00', lastSlot, at(now), 'Asia/Seoul')).toBe(expected);
  });
});

describe('cronOf', () => {
  it.each([
    ['04:00', '0 0 4 * * *'],
    ['07:30', '0 30 7 * * *'],
    ['21:00', '0 0 21 * * *'],
  ])('%s → %s', (time, cron) => {
    expect(cronOf(time)).toBe(cron);
  });
});

describe('runStage', () => {
  it('실패는 던지지 않고 결과로 돌려준다', async () => {
    const results = [
      await runStage('동기화', () => Promise.reject(new Error('Notion 응답 없음'))),
      await runStage('추출', () => Promise.resolve('문서 2개')),
    ];

    expect(stagesText(results)).toBe('동기화 실패: Notion 응답 없음 / 추출: 문서 2개');
  });
});
