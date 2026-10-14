import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readClaudeFixture } from '../../../test/fixtures/claude.js';
import { FixedClock } from '../../../test/fakes/fixed-clock.js';
import type { AdminNotifier } from '../discord/admin-notifier.js';
import { ClaudeException, type ClaudeRequest } from './claude.client.js';
import { ClaudeCliClient } from './claude-cli.client.js';
import type { ClaudeProcessRunner, ProcessResult } from './claude-process.runner.js';
import { ClaudeSettings } from './claude.settings.js';
import type { LlmCallLogRepository } from './llm-call-log.repository.js';
import type { NewLlmCallLog } from './llm-call-log.schema.js';

type Step = () => ProcessResult | Promise<ProcessResult>;

/** 호출된 명령·표준입력을 기록하고, 준비한 응답을 차례로 돌려준다. */
class ScriptedRunner implements ClaudeProcessRunner {
  readonly calls: { command: string[]; stdin: string }[] = [];
  private readonly steps: Step[];

  constructor(...steps: Step[]) {
    this.steps = steps;
  }

  async run(command: string[], stdin: string): Promise<ProcessResult> {
    this.calls.push({ command, stdin });
    const step = this.steps.shift();
    if (!step) throw new Error('준비한 응답이 없다');
    return step();
  }
}

const success =
  (fixture: string): Step =>
  () => ({ exitCode: 0, stdout: readClaudeFixture(fixture), stderr: '' });
const notLoggedIn: Step = () => ({
  exitCode: 1,
  stdout: readClaudeFixture('stream-error-not-logged-in.jsonl'),
  stderr: '',
});
const timeout: Step = () => {
  throw new ClaudeException('TIMEOUT', '시간 초과');
};

const answerSchema = z.object({ answer: z.number().int(), explanation: z.string() });

function setup(runner: ClaudeProcessRunner, { maxConcurrency = 2, failLogs = false } = {}) {
  const logs: NewLlmCallLog[] = [];
  const alerts: string[] = [];
  const callLogs = {
    insert: (entry: NewLlmCallLog) => {
      if (failLogs) return Promise.reject(new Error('DB 꺼짐'));
      logs.push(entry);
      return Promise.resolve({ ...entry, id: logs.length, error: entry.error ?? null });
    },
  } as unknown as LlmCallLogRepository;
  const notifier: AdminNotifier = {
    notify: (message: string) => {
      alerts.push(message);
      return Promise.resolve();
    },
  };
  const settings = new ClaudeSettings({
    executable: 'claude',
    workDir: '/tmp/growth-assistant-test-claude-work',
    maxConcurrency,
    purposes: {
      TUTOR_CHAT: { model: 'sonnet', timeoutMs: 180_000, webAccess: true },
      SESSION_SUMMARY: { model: 'haiku', timeoutMs: 60_000, webAccess: false },
    },
  });
  const client = new ClaudeCliClient(
    settings,
    runner,
    callLogs,
    new FixedClock(new Date('2026-10-13T00:00:00Z')),
    notifier,
  );
  return { client, logs, alerts };
}

const summary = (prompt: string, systemPrompt?: string): ClaudeRequest => ({
  purpose: 'SESSION_SUMMARY',
  prompt,
  systemPrompt,
});

