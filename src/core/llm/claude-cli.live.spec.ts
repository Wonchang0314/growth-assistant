import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FixedClock } from '../../../test/fakes/fixed-clock.js';
import { ClaudeCliClient } from './claude-cli.client.js';
import { OsClaudeProcessRunner } from './claude-process.runner.js';
import { ClaudeSettings } from './claude.settings.js';
import type { LlmCallLogRepository } from './llm-call-log.repository.js';

/**
 * 실제 `claude` CLI를 호출한다. 구독 사용량을 쓰므로 기본으로 건너뛴다.
 * CLI를 올리거나 다른 기기에서 처음 실행할 때 확인한다: `CLAUDE_LIVE=1 npx vitest run claude-cli.live`
 */
describe.skipIf(process.env.CLAUDE_LIVE !== '1')('ClaudeCliClient (실제 CLI)', () => {
  const workDir = mkdtempSync(join(tmpdir(), 'claude-live-'));
  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('실제 CLI로 텍스트와 구조화된 응답을 받는다', { timeout: 200_000 }, async () => {
    const purpose = { model: 'haiku', timeoutMs: 90_000, webAccess: false };
    const client = new ClaudeCliClient(
      new ClaudeSettings({
        executable: process.env.CLAUDE_EXECUTABLE ?? 'claude',
        workDir,
        maxConcurrency: 2,
        purposes: { TUTOR_CHAT: purpose, SESSION_SUMMARY: purpose, TERM_SUGGESTION: purpose },
      }),
      new OsClaudeProcessRunner(),
      { insert: (entry: unknown) => Promise.resolve(entry) } as unknown as LlmCallLogRepository,
      new FixedClock(new Date()),
      { notify: () => Promise.resolve() },
    );

    const text = await client.complete({ purpose: 'SESSION_SUMMARY', prompt: '1+1은? 숫자만 답한다.' });
    const structured = await client.completeStructured(
      { purpose: 'SESSION_SUMMARY', prompt: '17*3은?' },
      z.object({ answer: z.number().int() }),
    );

    expect(text.trim()).toBe('2');
    expect(structured.answer).toBe(51);
  });
});
