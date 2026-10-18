import { once } from 'node:events';
import { createServer } from 'node:http';
import { inspect } from 'node:util';
import { Logger } from '@nestjs/common';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from '@modelcontextprotocol/node';
import type { McpServerHost } from './mcp-server.host.js';

export const MCP_HTTP_PATH = '/mcp';

export interface McpHttpServer {
  /** 클라이언트가 붙을 주소 (`http://<호스트>:<포트>/mcp`). */
  readonly url: URL;
  close(): Promise<void>;
}

/**
 * Streamable HTTP로 MCP를 받는다. 요청마다 [McpServerHost.buildServer]로 새 서버를 만들어 답하므로 세션 상태가 없다.
 * DNS 리바인딩을 막으려고 Host·Origin이 localhost인 요청만 받는다. 인증은 이 검사 뒤에 같은 방식으로 끼운다
 * (`req.auth`에 붙이면 도구 처리 맥락으로 넘어간다).
 */
export async function listenMcpHttp(
  host: McpServerHost,
  { hostname, port }: { hostname: string; port: number },
): Promise<McpHttpServer> {
  const logger = new Logger('McpHttp');
  const onerror = (e: Error) => {
    logger.error('MCP HTTP 요청 실패', inspect(e));
  };
  const handler = createMcpHandler(() => host.buildServer(), { onerror });
  const handle = toNodeHandler(handler, { onerror });
  const validHost = localhostHostValidation();
  const validOrigin = localhostOriginValidation();

  const server = createServer((req, res) => {
    if (!validHost(req, res) || !validOrigin(req, res)) return;
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== MCP_HTTP_PATH) {
      res.writeHead(404).end();
      return;
    }
    void handle(req, res);
  });
  server.listen(port, hostname);
  await once(server, 'listening');

  // 포트 0이면 운영체제가 고른 포트를 쓴다(테스트).
  const address = server.address();
  const boundPort = typeof address === 'object' && address ? address.port : port;
  const url = new URL(`http://${hostname}:${boundPort}${MCP_HTTP_PATH}`);
  logger.log(`MCP HTTP 대기: ${url.href}, 도구 ${host.toolNames.join(', ')}`);
  return {
    url,
    async close() {
      await handler.close();
      server.closeAllConnections();
      await server[Symbol.asyncDispose]();
    },
  };
}
