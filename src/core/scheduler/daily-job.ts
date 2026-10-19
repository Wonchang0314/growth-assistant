import { DiscoveryService } from '@nestjs/core';
import { localDate } from '../clock/clock.js';

/** 예약 작업의 시각과 "그날"을 정하는 시간대 (ADR-0036). */
export const SCHEDULE_TIME_ZONE = 'Asia/Seoul';

/**
 * 매일 [at]에 도는 예약 작업. 기능 모듈이 구현하고 `@ScheduledJob()`을 붙여 provider로 등록하면,
 * HTTP 진입점의 스케줄러(`SchedulerHostModule`)가 모아 크론에 건다. stdio 서버·CLI·테스트에서는 스케줄러가 없어 돌지 않는다.
 */
export interface DailyJob {
  /** 실행 기록(`scheduled_job`)의 키. 작업마다 달라야 한다. */
  readonly name: string;
  /** `HH:MM` ([SCHEDULE_TIME_ZONE]). */
  readonly at: string;
  /** 같은 잠금을 쓰는 작업·도구와 겹쳐 돌지 않는다(`JobLock`). 없으면 [name]. */
  readonly lock?: string;
  /** 결과 요약을 돌려준다. 실패면 던지고, 스케줄러가 기록하고 운영 알림을 보낸다. */
  run(): Promise<string>;
}

/** [DailyJob] 구현 클래스에 붙인다. */
export const ScheduledJob = DiscoveryService.createDecorator<undefined>();

export function isDailyJob(value: unknown): value is DailyJob {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    'at' in value &&
    typeof value.at === 'string' &&
    'run' in value &&
    typeof value.run === 'function'
  );
}

/** [at](`HH:MM`)에 매일 도는 크론 식 (초 분 시 일 월 요일). */
export function cronOf(at: string): string {
  const [hour, minute] = at.split(':').map(Number);
  return `0 ${minute ?? 0} ${hour ?? 0} * * *`;
}

/**
 * 지금 돌려야 하는지: 오늘 [at]이 지났고 오늘 몫(`lastSlot`, 마지막으로 돌린 날짜)을 아직 돌리지 않았으면.
 * 서버가 꺼져 있어 놓친 몫은 그날 안에 뜨면 한 번만 따라잡고, 날이 바뀌면 건너뛴다(어제 저녁 알림을 아침에 보내지 않는다).
 */
export function isDue(at: string, lastSlot: string | null | undefined, now: Date, timeZone: string): boolean {
  if (lastSlot === localDate(now, timeZone)) return false;
  return now.toLocaleTimeString('sv-SE', { timeZone, hourCycle: 'h23' }) >= at;
}

/** 여러 단계로 된 작업의 단계 하나. 실패해도 다음 단계는 한다. */
export interface StageResult {
  readonly stage: string;
  readonly ok: boolean;
  /** 성공이면 결과 요약, 실패면 오류 메시지. */
  readonly summary: string;
}

export async function runStage(stage: string, run: () => Promise<string>): Promise<StageResult> {
  try {
    return { stage, ok: true, summary: await run() };
  } catch (e) {
    return { stage, ok: false, summary: e instanceof Error ? e.message : String(e) };
  }
}

/** 단계 결과를 한 줄로. 실행 기록과 로그에 남긴다. */
export const stagesText = (results: readonly StageResult[]) =>
  results.map((r) => `${r.stage}${r.ok ? '' : ' 실패'}: ${r.summary}`).join(' / ');
