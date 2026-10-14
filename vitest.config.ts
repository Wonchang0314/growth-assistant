import { configDefaults, defineConfig } from 'vitest/config';

const DB_TESTS = ['src/**/*.db.spec.ts', 'test/**/*.db.spec.ts'];

// 데코레이터 메타데이터(Nest 주입)는 Vite의 Oxc 변환기가 tsconfig.json 설정을 읽어 만든다.
// 변환 결과가 캐시되므로 tsconfig의 데코레이터 옵션을 바꾸면 `npx vitest --clearCache`로 비운다.
export default defineConfig({
  test: {
    // 테스트에서는 Discord에 접속하지 않는다. 실행 환경 변수가 .env보다 우선한다.
    env: { DISCORD_ENABLED: 'false' },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
          exclude: [...configDefaults.exclude, ...DB_TESTS],
        },
      },
      {
        // `*.db.spec.ts`: Testcontainers PostgreSQL 하나를 함께 쓰므로 파일을 차례로 실행한다. Docker가 필요하다.
        extends: true,
        test: {
          name: 'db',
          include: DB_TESTS,
          globalSetup: ['test/db/global-setup.ts'],
          fileParallelism: false,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
