import 'reflect-metadata';
import { join } from 'node:path';
import { inspect } from 'node:util';
import type { LoggerService } from '@nestjs/common';
import { FileLogger } from './core/logging/file-logger.js';
import { StderrLogger } from './core/logging/stderr-logger.js';

/**
 * MCP 진입점(mcp-stdio.ts, mcp-http.ts)의 공통 실행. 로그는 `LOG_DIR/<logName>`의 회전 파일(없으면 표준에러)에 쓴다.
 * [start]가 그 로거로 Nest 앱을 띄운다. 남은 로그는 프로세스가 끝날 때(`exit`) 쓴다.
 * 시작 실패는 표준에러에도 남긴다(Claude Desktop의 MCP 로그, 프로세스 관리자 로그).
 */
export async function runMcpEntry(logName: string, start: (logger: LoggerService) => Promise<void>): Promise<void> {
  const logDir = process.env.LOG_DIR;
  const logger = logDir ? await FileLogger.create(join(logDir, logName)) : new StderrLogger();
  process.on('exit', () => {
    if (logger instanceof FileLogger) logger.flush();
  });

  try {
    await start(logger);
  } catch (e) {
    logger.error('MCP 서버 시작 실패', inspect(e), 'Bootstrap');
    if (logger instanceof FileLogger) {
      process.stderr.write(`MCP 서버 시작 실패: ${inspect(e)}\n`);
      await logger.close();
    }
    process.exitCode = 1;
  }
}
