import { describe, expect, it, vi } from 'vitest';
import { waitForDb } from './wait-for-db.js';

describe('waitForDb', () => {
  it('실패하면 다시 불러 닿을 때 끝낸다', async () => {
    const check = vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValueOnce(undefined);

    await waitForDb(check, { attempts: 3, intervalMs: 0 });

    expect(check).toHaveBeenCalledTimes(2);
  });

  it('정한 횟수를 다 써도 닿지 않으면 마지막 오류를 던진다', async () => {
    const check = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(waitForDb(check, { attempts: 3, intervalMs: 0 })).rejects.toThrow('ECONNREFUSED');
    expect(check).toHaveBeenCalledTimes(3);
  });
});
