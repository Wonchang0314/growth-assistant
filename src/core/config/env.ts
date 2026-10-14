import { z } from 'zod';

/** Discord snowflake ID. JS number(2^53)를 넘을 수 있어 문자열로 둔다. */
const snowflake = z.string().regex(/^\d{17,20}$/, '숫자로 된 Discord ID여야 한다');

/**
 * 실행 환경 변수. 비밀값은 레포 밖 `.env`에 두고 docker compose와 함께 읽는다 (`.env.example`).
 * Discord가 켜져 있을 때만 토큰·ID를 요구한다. 테스트는 `DISCORD_ENABLED=false`로 실행한다.
 */
const envSchema = z
  .object({
    DISCORD_ENABLED: z.stringbool().default(true),
    DISCORD_BOT_TOKEN: z.string().optional(),
    DISCORD_GUILD_ID: snowflake.optional(),
    DISCORD_OWNER_USER_ID: snowflake.optional(),

    CLAUDE_EXECUTABLE: z.string().min(1).default('claude'),

    POSTGRES_HOST: z.string().min(1).default('localhost'),
    POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
    POSTGRES_DB: z.string().min(1).default('growth'),
    POSTGRES_USER: z.string().min(1).default('growth'),
    POSTGRES_PASSWORD: z.string().min(1).default('growth'),
  })
  .superRefine((env, ctx) => {
    if (!env.DISCORD_ENABLED) return;
    for (const key of ['DISCORD_BOT_TOKEN', 'DISCORD_GUILD_ID', 'DISCORD_OWNER_USER_ID'] as const) {
      if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'Discord가 켜져 있으면 필요하다' });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** `ConfigModule`의 `validate`. 잘못된 값이 있으면 시작하지 않는다. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) throw new Error(`환경 변수 오류\n${z.prettifyError(result.error)}`);
  return result.data;
}
