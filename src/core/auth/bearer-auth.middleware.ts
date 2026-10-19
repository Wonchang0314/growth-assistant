import { Injectable, type NestMiddleware } from '@nestjs/common';
import { bearerAuthChallengeResponse, OAuthError, OAuthErrorCode } from '@modelcontextprotocol/server';
import type { NextFunction, Request, Response } from 'express';
import { AuthSettings } from './auth-settings.js';
import { TokenService } from './token.service.js';

/**
 * 흐름 ⑥: `/mcp` 앞에서 `Authorization: Bearer <액세스 토큰>`을 검사한다(만료·폐기·audience는 [TokenService]).
 * 없거나 무효면 `401` + `WWW-Authenticate: Bearer ... resource_metadata="..."`로 답한다. Claude는 이 응답을 받아야
 * 로그인을 시작하고, `401`을 받으면 리프레시 토큰으로 갱신한다.
 * SDK의 `requireBearerAuth`는 만료를 실제 시계(`Date.now()`)로 보므로 쓰지 않고, 응답 모양만 SDK로 만든다.
 */
@Injectable()
export class BearerAuthMiddleware implements NestMiddleware<Request, Response> {
  constructor(
    private readonly tokens: TokenService,
    private readonly settings: AuthSettings,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const token = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? '')?.[1];
    if (token && (await this.tokens.verifyAccessToken(token))) {
      next();
      return;
    }
    // 헤더 값은 Latin-1만 되므로 설명은 영어로 둔다.
    const error = new OAuthError(
      OAuthErrorCode.InvalidToken,
      token ? 'Invalid or expired token' : 'Missing bearer token',
    );
    const challenge = bearerAuthChallengeResponse(error, { resourceMetadataUrl: this.settings.resourceMetadataUrl });
    res
      .status(challenge.status)
      .set('WWW-Authenticate', challenge.headers.get('WWW-Authenticate') ?? 'Bearer')
      .json(await challenge.json());
  }
}
