import { inspect } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../clock/clock.js';
import { AuthorizationRepository } from './authorization.repository.js';
import { AuthorizeError } from './authorize-error.js';
import { AuthSettings } from './auth-settings.js';
import { ClientMetadataSource } from './client-metadata.source.js';
import { parseClientIdUrl, verifyClientMetadata, type VerifiedClient } from './client-metadata.js';
import { GoogleLogin, type GoogleIdentity } from './google-login.js';
import type { AuthorizationRequest } from './oauth.schema.js';
import { hashSecret, isPkceValue, newSecret, s256 } from './secret.js';
import { expiresAfter, LIFETIME } from './token-lifetime.js';

/** `/authorize`의 쿼리 파라미터 (RFC 6749 4.1.1, PKCE, RFC 8707 resource). */
export interface AuthorizeQuery {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  state?: string;
  resource?: string;
}

/** 동의 화면에 보여 줄 것. [consentToken]은 폼에 숨겨 넣고 동의 처리에서 돌려받는다. */
export interface ConsentPrompt {
  readonly consentToken: string;
  readonly clientName: string;
  readonly clientId: string;
  readonly redirectHost: string;
  readonly email: string;
}

/**
 * 흐름 ②~④: 인가 요청 → 구글 로그인 → 동의 → 인가 코드.
 * 클라이언트와 redirect_uri를 확인하기 전의 실패는 오류 화면([AuthorizeError])으로, 확인한 뒤의 실패는
 * 클라이언트의 redirect_uri로 `error`를 붙여 돌려보낸다(RFC 6749 4.1.2.1).
 */
@Injectable()
export class AuthorizationService {
  private readonly logger = new Logger(AuthorizationService.name);
  /** 이 프로세스에서 이미 로그에 남긴 client_id. 처음 연결할 때 실제 값을 확인하려고 남긴다(ADR-0035). */
  private readonly seenClientIds = new Set<string>();

  constructor(
    private readonly repository: AuthorizationRepository,
    private readonly clientMetadata: ClientMetadataSource,
    private readonly google: GoogleLogin,
    private readonly clock: Clock,
    private readonly settings: AuthSettings,
  ) {}

  /** ② `GET /authorize`: 클라이언트를 확인하고 요청을 저장한 뒤 구글 로그인 주소를 돌려준다. */
  async start(query: AuthorizeQuery): Promise<URL> {
    const { client_id: clientId, redirect_uri: redirectUri } = query;
    if (!clientId || !redirectUri) throw new AuthorizeError(400, 'client_id와 redirect_uri가 필요하다');
    const client = await this.verifyClient(clientId, redirectUri);

    const fail = (error: string, description: string) =>
      this.clientRedirect(redirectUri, query.state, { error, error_description: description });
    if (query.response_type !== 'code') return fail('unsupported_response_type', 'response_type=code만 받는다');
    if (query.code_challenge_method !== 'S256' || !query.code_challenge || !isPkceValue(query.code_challenge))
      return fail('invalid_request', 'PKCE(code_challenge_method=S256)가 필요하다');
    if (query.resource !== undefined && query.resource !== this.settings.mcpUrl)
      return fail('invalid_target', `resource는 ${this.settings.mcpUrl}이어야 한다`);

    const now = this.clock.now();
    await this.repository.deleteExpired(now);
    const google = { state: newSecret(), nonce: newSecret(), codeVerifier: newSecret() };
    await this.repository.createRequest({
      clientId: client.clientId,
      clientName: client.name,
      redirectUri,
      codeChallenge: query.code_challenge,
      clientState: query.state ?? null,
      resource: this.settings.mcpUrl,
      googleStateHash: hashSecret(google.state),
      googleNonce: google.nonce,
      googleCodeVerifier: google.codeVerifier,
      expiresAt: expiresAfter(now, LIFETIME.authorizationRequest),
    });
    return this.google.authorizationUrl({
      state: google.state,
      nonce: google.nonce,
      codeChallenge: s256(google.codeVerifier),
    });
  }

  /**
   * ③ `GET /oauth/google/callback`: 구글이 돌려준 코드로 본인인지 확인한다. 허용 목록의 확인된 이메일이면
   * 동의 화면에 보여 줄 것을, 사용자가 구글 로그인을 취소했으면 클라이언트로 돌려보낼 주소를 돌려준다.
   */
  async completeGoogleLogin(query: { state?: string; code?: string; error?: string }): Promise<ConsentPrompt | URL> {
    const request = query.state && (await this.repository.takeRequestByGoogleState(hashSecret(query.state)));
    if (!request || request.expiresAt <= this.clock.now()) throw expiredRequest();
    if (query.error || !query.code) {
      await this.repository.deleteRequest(request.id);
      return this.clientRedirect(request.redirectUri, request.clientState, { error: 'access_denied' });
    }

    const email = await this.verifiedEmail(request, query.code);
    const consentToken = newSecret();
    await this.repository.markLoggedIn(request.id, email, hashSecret(consentToken));
    return {
      consentToken,
      clientName: request.clientName,
      clientId: request.clientId,
      redirectHost: new URL(request.redirectUri).host,
      email,
    };
  }

