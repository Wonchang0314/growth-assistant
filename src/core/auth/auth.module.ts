import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { AdminNotifierModule } from '../logging/admin-notifier.module.js';
import { AuthSettings } from './auth-settings.js';
import { AuthorizationRepository } from './authorization.repository.js';
import { AuthorizationService } from './authorization.service.js';
import { AuthorizeController } from './authorize.controller.js';
import { ClientMetadataSource, HttpClientMetadataSource } from './client-metadata.source.js';
import { GoogleLogin, GoogleOidcLogin } from './google-login.js';
import { OAuthMetadataController } from './oauth-metadata.controller.js';
import { TokenController } from './token.controller.js';
import { TokenRepository } from './token.repository.js';
import { TokenService } from './token.service.js';

/**
 * OAuth 2.1 인가 서버 + `/mcp` 보호 (ADR-0035, 설계 문서 7.7). 이 서버가 인가 서버이자 자원 서버다.
 * HTTP 진입점의 루트 모듈(McpHttpAppModule)만 import한다. 흐름 순서대로 읽으면 된다.
 *
 * ① 탐색: `/mcp`가 401 → 메타데이터 2개 (oauth-metadata.controller.ts)
 * ② `GET /authorize`: CIMD로 클라이언트 확인, 요청 저장, 구글로 (authorize.controller.ts → authorization.service.ts)
 * ③ `GET /oauth/google/callback`: 구글 id_token 검증, 허용 이메일 → 동의 화면 (같은 파일, google-login.ts, auth-pages.ts)
 * ④ `POST /oauth/consent`: 허용이면 1회용 인가 코드를 들고 클라이언트로 (같은 파일)
 * ⑤ `POST /token`: 코드 + PKCE → 토큰, 리프레시 회전과 재사용 탐지 (token.controller.ts → token.service.ts)
 * ⑥ `/mcp`: Bearer 검사 (bearer-auth.middleware.ts, McpHttpAppModule이 건다)
 */
@Module({
  imports: [AdminNotifierModule],
  controllers: [OAuthMetadataController, AuthorizeController, TokenController],
  providers: [
    {
      provide: AuthSettings,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        AuthSettings.fromEnv({
          PUBLIC_BASE_URL: config.get('PUBLIC_BASE_URL', { infer: true }),
          GOOGLE_OAUTH_CLIENT_ID: config.get('GOOGLE_OAUTH_CLIENT_ID', { infer: true }),
          GOOGLE_OAUTH_CLIENT_SECRET: config.get('GOOGLE_OAUTH_CLIENT_SECRET', { infer: true }),
          OAUTH_ALLOWED_EMAILS: config.get('OAUTH_ALLOWED_EMAILS', { infer: true }),
          OAUTH_CLIENT_ID_HOSTS: config.get('OAUTH_CLIENT_ID_HOSTS', { infer: true }),
        }),
    },
    { provide: ClientMetadataSource, useClass: HttpClientMetadataSource },
    { provide: GoogleLogin, useClass: GoogleOidcLogin },
    AuthorizationRepository,
    TokenRepository,
    AuthorizationService,
    TokenService,
  ],
  // BearerAuthMiddleware가 McpHttpAppModule에서 주입받는다.
  exports: [AuthSettings, TokenService],
})
export class AuthModule {}
