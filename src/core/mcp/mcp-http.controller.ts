import { inspect } from 'node:util';
import { All, Controller, Logger, type OnApplicationShutdown, Req, Res } from '@nestjs/common';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import type { Request, Response } from 'express';
import { McpServerHost } from './mcp-server.host.js';

/**
 * `/mcp`에서 MCP Streamable HTTP를 받는다. 요청마다 [McpServerHost.buildServer]로 새 서버를 만들어 답하므로 세션 상태가 없다.
 * SDK 처리기는 웹 표준 `Request`→`Response` 함수라서 `toNodeHandler`로 Express 요청·응답에 잇는다.
 * 응답은 처리기가 직접 쓰므로(`@Res()`) Nest는 반환값으로 응답하지 않는다.
 * Host·Origin 검사는 루트 모듈이 이 컨트롤러에 미들웨어로 건다(McpHttpAppModule).
 */
@Controller('mcp')
export class McpHttpController implements OnApplicationShutdown {
  private readonly logger = new Logger(McpHttpController.name);
  private readonly handler;
  private readonly handle;

  constructor(host: McpServerHost) {
    const onerror = (e: Error) => {
      this.logger.error('MCP HTTP 요청 실패', inspect(e));
    };
    this.handler = createMcpHandler(() => host.buildServer(), { onerror });
    this.handle = toNodeHandler(this.handler, { onerror });
  }

  @All()
  async serve(@Req() req: Request, @Res() res: Response): Promise<void> {
    // Nest가 JSON 본문을 이미 읽었으므로 파싱한 본문을 넘긴다.
    await this.handle(req, res, req.body);
  }

  /** 종료할 때 진행 중인 MCP 요청을 끊는다. */
  async onApplicationShutdown(): Promise<void> {
    await this.handler.close();
    this.logger.log('MCP HTTP 종료');
  }
}
