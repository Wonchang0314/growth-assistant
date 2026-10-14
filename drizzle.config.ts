import { defineConfig } from 'drizzle-kit';

// `npm run db:studio`가 .env의 접속 정보를 쓰게 한다. 마이그레이션 생성(db:generate)에는 DB가 필요 없다.
try {
  process.loadEnvFile();
} catch {
  // .env가 없으면 기본값을 쓴다.
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/**/*.schema.ts',
  out: './src/core/db/migrations',
  dbCredentials: {
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    database: process.env.POSTGRES_DB ?? 'growth',
    user: process.env.POSTGRES_USER ?? 'growth',
    password: process.env.POSTGRES_PASSWORD ?? 'growth',
    ssl: false,
  },
});
