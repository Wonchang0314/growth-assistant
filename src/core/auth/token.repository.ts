import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { DB, type Db, type Tx } from '../db/db.module.js';
import { type Grant, oauthAccessToken, oauthGrant, oauthRefreshToken } from './oauth.schema.js';
import { hashSecret } from './secret.js';
import type { TokenPair } from './token-lifetime.js';

/** 토큰 계열(grant)과 액세스·리프레시 토큰. 토큰은 해시로만 저장하고 해시로 찾는다. */
@Injectable()
export class TokenRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 인가 코드를 바꿀 때: 새 계열과 첫 토큰 쌍. */
  async createGrant(grant: Pick<Grant, 'clientId' | 'email' | 'resource' | 'createdAt'>, pair: TokenPair) {
    await this.db.transaction(async (tx) => {
      const [created] = await tx.insert(oauthGrant).values(grant).returning({ id: oauthGrant.id });
      if (!created) throw new Error('oauth_grant를 만들지 못했다');
      await insertPair(tx, created.id, pair);
    });
  }

  async addPair(grantId: number, pair: TokenPair): Promise<void> {
    await insertPair(this.db, grantId, pair);
  }

  async findAccessToken(token: string) {
    const [row] = await this.db
      .select({ expiresAt: oauthAccessToken.expiresAt, grant: oauthGrant })
      .from(oauthAccessToken)
      .innerJoin(oauthGrant, eq(oauthGrant.id, oauthAccessToken.grantId))
      .where(eq(oauthAccessToken.tokenHash, hashSecret(token)));
    return row;
  }

  /**
   * 아직 회전하지 않은 리프레시 토큰이면 회전 표시를 하고 돌려준다. 이미 회전했거나 없으면 undefined.
   * 조건부 UPDATE 한 번이라 같은 토큰으로 동시에 와도 하나만 통과한다.
   */
  async claimRefreshToken(token: string, now: Date) {
    const [row] = await this.db
      .update(oauthRefreshToken)
      .set({ rotatedAt: now })
      .where(and(eq(oauthRefreshToken.tokenHash, hashSecret(token)), isNull(oauthRefreshToken.rotatedAt)))
      .returning({ grantId: oauthRefreshToken.grantId, expiresAt: oauthRefreshToken.expiresAt });
    return row && { expiresAt: row.expiresAt, grant: await this.grant(row.grantId) };
  }

  /** 회전 여부와 상관없이 리프레시 토큰의 계열. 재사용을 알아챌 때 쓴다. */
  async findRefreshTokenGrant(token: string): Promise<Grant | undefined> {
    const [row] = await this.db
      .select({ grant: oauthGrant })
      .from(oauthRefreshToken)
      .innerJoin(oauthGrant, eq(oauthGrant.id, oauthRefreshToken.grantId))
      .where(eq(oauthRefreshToken.tokenHash, hashSecret(token)));
    return row?.grant;
  }

  /** 계열을 폐기한다. 그 계열의 액세스·리프레시 토큰은 모두 더 통과하지 못한다. */
  async revokeGrant(grantId: number, now: Date): Promise<void> {
    await this.db.update(oauthGrant).set({ revokedAt: now }).where(eq(oauthGrant.id, grantId));
  }

  private async grant(id: number): Promise<Grant> {
    const [row] = await this.db.select().from(oauthGrant).where(eq(oauthGrant.id, id));
    if (!row) throw new Error(`oauth_grant ${id}가 없다`);
    return row;
  }
}

async function insertPair(db: Db | Tx, grantId: number, pair: TokenPair): Promise<void> {
  await db
    .insert(oauthAccessToken)
    .values({ tokenHash: hashSecret(pair.accessToken), grantId, expiresAt: pair.accessExpiresAt });
  await db
    .insert(oauthRefreshToken)
    .values({ tokenHash: hashSecret(pair.refreshToken), grantId, expiresAt: pair.refreshExpiresAt });
}
