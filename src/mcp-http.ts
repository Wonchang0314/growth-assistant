import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Env } from './core/config/env.js';
import { McpServerHost } from './core/mcp/mcp-server.host.js';
import { runMcpEntry } from './mcp-entry.js';
import { McpHttpAppModule } from './mcp-http-app.module.js';

/*
 * MCP HTTP 진입점 (`npm run mcp:http`). stdio 진입점과 같은 모듈·도구에 HTTP 경로(`/mcp`, `/healthz`)를 얹어
 * Nest HTTP 앱(Express)으로 `MCP_HTTP_HOST:MCP_HTTP_PORT`에서 받는다. 원격 커스텀 커넥터(4단계, ADR-0035)의 바탕이다.
 * 인증이 아직 없으므로 기본값(127.0.0.1)으로만 띄운다. 로그는 LOG_DIR/mcp-http에 쓴다.
 * SIGINT·SIGTERM을 받으면 Nest가 앱을 닫고(열린 연결은 끊는다) 프로세스를 끝낸다.
 */
await runMcpEntry('mcp-http', async (logger) => {
  const app = await NestFactory.create<NestExpressApplication>(McpHttpAppModule, {
    abortOnError: false,
    logger,
    // SSE처럼 오래 열린 연결이 있어도 종료가 멈추지 않게 한다.
    forceCloseConnections: true,
  });
  // process.exit로 끝내야 `exit` 이벤트에서 파일 로그를 마저 쓴다(runMcpEntry).
  app.enableShutdownHooks(['SIGINT', 'SIGTERM'], { useProcessExit: true });

  const config: ConfigService<Env, true> = app.get(ConfigService);
  await app.listen(config.get('MCP_HTTP_PORT', { infer: true }), config.get('MCP_HTTP_HOST', { infer: true }));
  const tools = app.get(McpServerHost).toolNames.join(', ');
  Logger.log(`MCP HTTP 대기: ${await app.getUrl()}/mcp, 도구 ${tools}`, 'Bootstrap');
});
