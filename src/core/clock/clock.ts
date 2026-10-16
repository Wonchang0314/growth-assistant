import { Injectable } from '@nestjs/common';

/** 현재 시각 포트. 시각에 따라 달라지는 동작(기록 시각, 최근 기록 순서, 복습 예정일)을 테스트에서 고정된 시각으로 확인한다. */
export abstract class Clock {
  abstract now(): Date;
  /** 사용자에게 시각을 보여 줄 때 쓰는 시간대 (IANA 이름, 예: `Asia/Seoul`). */
  abstract readonly timeZone: string;
}

@Injectable()
export class SystemClock extends Clock {
  /** 서버를 실행하는 기기의 시간대. */
  readonly timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  now(): Date {
    return new Date();
  }
}
