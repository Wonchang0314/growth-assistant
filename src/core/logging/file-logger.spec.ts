import { Logger } from '@nestjs/common';
import type { RollStream } from 'pino-roll';
import { afterEach, describe, expect, it } from 'vitest';
import { FileLogger } from './file-logger.js';

describe('FileLogger', () => {
  const lines: string[] = [];
  const stream: RollStream = {
    write: (chunk) => lines.push(chunk) > 0,
    flushSync: () => undefined,
    end: () => undefined,
    once: () => stream,
  };
  const logger = new FileLogger(stream);

  afterEach(() => {
    lines.length = 0;
    Logger.overrideLogger(false);
  });

  it('한 줄에 시각, 수준, 컨텍스트, 메시지를 쓴다', () => {
    logger.log('MCP 연결', 'McpServerHost');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} LOG {5}\[McpServerHost] MCP 연결\n$/);
  });

  it('Nest Logger로 남긴 오류는 스택까지 쓴다', () => {
    Logger.overrideLogger(logger);

    new Logger('IdleSessionJob').error('유휴 세션 종료 실패', new Error('DB 꺼짐'));

    const text = lines.join('');
    expect(text).toContain('ERROR   [IdleSessionJob] 유휴 세션 종료 실패');
    expect(text).toContain('Error: DB 꺼짐\n    at ');
  });
});
