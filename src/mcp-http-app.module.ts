import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { hostHeaderValidation, originValidation } from '@modelcontextprotocol/express';
import { localhostAllowedHostnames, localhostAllowedOrigins } from '@modelcontextprotocol/server';
import { AuthModule } from './core/auth/auth.module.js';
import { AuthSettings } from './core/auth/auth-settings.js';
import { BearerAuthMiddleware } from './core/auth/bearer-auth.middleware.js';
import { HealthModule } from './core/health/health.module.js';
import { McpHttpController } from './core/mcp/mcp-http.controller.js';
import { McpAppModule } from './mcp-app.module.js';

/**
 * MCP HTTP 진입점(mcp-http.ts)의 루트 모듈. stdio와 같은 MCP 앱(McpAppModule)에 HTTP 경로를 얹는다.
 * - `/mcp`: MCP Streamable HTTP (McpHttpController), Bearer 토큰이 있어야 한다
 * - OAuth 인가 서버: 메타데이터, `/authorize`, 구글 콜백, 동의, `/token` (AuthModule)
 * - `/healthz`: 외부 헬스체크 (HealthModule)
 * McpHttpController를 McpModule이 아니라 여기 두는 것은 stdio 진입점에 HTTP 처리기가 생기지 않게 하려는 것이다.
 */
@Module({
  imports: [McpAppModule, AuthModule, HealthModule],
  controllers: [McpHttpController],
})
export class McpHttpAppModule implements NestModule {
  constructor(private readonly authSettings: AuthSettings) {}

  /**
   * `/mcp` 앞의 검사. DNS 리바인딩을 막으려고 Host·Origin은 localhost와 공개 호스트(터널이 Host를 그대로 넘긴다)만
   * 받고(아니면 403), 그다음 Bearer 토큰을 본다(아니면 401). `/healthz`와 OAuth 경로에는 걸지 않는다.
   */
  configure(consumer: MiddlewareConsumer): void {
    const publicHost = new URL(this.authSettings.issuer).hostname;
    consumer
      .apply(
        hostHeaderValidation([...localhostAllowedHostnames(), publicHost]),
        originValidation([...localhostAllowedOrigins(), publicHost]),
        BearerAuthMiddleware,
      )
      .forRoutes(McpHttpController);
  }
}

/** Nest 앱을 만든 뒤 진입점과 테스트가 함께 거는 HTTP 설정. 응답에 서버 종류(`X-Powered-By: Express`)를 싣지 않는다. */
export function configureHttpApp(app: NestExpressApplication): void {
  app.disable('x-powered-by');
}
