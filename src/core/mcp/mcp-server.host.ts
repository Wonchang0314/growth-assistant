import { inspect } from 'node:util';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { type CallToolResult, McpServer, type Transport } from '@modelcontextprotocol/server';
import { isMcpToolHandler, McpTool, type McpToolHandler } from './mcp-tool.js';

export interface McpServerOptions {
  /** 연결할 때 Claude에 알리는 서버 이름과 버전. */
  readonly name: string;
  readonly version: string;
  /** 연결할 때 Claude에 전달하는 사용 지침. */
  readonly instructions?: string;
}

export const MCP_SERVER_OPTIONS = Symbol('MCP_SERVER_OPTIONS');

/** 기능 모듈의 `@McpTool()` 처리기를 모아 MCP 서버를 만들고, 진입점이 준 전송(stdio·HTTP)에 붙인다. */
@Injectable()
export class McpServerHost implements OnModuleInit {
  private readonly logger = new Logger(McpServerHost.name);
  private readonly tools = new Map<string, McpToolHandler>();

  constructor(
    @Inject(MCP_SERVER_OPTIONS) private readonly options: McpServerOptions,
    private readonly discovery: DiscoveryService,
  ) {}

  get toolNames(): string[] {
    return [...this.tools.keys()];
  }

  /** 처리기를 모은다. 전송에 연결하기 전이라 이름이 겹치는 실수를 테스트에서 잡는다. */
  onModuleInit(): void {
    for (const wrapper of this.discovery.getProviders({ metadataKey: McpTool.KEY })) {
      const instance: unknown = wrapper.instance;
      if (!isMcpToolHandler(instance)) throw new Error(`McpToolHandler가 아니다: ${String(instance)}`);
      if (this.tools.has(instance.name)) throw new Error(`MCP 도구 이름이 겹친다: ${instance.name}`);
      this.tools.set(instance.name, instance);
    }
  }

  /**
   * 도구를 모두 등록한 새 MCP 서버. SDK 서버 하나는 연결 하나만 받으므로 연결마다 만든다.
   * HTTP 진입점(`listenMcpHttp`)은 요청마다 만든다.
   */
  buildServer(): McpServer {
    const server = new McpServer(
      { name: this.options.name, version: this.options.version },
      this.options.instructions ? { instructions: this.options.instructions } : {},
    );
    for (const tool of this.tools.values()) {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: { readOnlyHint: tool.readOnly, destructiveHint: false, openWorldHint: false },
        },
        (input) => this.call(tool, input),
      );
    }
    return server;
  }

  /**
   * 오래 이어지는 전송(stdio, 테스트의 메모리 전송)에 새 서버를 연결한다.
   * 돌려준 Promise는 연결이 끊기면(stdio: Claude Desktop이 표준입력을 닫으면) 끝난다.
   */
  async connect(transport: Transport): Promise<{ closed: Promise<void> }> {
    const server = this.buildServer();
    const closed = new Promise<void>((resolve) => {
      server.server.onclose = resolve;
    });
    await server.connect(transport);
    this.logger.log(`MCP 연결: 도구 ${this.toolNames.join(', ')}`);
    return { closed };
  }

  /** 처리기에서 난 예외는 프로세스를 끝내지 않고 도구 오류 결과로 바꾼다. Claude가 대화에서 원인을 전달한다. */
  private async call(tool: McpToolHandler, input: Record<string, unknown>): Promise<CallToolResult> {
    const startedAt = performance.now();
    try {
      const result = await tool.handle(input);
      this.logger.log(`${tool.name} 완료 (${Math.round(performance.now() - startedAt)}ms)`);
      // 구조화된 내용은 JSON 텍스트로도 함께 준다. structuredContent를 읽지 않는 클라이언트도 내용을 받게 하기 위해서다.
      return result.data
        ? {
            content: [
              { type: 'text', text: result.text },
              { type: 'text', text: JSON.stringify(result.data) },
            ],
            structuredContent: result.data,
          }
        : { content: [{ type: 'text', text: result.text }] };
    } catch (e) {
      this.logger.error(`${tool.name} 실패`, inspect(e));
      return { isError: true, content: [{ type: 'text', text: `${tool.name} 실패: ${describeFailure(e)}` }] };
    }
  }
}

/** 예외 메시지와 원인(cause). Drizzle의 "Failed query" 오류는 DB 연결 실패 같은 실제 원인을 cause에 둔다. */
function describeFailure(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  return e.cause === undefined ? e.message : `${e.message} (원인: ${describeFailure(e.cause)})`;
}
