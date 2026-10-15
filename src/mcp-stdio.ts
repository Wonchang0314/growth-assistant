import 'reflect-metadata';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { FileLogger } from './core/logging/file-logger.js';
import { StderrLogger } from './core/logging/stderr-logger.js';
import { McpServerHost } from './core/mcp/mcp-server.host.js';
import { McpAppModule } from './mcp-app.module.js';

/*
 * MCP 진입점. Claude Desktop이 `node dist/mcp-stdio.js`로 띄우고 표준입력·표준출력으로 JSON-RPC 메시지를 주고받는다.
 * 표준출력은 메시지 통로라서 로그는 LOG_DIR/mcp의 회전 파일(없으면 표준에러)에만 쓴다.
 */
const logDir = process.env.LOG_DIR;
const logger = logDir ? await FileLogger.create(join(logDir, 'mcp')) : new StderrLogger();
process.on('exit', () => {
  if (logger instanceof FileLogger) logger.flush();
});

try {
  const app = await NestFactory.createApplicationContext(McpAppModule, { abortOnError: false, logger });
  const { closed } = await app.get(McpServerHost).connect(new StdioServerTransport());
  await closed;
  Logger.log('MCP 연결 종료', 'Bootstrap');
  await app.close();
  if (logger instanceof FileLogger) await logger.close();
} catch (e) {
  // 시작 실패(환경 변수 오류 등)는 Claude Desktop의 MCP 로그에도 남도록 표준에러에도 쓴다.
  logger.error('MCP 서버 시작 실패', inspect(e), 'Bootstrap');
  if (logger instanceof FileLogger) {
    process.stderr.write(`MCP 서버 시작 실패: ${inspect(e)}\n`);
    await logger.close();
  }
  process.exitCode = 1;
}
