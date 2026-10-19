import { bigint, index, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/*
 * OAuth 인가 서버의 저장 (설계 문서 5.7). 토큰·코드·state는 원문을 저장하지 않고 SHA-256 해시(hex 64자)만 둔다.
 * 시각은 모두 Clock 포트로 넣고 만료는 코드에서 비교한다.
 */

const hash = (name: string) => varchar(name, { length: 64 });
const at = (name: string) => timestamp(name, { withTimezone: true });

/**
 * `/authorize`로 시작해 구글 로그인과 동의 화면을 거치는 동안 붙들고 있는 인가 요청. 동의하거나 거절하면 지운다.
 * 구글 콜백에서 [googleStateHash]로 찾고, 로그인이 끝나면 [email]과 동의 화면의 [consentTokenHash]를 채운다.
 */
export const oauthAuthorizationRequest = pgTable('oauth_authorization_request', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  clientId: text('client_id').notNull(),
  /** CIMD 문서의 `client_name` (동의 화면에 보여 준다). */
  clientName: text('client_name').notNull(),
  redirectUri: text('redirect_uri').notNull(),
  codeChallenge: varchar('code_challenge', { length: 128 }).notNull(),
  /** 클라이언트가 보낸 `state`. 인가 응답에 그대로 돌려준다. */
  clientState: text('client_state'),
  resource: text('resource').notNull(),
  /** 구글로 보낸 `state`의 해시. 콜백에서 한 번 쓰고 비운다. */
  googleStateHash: hash('google_state_hash').unique(),
  /** 구글 id_token의 nonce와 구글 PKCE code_verifier. 구글에 다시 보내야 해서 원문으로 두고, 요청과 함께 지운다. */
  googleNonce: varchar('google_nonce', { length: 64 }).notNull(),
  googleCodeVerifier: varchar('google_code_verifier', { length: 128 }).notNull(),
  /** 구글 로그인으로 확인한 이메일. 로그인 전에는 없다. */
  email: text('email'),
  /** 동의 화면 폼에 넣은 값의 해시(CSRF 방지). 로그인 뒤에 생긴다. */
  consentTokenHash: hash('consent_token_hash').unique(),
  expiresAt: at('expires_at').notNull(),
});

/** 동의 뒤 클라이언트에 준 1회용 인가 코드. 토큰으로 바꾸면 지운다. */
export const oauthAuthorizationCode = pgTable('oauth_authorization_code', {
  codeHash: hash('code_hash').primaryKey(),
  clientId: text('client_id').notNull(),
  redirectUri: text('redirect_uri').notNull(),
  codeChallenge: varchar('code_challenge', { length: 128 }).notNull(),
  resource: text('resource').notNull(),
  email: text('email').notNull(),
  expiresAt: at('expires_at').notNull(),
});

/**
 * 인가 한 번(로그인·동의 한 번)에서 이어지는 토큰 계열. 리프레시 토큰을 회전해도 계열은 같다.
 * 회전된 리프레시 토큰이 다시 오면 계열을 폐기([revokedAt])해 그 계열의 모든 토큰을 막는다.
 */
export const oauthGrant = pgTable('oauth_grant', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  clientId: text('client_id').notNull(),
  email: text('email').notNull(),
  resource: text('resource').notNull(),
  createdAt: at('created_at').notNull(),
  revokedAt: at('revoked_at'),
});

const grantId = () =>
  bigint('grant_id', { mode: 'number' })
    .notNull()
    .references(() => oauthGrant.id, { onDelete: 'cascade' });

export const oauthAccessToken = pgTable(
  'oauth_access_token',
  {
    tokenHash: hash('token_hash').primaryKey(),
    grantId: grantId(),
    expiresAt: at('expires_at').notNull(),
  },
  (t) => [index('idx_oauth_access_token_grant').on(t.grantId)],
);

export const oauthRefreshToken = pgTable(
  'oauth_refresh_token',
  {
    tokenHash: hash('token_hash').primaryKey(),
    grantId: grantId(),
    expiresAt: at('expires_at').notNull(),
    /** 회전해 새 토큰으로 바꾼 시각. 값이 있는 토큰이 다시 오면 재사용(탈취)이다. */
    rotatedAt: at('rotated_at'),
  },
  (t) => [index('idx_oauth_refresh_token_grant').on(t.grantId)],
);

export type AuthorizationRequest = typeof oauthAuthorizationRequest.$inferSelect;
export type NewAuthorizationRequest = typeof oauthAuthorizationRequest.$inferInsert;
export type AuthorizationCode = typeof oauthAuthorizationCode.$inferSelect;
export type Grant = typeof oauthGrant.$inferSelect;
