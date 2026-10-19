import { Logger, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { hostHeaderValidation, originValidation } from '@modelcontextprotocol/express';
import { localhostAllowedHostnames, localhostAllowedOrigins } from '@modelcontextprotocol/server';
import { AuthModule } from './core/auth/auth.module.js';
import { AuthSettings } from './core/auth/auth-settings.js';
import { BearerAuthMiddleware } from './core/auth/bearer-auth.middleware.js';
import { HealthModule } from './core/health/health.module.js';
import { McpHttpController } from './core/mcp/mcp-http.controller.js';
import { SchedulerHostModule } from './core/scheduler/scheduler.module.js';
import { McpAppModule } from './mcp-app.module.js';
import { OutreachModule } from './tutor/outreach/outreach.module.js';

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
   * `/mcp` 앞의 검사. DNS 리바인딩을 막으려고 Host는 localhost와 공개 호스트(터널이 Host를 그대로 넘긴다)만,
   * Origin은 거기에 받는 클라이언트 호스트(ChatGPT는 `Origin: https://chatgpt.com`을 싣는다)를 더해 받고(아니면 403),
   * 그다음 Bearer 토큰을 본다(아니면 401). `/healthz`와 OAuth 경로에는 걸지 않는다.
   */
  configure(consumer: MiddlewareConsumer): void {
    const publicHost = new URL(this.authSettings.issuer).hostname;
    consumer
      .apply(
        hostHeaderValidation([...localhostAllowedHostnames(), publicHost]),
        originValidation([...localhostAllowedOrigins(), publicHost, ...this.authSettings.clientIdHosts]),
        BearerAuthMiddleware,
      )
      .forRoutes(McpHttpController);
  }
}

/**
 * 상시 실행 HTTP 진입점(mcp-http.ts)의 루트 모듈. [McpHttpAppModule]에 스케줄러와 예약 작업(새벽 준비, 학습 알림)을 더한다
 * (ADR-0036). 테스트는 스케줄러가 돌지 않게 McpHttpAppModule을 띄운다.
 */
@Module({ imports: [McpHttpAppModule, SchedulerHostModule, OutreachModule] })
export class McpHttpServerModule {}

/**
 * Nest 앱을 만든 뒤 진입점과 테스트가 함께 거는 HTTP 설정. 응답에 서버 종류(`X-Powered-By: Express`)를 싣지 않는다.
 * `/healthz`를 뺀 요청마다 메서드·경로·상태·Origin·User-Agent를 남긴다(클라이언트가 어디서 멈췄는지 보려고).
 * 쿼리와 헤더 값(토큰)은 남기지 않는다.
 */
export function configureHttpApp(app: NestExpressApplication): void {
  app.disable('x-powered-by');
  const logger = new Logger('HttpRequest');
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path !== '/healthz')
      res.on('finish', () => {
        logger.log(
          `${req.method} ${req.path} ${res.statusCode} origin=${req.headers.origin ?? '-'} ua=${req.headers['user-agent'] ?? '-'}`,
        );
      });
    next();
  });
}
