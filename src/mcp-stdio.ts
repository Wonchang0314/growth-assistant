import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { McpServerHost } from './core/mcp/mcp-server.host.js';
import { McpAppModule } from './mcp-app.module.js';
import { runMcpEntry } from './mcp-entry.js';

/*
 * MCP stdio 진입점. Claude Desktop이 `node dist/mcp-stdio.js`로 띄우고 표준입력·표준출력으로 JSON-RPC 메시지를 주고받는다.
 * HTTP가 필요 없으므로 Nest 애플리케이션 컨텍스트로 띄운다.
 * 표준출력은 메시지 통로라서 로그는 LOG_DIR/mcp의 회전 파일(없으면 표준에러)에만 쓴다.
 * Claude Desktop이 표준입력을 닫으면 끝난다.
 */
await runMcpEntry('mcp', async (logger) => {
  const app = await NestFactory.createApplicationContext(McpAppModule, { abortOnError: false, logger });
  const { closed } = await app.get(McpServerHost).connect(new StdioServerTransport());
  await closed;
  Logger.log('MCP 서버 종료', 'Bootstrap');
  await app.close();
});
