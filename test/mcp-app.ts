import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModule, type TestingModuleBuilder } from '@nestjs/testing';
import { inject, vi } from 'vitest';
import { ClientMetadataSource } from '../src/core/auth/client-metadata.source.js';
import { GoogleLogin } from '../src/core/auth/google-login.js';
import { Clock } from '../src/core/clock/clock.js';
import { FakeClientMetadataSource } from './fakes/fake-client-metadata-source.js';
import { FakeGoogleLogin } from './fakes/fake-google-login.js';

/** HTTP 앱 테스트의 공개 주소. 실제로 띄운 주소(127.0.0.1:임의 포트)와 달라도 된다(터널 뒤와 같다). */
export const TEST_PUBLIC_BASE_URL = 'https://mcp.example.test';
export const TEST_MCP_URL = `${TEST_PUBLIC_BASE_URL}/mcp`;
export const TEST_ALLOWED_EMAIL = 'me@example.com';

/**
 * 공용 테스트 DB 컨테이너에 붙는 MCP 진입점의 루트 모듈(McpAppModule)을 띄운다. 시각은 [clock]으로 고정한다.
 * 환경 변수를 바꾸므로 파일 끝에 `vi.unstubAllEnvs()`를 부른다.
 */
export async function startMcpApp(clock: Clock): Promise<TestingModule> {
  const app = await compileMcpRoot(clock, async () => (await import('../src/mcp-app.module.js')).McpAppModule);
  await app.init();
  return app;
}

/**
 * [startMcpApp]과 같지만 HTTP 진입점의 루트 모듈(McpHttpAppModule)이다. 띄우기(`listen`)는 테스트가 한다.
 * 바깥 경계(구글 로그인, CIMD 문서)는 가짜로 바꾼다.
 */
export async function createMcpHttpApp(
  clock: Clock,
  fakes: { google?: FakeGoogleLogin; clients?: FakeClientMetadataSource } = {},
) {
  vi.stubEnv('PUBLIC_BASE_URL', TEST_PUBLIC_BASE_URL);
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'test-google-client');
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'test-google-secret');
  vi.stubEnv('OAUTH_ALLOWED_EMAILS', TEST_ALLOWED_EMAIL);
  const module = await compileMcpRoot(
    clock,
    async () => (await import('../src/mcp-http-app.module.js')).McpHttpAppModule,
    (builder) =>
      builder
        .overrideProvider(GoogleLogin)
        .useValue(fakes.google ?? new FakeGoogleLogin())
        .overrideProvider(ClientMetadataSource)
        .useValue(fakes.clients ?? new FakeClientMetadataSource()),
  );
  const app = module.createNestApplication<NestExpressApplication>();
  const { configureHttpApp } = await import('../src/mcp-http-app.module.js');
  configureHttpApp(app);
  return app;
}

async function compileMcpRoot(
  clock: Clock,
  loadRoot: () => Promise<Type>,
  override: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<TestingModule> {
  const database = inject('database');
  vi.stubEnv('POSTGRES_HOST', database.host);
  vi.stubEnv('POSTGRES_PORT', String(database.port));
  vi.stubEnv('POSTGRES_DB', database.database);
  vi.stubEnv('POSTGRES_USER', database.user);
  vi.stubEnv('POSTGRES_PASSWORD', database.password);
  // ConfigModule.forRoot()는 모듈을 불러올 때 환경 변수를 읽으므로 값을 바꾼 뒤 불러온다.
  const root = await loadRoot();

  return override(
    Test.createTestingModule({ imports: [root] })
      .overrideProvider(Clock)
      .useValue(clock),
  ).compile();
}
