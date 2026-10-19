import { Injectable, Logger } from '@nestjs/common';
import { OAuthError, OAuthErrorCode } from '@modelcontextprotocol/server';
import { Clock } from '../clock/clock.js';
import { AdminNotifier } from '../logging/admin-notifier.js';
import { AuthorizationRepository } from './authorization.repository.js';
import { AuthSettings } from './auth-settings.js';
import type { Grant } from './oauth.schema.js';
import { hashSecret, verifyPkce } from './secret.js';
import { LIFETIME, newTokenPair, type TokenPair } from './token-lifetime.js';
import { TokenRepository } from './token.repository.js';

/** `/token` 응답 본문 (RFC 6749 5.1). */
export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
}

export interface CodeGrantRequest {
  code: string;
  redirectUri: string;
  clientId: string;
  codeVerifier: string;
  resource: string | undefined;
}

export interface RefreshGrantRequest {
  refreshToken: string;
  clientId: string | undefined;
  resource: string | undefined;
}

/**
 * 흐름 ⑤ `/token`과 ⑥ `/mcp` Bearer 검사. 실패는 RFC 6749 5.2 오류 코드를 담은 [OAuthError]로 던진다.
 * 어떤 검사에서 떨어졌는지는 로그에만 남기고, 클라이언트에는 `invalid_grant` 하나로 답한다.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly tokens: TokenRepository,
    private readonly authorizations: AuthorizationRepository,
    private readonly clock: Clock,
    private readonly settings: AuthSettings,
    private readonly adminNotifier: AdminNotifier,
  ) {}

  /** `grant_type=authorization_code`: 1회용 코드를 PKCE로 확인하고 새 토큰 계열을 연다. */
  async exchangeCode(request: CodeGrantRequest): Promise<TokenResponse> {
    const now = this.clock.now();
    // 코드는 꺼내면서 지운다. 아래 검사에서 떨어져도 다시 쓸 수 없다.
    const code = await this.authorizations.takeCode(hashSecret(request.code));
    if (!code) throw this.invalidGrant('없거나 이미 쓴 인가 코드');
    if (code.expiresAt <= now) throw this.invalidGrant('만료된 인가 코드');
    if (code.clientId !== request.clientId) throw this.invalidGrant('인가 코드의 client_id와 다름');
    if (code.redirectUri !== request.redirectUri) throw this.invalidGrant('인가 코드의 redirect_uri와 다름');
    if (!verifyPkce(request.codeVerifier, code.codeChallenge)) throw this.invalidGrant('PKCE code_verifier 불일치');
    if (request.resource !== undefined && request.resource !== code.resource) throw invalidTarget();

    const pair = newTokenPair(now);
    await this.tokens.createGrant(
      { clientId: code.clientId, email: code.email, resource: code.resource, createdAt: now },
      pair,
    );
    this.logger.log(`토큰 발급: ${code.email}, client_id ${code.clientId}`);
    return tokenResponse(pair);
  }

  /**
   * `grant_type=refresh_token`: 리프레시 토큰을 회전한다(새 액세스·리프레시 토큰, 옛 리프레시 토큰은 더 못 씀).
   * 이미 회전한 토큰이 다시 오면 누군가 옛 토큰을 훔쳐 쓴 것으로 보고 그 계열 전체를 폐기한다.
   */
  async refresh(request: RefreshGrantRequest): Promise<TokenResponse> {
    const now = this.clock.now();
    const claimed = await this.tokens.claimRefreshToken(request.refreshToken, now);
    if (!claimed) {
      await this.revokeIfReused(request.refreshToken, now);
      throw this.invalidGrant('없거나 이미 회전한 리프레시 토큰');
    }
    const { grant } = claimed;
    if (grant.revokedAt) throw this.invalidGrant('폐기된 계열의 리프레시 토큰');
    if (claimed.expiresAt <= now) throw this.invalidGrant('만료된 리프레시 토큰');
    if (request.clientId !== undefined && request.clientId !== grant.clientId)
      throw this.invalidGrant('리프레시 토큰의 client_id와 다름');
    if (request.resource !== undefined && request.resource !== grant.resource) throw invalidTarget();

    const pair = newTokenPair(now);
    await this.tokens.addPair(grant.id, pair);
    return tokenResponse(pair);
  }

  /** `/mcp`의 Bearer 토큰이 살아 있고 이 MCP 자원을 위한 것이면 그 계열, 아니면 undefined. */
  async verifyAccessToken(token: string): Promise<Grant | undefined> {
    const found = await this.tokens.findAccessToken(token);
    if (!found || found.expiresAt <= this.clock.now() || found.grant.revokedAt) return undefined;
    return found.grant.resource === this.settings.mcpUrl ? found.grant : undefined;
  }

  private async revokeIfReused(refreshToken: string, now: Date): Promise<void> {
    const grant = await this.tokens.findRefreshTokenGrant(refreshToken);
    if (!grant || grant.revokedAt) return;
    await this.tokens.revokeGrant(grant.id, now);
    const message = `회전한 리프레시 토큰이 다시 와서 토큰 계열 ${grant.id}(${grant.email})을 폐기했다. 다시 로그인해야 한다`;
    this.logger.warn(message);
    await this.adminNotifier.notify(message);
  }

  private invalidGrant(reason: string): OAuthError {
    this.logger.warn(`토큰 요청 거절: ${reason}`);
    return new OAuthError(OAuthErrorCode.InvalidGrant, '인가 코드나 리프레시 토큰이 유효하지 않다');
  }
}

const invalidTarget = () => new OAuthError(OAuthErrorCode.InvalidTarget, 'resource가 이 MCP 서버가 아니다');

const tokenResponse = (pair: TokenPair): TokenResponse => ({
  access_token: pair.accessToken,
  token_type: 'Bearer',
  expires_in: LIFETIME.accessToken / 1000,
  refresh_token: pair.refreshToken,
});
