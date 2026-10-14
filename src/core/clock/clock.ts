import { Injectable } from '@nestjs/common';

/** 현재 시각 포트. 시간에 따라 바뀌는 규칙(유휴 종료, 토큰 만료)을 테스트에서 고정된 시각으로 확인한다. */
export abstract class Clock {
  abstract now(): Date;
  /** 사용자에게 시각을 보여 줄 때 쓰는 시간대 (IANA 이름, 예: `Asia/Seoul`). */
  abstract readonly timeZone: string;
}

@Injectable()
export class SystemClock extends Clock {
  /** 봇을 실행하는 기기의 시간대. */
  readonly timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  now(): Date {
    return new Date();
  }
}
