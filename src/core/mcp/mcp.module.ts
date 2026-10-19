import { type DynamicModule, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { MCP_SERVER_OPTIONS, McpServerHost, type McpServerOptions } from './mcp-server.host.js';

/**
 * MCP 서버 기반. MCP 진입점의 루트 모듈만 `forRoot`로 import한다.
 * 기능 모듈은 이 모듈을 import하지 않고 `@McpTool()` 처리기를 provider로 등록하기만 하면 된다.
 */
@Module({})
export class McpModule {
  static forRoot(options: McpServerOptions): DynamicModule {
    return {
      module: McpModule,
      // HTTP 진입점의 루트 모듈(McpHttpAppModule)이 McpServerHost를 주입받는다.
      global: true,
      imports: [DiscoveryModule],
      providers: [{ provide: MCP_SERVER_OPTIONS, useValue: options }, McpServerHost],
      exports: [McpServerHost],
    };
  }
}
