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

  // OAuth 인가 서버 (core/auth, ADR-0035). HTTP 진입점만 쓰므로 여기서는 없어도 되고, 없으면 HTTP 진입점이 시작하지 않는다.
  /** 바깥에서 이 서버에 닿는 주소 (예: `https://mcp.seok.app`). OAuth issuer이고 MCP 자원 URL은 여기에 `/mcp`를 붙인다. */
  PUBLIC_BASE_URL: z
    .url({ protocol: /^https?$/ })
    .transform((s) => s.replace(/\/+$/, ''))
    .optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  /** 로그인을 허용할 구글 이메일 (쉼표 구분, 대소문자 무시). */
  OAUTH_ALLOWED_EMAILS: commaList().transform((list) => list.map((e) => e.toLowerCase())),
  /** CIMD `client_id` URL로 받을 호스트 (쉼표 구분). 이 호스트의 https 문서만 가져온다(SSRF 방지). */
  OAUTH_CLIENT_ID_HOSTS: commaList('claude.ai'),

  // 운영 알림 (core/logging). 토픽이 없으면 로그만 남긴다.
  /** ntfy 토픽 이름. 아는 사람은 누구나 구독·발행할 수 있으니 추측하기 어렵게 짓고 비밀로 둔다. */
  NTFY_TOPIC: z.string().min(1).optional(),
  NTFY_URL: z
    .url({ protocol: /^https?$/ })
    .transform((s) => s.replace(/\/+$/, ''))
    .default('https://ntfy.sh'),

  // Notion 수집 (설계 문서 7.1). MCP 서버는 쓰지 않으므로 없어도 시작한다. 수집할 때 없으면 그때 실패한다.
  NOTION_TOKEN: z.string().min(1).optional(),
  /** 수집 루트 페이지·DB ID (쉼표 구분). 루트와 그 하위 전체를 모은다. 하이픈은 있어도 없어도 된다. */
  NOTION_ROOT_IDS: commaList().transform((ids) => ids.map((id) => id.replaceAll('-', ''))),
});

/** 쉼표로 나눈 목록. 앞뒤 공백과 빈 항목은 버린다. */
function commaList(defaultValue = '') {
  return z
    .string()
    .default(defaultValue)
    .transform((s) =>
      s
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    );
}

export type Env = z.infer<typeof envSchema>;

/** `ConfigModule`의 `validate`. 잘못된 값이 있으면 시작하지 않는다. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) throw new Error(`환경 변수 오류\n${z.prettifyError(result.error)}`);
  return result.data;
}
