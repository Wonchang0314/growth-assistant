import { describe, expect, it } from 'vitest';
import { ASSUMED_RATE_LIMITED, readClaudeFixture } from '../../../test/fixtures/claude.js';
import { ClaudeException } from './claude.client.js';
import { classifyError, parseClaudeStream } from './claude-stream.parser.js';

describe('parseClaudeStream', () => {
  it('텍스트 응답과 한도 상태를 읽는다', () => {
    const output = parseClaudeStream(readClaudeFixture('stream-text-success.jsonl'));

    expect(output.result).toBe('2');
    expect(classifyError(output)).toBeUndefined();
    expect(output.rateLimit).toEqual({ status: 'allowed', resetsAt: new Date(1791868200 * 1000) });
  });

  it('스키마 응답은 structured_output으로 읽는다', () => {
    const output = parseClaudeStream(readClaudeFixture('stream-schema-success.jsonl'));

    expect(output.structuredOutput).toMatchObject({ answer: 51 });
    expect(classifyError(output)).toBeUndefined();
  });

  it('웹 검색 응답의 출처를 구조화된 값으로 받는다', () => {
    const output = parseClaudeStream(readClaudeFixture('stream-websearch-schema-success.jsonl'));

    expect(output.structuredOutput).toMatchObject({
      sources: [expect.objectContaining({ url: 'https://github.com/discord-jda/JDA/releases/latest' })],
    });
  });

  it('미로그인은 subtype이 success여도 AUTH로 분류한다', () => {
    const error = classifyError(parseClaudeStream(readClaudeFixture('stream-error-not-logged-in.jsonl')));

    expect(error?.type).toBe('AUTH');
  });

  it('알 수 없는 모델은 UNKNOWN으로 분류한다', () => {
    const error = classifyError(parseClaudeStream(readClaudeFixture('stream-error-unknown-model.jsonl')));

    expect(error?.type).toBe('UNKNOWN');
  });

  it('한도 초과는 재개 시각과 함께 RATE_LIMIT으로 분류한다', () => {
    const error = classifyError(parseClaudeStream(ASSUMED_RATE_LIMITED));

    expect(error?.type).toBe('RATE_LIMIT');
    expect(error?.resetsAt).toEqual(new Date(1791868200 * 1000));
  });

  it('result 이벤트가 없으면 INVALID_OUTPUT이다', () => {
    const stdout = readClaudeFixture('stream-text-success.jsonl')
      .split('\n')
      .filter((line) => !line.includes('"type":"result"'))
      .join('\n');

    expect(() => parseClaudeStream(stdout)).toThrow(expect.objectContaining({ type: 'INVALID_OUTPUT' }));
  });

  it('JSON이 아닌 줄이 섞이면 INVALID_OUTPUT이다', () => {
    expect(() => parseClaudeStream('{not json')).toThrow(ClaudeException);
  });
});