describe('ClaudeCliClient', () => {
  it('격리 옵션을 붙이고 프롬프트는 표준입력으로 보낸다', async () => {
    const runner = new ScriptedRunner(success('stream-text-success.jsonl'));

    const reply = await setup(runner).client.complete(summary('1+1은?', '요약가'));

    expect(reply).toBe('2');
    expect(runner.calls).toEqual([
      {
        stdin: '1+1은?',
        command: [
          'claude',
          '-p',
          '--output-format',
          'stream-json',
          '--verbose',
          '--model',
          'haiku',
          '--setting-sources',
          '',
          '--strict-mcp-config',
          '--no-session-persistence',
          '--tools',
          '',
          '--system-prompt',
          '요약가',
        ],
      },
    ]);
  });

  it('웹을 허용한 용도는 WebSearch와 WebFetch만 연다', async () => {
    const runner = new ScriptedRunner(success('stream-text-success.jsonl'));

    await setup(runner).client.complete({ purpose: 'TUTOR_CHAT', prompt: '질문' });

    const command = runner.calls[0]?.command ?? [];
    expect(command[command.indexOf('--tools') + 1]).toBe('WebSearch,WebFetch');
    expect(command[command.indexOf('--allowedTools') + 1]).toBe('WebSearch,WebFetch');
  });

  it('스키마 응답을 zod 스키마로 검증해 돌려주고, 같은 스키마를 JSON Schema로 넘긴다', async () => {
    const runner = new ScriptedRunner(success('stream-schema-success.jsonl'));

    const answer = await setup(runner).client.completeStructured(summary('17*3은?'), answerSchema);

    expect(answer.answer).toBe(51);
    const command = runner.calls[0]?.command ?? [];
    const jsonSchema: unknown = JSON.parse(command[command.indexOf('--json-schema') + 1] ?? '');
    expect(jsonSchema).toMatchObject({
      type: 'object',
      properties: { answer: { type: 'integer' }, explanation: { type: 'string' } },
      required: ['answer', 'explanation'],
    });
  });

  it('스키마에 맞지 않으면 오류를 붙여 한 번 다시 요청한다', async () => {
    const runner = new ScriptedRunner(success('stream-text-success.jsonl'), success('stream-schema-success.jsonl'));
    const { client, logs } = setup(runner);

    const answer = await client.completeStructured(summary('17*3은?'), answerSchema);

    expect(answer.answer).toBe(51);
    const retryPrompt = runner.calls[1]?.stdin ?? '';
    expect(retryPrompt.startsWith('17*3은?')).toBe(true);
    expect(retryPrompt).toContain('structured_output이 없다');
    expect(logs.map((l) => l.success)).toEqual([false, true]);
  });

  it('다시 요청해도 형식이 틀리면 INVALID_OUTPUT으로 실패한다', async () => {
    const runner = new ScriptedRunner(success('stream-text-success.jsonl'), success('stream-text-success.jsonl'));

    await expect(setup(runner).client.completeStructured(summary('q'), answerSchema)).rejects.toMatchObject({
      type: 'INVALID_OUTPUT',
    });
    expect(runner.calls).toHaveLength(2);
  });

  it('타임아웃이면 한 번 재시도한다', async () => {
    const runner = new ScriptedRunner(timeout, success('stream-text-success.jsonl'));

    expect(await setup(runner).client.complete(summary('q'))).toBe('2');
    expect(runner.calls).toHaveLength(2);
  });

  it('두 번 연속 타임아웃이면 TIMEOUT으로 실패하고 두 번 모두 기록한다', async () => {
    const runner = new ScriptedRunner(timeout, timeout);
    const { client, logs } = setup(runner);

    await expect(client.complete(summary('q'))).rejects.toMatchObject({ type: 'TIMEOUT' });
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => !l.success && l.error?.startsWith('TIMEOUT'))).toBe(true);
  });

  it('인증 오류는 재시도하지 않고 기록한다', async () => {
    const runner = new ScriptedRunner(notLoggedIn);
    const { client, logs } = setup(runner);

    await expect(client.complete({ purpose: 'TUTOR_CHAT', prompt: 'q' })).rejects.toMatchObject({ type: 'AUTH' });
    expect(runner.calls).toHaveLength(1);
    expect(logs).toEqual([
      expect.objectContaining({
        purpose: 'TUTOR_CHAT',
        model: 'sonnet',
        success: false,
        createdAt: new Date('2026-10-13T00:00:00Z'),
      }),
    ]);
  });

  it('인증 오류는 한 번만 알리고, 성공한 뒤 다시 실패하면 또 알린다', async () => {
    const runner = new ScriptedRunner(notLoggedIn, notLoggedIn, success('stream-text-success.jsonl'), notLoggedIn);
    const { client, alerts } = setup(runner);

    await expect(client.complete(summary('q'))).rejects.toThrow(ClaudeException);
    await expect(client.complete(summary('q'))).rejects.toThrow(ClaudeException);
    expect(alerts).toHaveLength(1);

    await client.complete(summary('q'));
    await expect(client.complete(summary('q'))).rejects.toThrow(ClaudeException);
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toContain('Not logged in');
  });

  it('호출 기록 저장이 실패해도 응답은 그대로 돌려준다', async () => {
    const runner = new ScriptedRunner(success('stream-text-success.jsonl'));
    const { client } = setup(runner, { failLogs: true });

    expect(await client.complete(summary('q'))).toBe('2');
  });

  it('동시 실행은 설정한 개수를 넘지 않는다', async () => {
    let running = 0;
    let peak = 0;
    const runner: ClaudeProcessRunner = {
      run: async () => {
        peak = Math.max(peak, ++running);
        await new Promise((resolve) => setTimeout(resolve, 50));
        running--;
        return { exitCode: 0, stdout: readClaudeFixture('stream-text-success.jsonl'), stderr: '' };
      },
    };
    const { client } = setup(runner, { maxConcurrency: 2 });

    await Promise.all([1, 2, 3, 4, 5].map((i) => client.complete(summary(`q${i}`))));

    expect(peak).toBe(2);
  });
});
