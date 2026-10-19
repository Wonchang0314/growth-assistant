import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { localhostHostValidation, localhostOriginValidation } from '@modelcontextprotocol/express';
import { HealthModule } from './core/health/health.module.js';
import { McpHttpController } from './core/mcp/mcp-http.controller.js';
import { McpAppModule } from './mcp-app.module.js';

/**
 * MCP HTTP 진입점(mcp-http.ts)의 루트 모듈. stdio와 같은 MCP 앱(McpAppModule)에 HTTP 경로를 얹는다.
 * - `/mcp`: MCP Streamable HTTP (McpHttpController)
 * - `/healthz`: 외부 헬스체크 (HealthModule)
 * McpHttpController를 McpModule이 아니라 여기 두는 것은 stdio 진입점에 HTTP 처리기가 생기지 않게 하려는 것이다.
 */
@Module({
  imports: [McpAppModule, HealthModule],
  controllers: [McpHttpController],
})
export class McpHttpAppModule implements NestModule {
  /**
   * DNS 리바인딩을 막으려고 `/mcp`는 Host·Origin이 localhost인 요청만 받는다(아니면 403).
   * `/healthz`에는 걸지 않는다. 외부 헬스체크는 공개 도메인을 Host로 보낸다.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(localhostHostValidation(), localhostOriginValidation()).forRoutes(McpHttpController);
  }
}
