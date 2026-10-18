import { ConfigService } from '@nestjs/config';
import type { Env } from './core/config/env.js';
import { listenMcpHttp } from './core/mcp/mcp-http.server.js';
import { McpServerHost } from './core/mcp/mcp-server.host.js';
import { runMcpEntry } from './mcp-entry.js';

/*
 * MCP Streamable HTTP 진입점 (`npm run mcp:http`). stdio 진입점과 같은 모듈·도구를 `MCP_HTTP_HOST:MCP_HTTP_PORT/mcp`로 받는다.
 * 원격 커스텀 커넥터(4단계)의 바탕이다. 인증과 공개 경로는 아직 없으므로 기본값(127.0.0.1)으로만 띄운다.
 * 로그는 LOG_DIR/mcp-http에 쓰고, SIGINT·SIGTERM을 받으면 받던 요청을 끊고 닫는다.
 */
await runMcpEntry('mcp-http', async (app) => {
  const config: ConfigService<Env, true> = app.get(ConfigService);
  const server = await listenMcpHttp(app.get(McpServerHost), {
    hostname: config.get('MCP_HTTP_HOST', { infer: true }),
    port: config.get('MCP_HTTP_PORT', { infer: true }),
  });
  await new Promise<void>((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
  await server.close();
});
