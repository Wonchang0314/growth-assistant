import { Inject, Injectable } from '@nestjs/common';
import { eq, lte } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import {
  type AuthorizationCode,
  type AuthorizationRequest,
  type NewAuthorizationRequest,
  oauthAuthorizationCode,
  oauthAuthorizationRequest,
} from './oauth.schema.js';

/** 인가 요청과 인가 코드. "꺼내기(take)"는 행을 지우거나 비우면서 읽어 같은 값을 두 번 쓰지 못하게 한다. */
@Injectable()
export class AuthorizationRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async createRequest(values: NewAuthorizationRequest): Promise<void> {
    await this.db.insert(oauthAuthorizationRequest).values(values);
  }

  /** 구글 콜백의 state로 요청을 찾고 state를 비운다(한 번만 쓴다). */
  async takeRequestByGoogleState(googleStateHash: string): Promise<AuthorizationRequest | undefined> {
    const [row] = await this.db
      .update(oauthAuthorizationRequest)
      .set({ googleStateHash: null })
      .where(eq(oauthAuthorizationRequest.googleStateHash, googleStateHash))
      .returning();
    return row;
  }

  async markLoggedIn(id: number, email: string, consentTokenHash: string): Promise<void> {
    await this.db
      .update(oauthAuthorizationRequest)
      .set({ email, consentTokenHash })
      .where(eq(oauthAuthorizationRequest.id, id));
  }

  /** 동의 화면 폼의 값으로 요청을 찾아 지운다. */
  async takeRequestByConsentToken(consentTokenHash: string): Promise<AuthorizationRequest | undefined> {
    const [row] = await this.db
      .delete(oauthAuthorizationRequest)
      .where(eq(oauthAuthorizationRequest.consentTokenHash, consentTokenHash))
      .returning();
    return row;
  }

  async deleteRequest(id: number): Promise<void> {
    await this.db.delete(oauthAuthorizationRequest).where(eq(oauthAuthorizationRequest.id, id));
  }

  async createCode(values: AuthorizationCode): Promise<void> {
    await this.db.insert(oauthAuthorizationCode).values(values);
  }

  async takeCode(codeHash: string): Promise<AuthorizationCode | undefined> {
    const [row] = await this.db
      .delete(oauthAuthorizationCode)
      .where(eq(oauthAuthorizationCode.codeHash, codeHash))
      .returning();
    return row;
  }

  /** 끝내지 않고 버려진 요청과 쓰지 않은 코드를 지운다. */
  async deleteExpired(now: Date): Promise<void> {
    await this.db.delete(oauthAuthorizationRequest).where(lte(oauthAuthorizationRequest.expiresAt, now));
    await this.db.delete(oauthAuthorizationCode).where(lte(oauthAuthorizationCode.expiresAt, now));
  }
}
