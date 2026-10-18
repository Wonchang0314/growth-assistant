import 'reflect-metadata';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { type INestApplicationContext, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FileLogger } from './core/logging/file-logger.js';
import { StderrLogger } from './core/logging/stderr-logger.js';
import { McpAppModule } from './mcp-app.module.js';

/**
 * MCP 진입점(mcp-stdio.ts, mcp-http.ts)의 공통 실행. 로그는 `LOG_DIR/<logName>`의 회전 파일(없으면 표준에러)에 쓴다.
 * 루트 McpAppModule을 띄워 [serve]가 끝나면 닫는다. 시작 실패는 표준에러에도 남긴다(Claude Desktop의 MCP 로그, 프로세스 관리자 로그).
 */
export async function runMcpEntry(
  logName: string,
  serve: (app: INestApplicationContext) => Promise<void>,
): Promise<void> {
  const logDir = process.env.LOG_DIR;
  const logger = logDir ? await FileLogger.create(join(logDir, logName)) : new StderrLogger();
  process.on('exit', () => {
    if (logger instanceof FileLogger) logger.flush();
  });

  try {
    const app = await NestFactory.createApplicationContext(McpAppModule, { abortOnError: false, logger });
    await serve(app);
    Logger.log('MCP 서버 종료', 'Bootstrap');
    await app.close();
    if (logger instanceof FileLogger) await logger.close();
  } catch (e) {
    logger.error('MCP 서버 시작 실패', inspect(e), 'Bootstrap');
    if (logger instanceof FileLogger) {
      process.stderr.write(`MCP 서버 시작 실패: ${inspect(e)}\n`);
      await logger.close();
    }
    process.exitCode = 1;
  }
}
