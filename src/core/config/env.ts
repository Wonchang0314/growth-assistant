import { z } from 'zod';

/** 실행 환경 변수. 비밀값은 레포 밖 `.env`에 두고 docker compose와 함께 읽는다 (`.env.example`). */
const envSchema = z.object({
  CLAUDE_EXECUTABLE: z.string().min(1).default('claude'),

  POSTGRES_HOST: z.string().min(1).default('localhost'),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_DB: z.string().min(1).default('growth'),
  POSTGRES_USER: z.string().min(1).default('growth'),
  POSTGRES_PASSWORD: z.string().min(1).default('growth'),

  // MCP Streamable HTTP 진입점(mcp-http.ts). 기본은 이 Mac 안에서만 받는다.
  MCP_HTTP_HOST: z.string().min(1).default('127.0.0.1'),
  MCP_HTTP_PORT: z.coerce.number().int().positive().default(3100),

  // Notion 수집 (설계 문서 7.1). MCP 서버는 쓰지 않으므로 없어도 시작한다. 수집할 때 없으면 그때 실패한다.
  NOTION_TOKEN: z.string().min(1).optional(),
  /** 수집 루트 페이지·DB ID (쉼표 구분). 루트와 그 하위 전체를 모은다. 하이픈은 있어도 없어도 된다. */
  NOTION_ROOT_IDS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((id) => id.trim().replaceAll('-', ''))
        .filter((id) => id.length > 0),
    ),
});

export type Env = z.infer<typeof envSchema>;

/** `ConfigModule`의 `validate`. 잘못된 값이 있으면 시작하지 않는다. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) throw new Error(`환경 변수 오류\n${z.prettifyError(result.error)}`);
  return result.data;
}
