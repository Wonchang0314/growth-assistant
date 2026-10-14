import { Clock } from '../../src/core/clock/clock.js';

/** 고정된 시각을 돌려준다. [advance]로 시간을 흘린다. */
export class FixedClock extends Clock {
  constructor(private current: Date) {
    super();
  }

  now(): Date {
    return this.current;
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