  /** ④ `POST /oauth/consent`: 허용이면 1회용 인가 코드를, 거절이면 `access_denied`를 클라이언트로 보낸다. */
  async decide(consentToken: string, allow: boolean): Promise<URL> {
    const request = await this.repository.takeRequestByConsentToken(hashSecret(consentToken));
    if (!request?.email || request.expiresAt <= this.clock.now()) throw expiredRequest();
    if (!allow) {
      this.logger.log(`연결 거절: client_id ${request.clientId}`);
      return this.clientRedirect(request.redirectUri, request.clientState, { error: 'access_denied' });
    }

    const code = newSecret();
    await this.repository.createCode({
      codeHash: hashSecret(code),
      clientId: request.clientId,
      redirectUri: request.redirectUri,
      codeChallenge: request.codeChallenge,
      resource: request.resource,
      email: request.email,
      expiresAt: expiresAfter(this.clock.now(), LIFETIME.authorizationCode),
    });
    this.logger.log(`연결 허용: ${request.email}, client_id ${request.clientId}`);
    return this.clientRedirect(request.redirectUri, request.clientState, { code });
  }

  /** client_id가 허용 호스트의 CIMD 문서이고 redirect_uri가 그 문서에 있는지. */
  private async verifyClient(clientId: string, redirectUri: string): Promise<VerifiedClient> {
    let url: URL;
    try {
      url = parseClientIdUrl(clientId, this.settings.clientIdHosts);
    } catch (e) {
      this.logger.warn(`허용하지 않는 client_id: ${clientId}`);
      throw e;
    }
    let document: unknown;
    try {
      document = await this.clientMetadata.fetch(url);
    } catch (e) {
      this.logger.warn(`client_id 문서를 가져오지 못했다: ${clientId}`, inspect(e));
      throw new AuthorizeError(400, 'client_id 문서를 가져오지 못했다');
    }
    const client = verifyClientMetadata(document, clientId, redirectUri);
    if (!this.seenClientIds.has(clientId)) {
      this.seenClientIds.add(clientId);
      this.logger.log(`처음 보는 client_id: ${clientId} (${client.name}), redirect_uri ${redirectUri}`);
    }
    return client;
  }

  /** 구글 코드를 바꿔 id_token의 nonce, 이메일 확인 여부, 허용 목록을 본다. 떨어지면 요청을 지운다. */
  private async verifiedEmail(request: AuthorizationRequest, code: string): Promise<string> {
    const reject = async (status: 400 | 403, message: string, log: string) => {
      await this.repository.deleteRequest(request.id);
      this.logger.warn(`구글 로그인 거절: ${log}`);
      return new AuthorizeError(status, message);
    };
    let identity: GoogleIdentity;
    try {
      identity = await this.google.exchange(code, request.googleCodeVerifier);
    } catch (e) {
      throw await reject(400, '구글 로그인을 확인하지 못했다', inspect(e));
    }
    if (identity.nonce !== request.googleNonce)
      throw await reject(400, '구글 로그인을 확인하지 못했다', 'nonce 불일치');
    const email = identity.email.toLowerCase();
    if (!identity.emailVerified) throw await reject(403, '구글에서 확인되지 않은 이메일이다', `미확인 이메일 ${email}`);
    if (!this.settings.allowedEmails.includes(email))
      throw await reject(403, `${email}은 이 서버에 연결할 수 없는 계정이다`, `허용 목록에 없는 이메일 ${email}`);
    return email;
  }

  /** 클라이언트 redirect_uri에 인가 응답을 붙인다. `iss`는 다른 인가 서버의 응답과 섞이지 않게 한다(RFC 9207). */
  private clientRedirect(redirectUri: string, state: string | null | undefined, params: Record<string, string>): URL {
    const url = new URL(redirectUri);
    for (const [key, value] of Object.entries({ ...params, ...(state ? { state } : {}), iss: this.settings.issuer }))
      url.searchParams.set(key, value);
    return url;
  }
}

const expiredRequest = () =>
  new AuthorizeError(400, '로그인 요청을 찾지 못했다. 만료되었거나 이미 처리했다. Claude에서 연결을 다시 시작한다');
