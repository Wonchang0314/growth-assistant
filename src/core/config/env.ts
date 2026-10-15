import { z } from 'zod';

/** 실행 환경 변수. 비밀값은 레포 밖 `.env`에 두고 docker compose와 함께 읽는다 (`.env.example`). */
const envSchema = z.object({
  CLAUDE_EXECUTABLE: z.string().min(1).default('claude'),

  POSTGRES_HOST: z.string().min(1).default('localhost'),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_DB: z.string().min(1).default('growth'),
  POSTGRES_USER: z.string().min(1).default('growth'),
  POSTGRES_PASSWORD: z.string().min(1).default('growth'),
});

export type Env = z.infer<typeof envSchema>;

/** `ConfigModule`의 `validate`. 잘못된 값이 있으면 시작하지 않는다. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) throw new Error(`환경 변수 오류\n${z.prettifyError(result.error)}`);
  return result.data;
}
