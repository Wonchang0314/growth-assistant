import { Injectable } from '@nestjs/common';

/** 현재 시각 포트. 시간에 따라 바뀌는 규칙(유휴 종료, 토큰 만료)을 테스트에서 고정된 시각으로 확인한다. */
export abstract class Clock {
  abstract now(): Date;
}

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
