import { describe, expect, it } from 'vitest';
import { AlertThrottle } from './alert-throttle.js';

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 20, 0, minutes));

describe('AlertThrottle', () => {
  it('첫 알림은 바로 보낸다', () => {
    expect(new AlertThrottle().admit('A', at(0))).toBe(0);
  });

  it('보낸 뒤 1시간 안의 같은 종류는 보내지 않고 세었다가, 1시간 뒤 첫 알림에 건수를 붙인다', () => {
    const throttle = new AlertThrottle();
    throttle.admit('A', at(0));

    expect(throttle.admit('A', at(10))).toBeNull();
    expect(throttle.admit('A', at(59))).toBeNull();
    expect(throttle.admit('A', at(60))).toBe(2);
    expect(throttle.admit('A', at(61))).toBeNull();
  });

  it('종류가 다르면 따로 센다', () => {
    const throttle = new AlertThrottle();
    throttle.admit('A', at(0));

    expect(throttle.admit('B', at(1))).toBe(0);
  });
});
