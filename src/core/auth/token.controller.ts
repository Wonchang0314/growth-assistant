import {
  type ArgumentsHost,
  Body,
  Catch,
  Controller,
  type ExceptionFilter,
  Header,
  HttpCode,
  Post,
  UseFilters,
} from '@nestjs/common';
import { OAuthError, OAuthErrorCode } from '@modelcontextprotocol/server';
import type { Response } from 'express';
import { z } from 'zod';
import { type TokenResponse, TokenService } from './token.service.js';

/** RFC 6749 5.2 오류 응답: `400` + `{ error, error_description }`, 캐시 금지. */
@Catch(OAuthError)
class OAuthErrorFilter implements ExceptionFilter {
  catch(error: OAuthError, host: ArgumentsHost): void {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(400)
      .set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' })
      .json(error.toResponseObject());
  }
}

const grantType = z.object({ grant_type: z.enum(['authorization_code', 'refresh_token']) });
const tokenRequest = z.discriminatedUnion('grant_type', [
  z.object({
    grant_type: z.literal('authorization_code'),
    code: z.string(),
    redirect_uri: z.string(),
    client_id: z.string(),
    code_verifier: z.string(),
    resource: z.string().optional(),
  }),
  z.object({
    grant_type: z.literal('refresh_token'),
    refresh_token: z.string(),
    client_id: z.string().optional(),
    resource: z.string().optional(),
  }),
]);

/**
 * 흐름 ⑤ `POST /token`. 브라우저가 아니라 클라이언트 서버가 부른다. 본문은 `application/x-www-form-urlencoded`이고
 * Nest(Express)가 이미 읽어 객체로 넘긴다. 공개 클라이언트라 클라이언트 인증은 없고 PKCE가 그 자리를 대신한다.
 */
@Controller('token')
@UseFilters(OAuthErrorFilter)
export class TokenController {
  constructor(private readonly tokens: TokenService) {}

  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  async token(@Body() body: unknown): Promise<TokenResponse> {
    if (!grantType.safeParse(body).success)
      throw new OAuthError(OAuthErrorCode.UnsupportedGrantType, 'authorization_code와 refresh_token만 받는다');
    const parsed = tokenRequest.safeParse(body);
    if (!parsed.success) throw new OAuthError(OAuthErrorCode.InvalidRequest, '필요한 파라미터가 없다');

    const request = parsed.data;
    return request.grant_type === 'authorization_code'
      ? this.tokens.exchangeCode({
          code: request.code,
          redirectUri: request.redirect_uri,
          clientId: request.client_id,
          codeVerifier: request.code_verifier,
          resource: request.resource,
        })
      : this.tokens.refresh({
          refreshToken: request.refresh_token,
          clientId: request.client_id,
          resource: request.resource,
        });
  }
}
