import { describe, expect, it } from 'vitest';
import { KeyedLock } from './keyed-lock.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('KeyedLock', () => {
  it('같은 키의 작업은 들어온 순서대로 하나씩 실행한다', async () => {
    const lock = new KeyedLock();
    const events: string[] = [];
    const task = (name: string, ms: number) =>
      lock.run('a', async () => {
        events.push(`${name} 시작`);
        await sleep(ms);
        events.push(`${name} 끝`);
      });

    await Promise.all([task('1', 30), task('2', 0), task('3', 0)]);

    expect(events).toEqual(['1 시작', '1 끝', '2 시작', '2 끝', '3 시작', '3 끝']);
  });

  it('다른 키의 작업은 기다리지 않는다', async () => {
    const lock = new KeyedLock();
    const events: string[] = [];

    await Promise.all([
      lock.run('a', async () => {
        await sleep(30);
        events.push('a');
      }),
      lock.run('b', () => {
        events.push('b');
        return Promise.resolve();
      }),
    ]);

    expect(events).toEqual(['b', 'a']);
  });

  it('앞 작업이 실패해도 다음 작업은 실행하고, 끝나면 키를 정리한다', async () => {
    const lock = new KeyedLock();

    const failed = lock.run('a', () => Promise.reject(new Error('실패')));
    const next = lock.run('a', () => Promise.resolve('다음'));

    await expect(failed).rejects.toThrow('실패');
    expect(await next).toBe('다음');
    expect(lock.size).toBe(0);
  });
});
