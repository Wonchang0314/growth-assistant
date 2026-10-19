import {
  type ArgumentsHost,
  Body,
  Catch,
  Controller,
  type ExceptionFilter,
  Get,
  Post,
  Query,
  Res,
  UseFilters,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { consentPage, errorPage, PAGE_HEADERS } from './auth-pages.js';
import { AuthorizationService, type AuthorizeQuery } from './authorization.service.js';
import { AuthorizeError } from './authorize-error.js';

/** 실패를 사용자에게 오류 화면으로 보여 준다. */
@Catch(AuthorizeError)
class AuthorizeErrorFilter implements ExceptionFilter {
  catch(error: AuthorizeError, host: ArgumentsHost): void {
    host.switchToHttp().getResponse<Response>().status(error.status).set(PAGE_HEADERS).send(errorPage(error.message));
  }
}

const param = z.string().optional();
const authorizeQuery = z.object({
  response_type: param,
  client_id: param,
  redirect_uri: param,
  code_challenge: param,
  code_challenge_method: param,
  state: param,
  resource: param,
}) satisfies z.ZodType<AuthorizeQuery>;
const callbackQuery = z.object({ state: param, code: param, error: param });
const consentForm = z.object({ consent_token: z.string(), decision: z.enum(['allow', 'deny']) });

/**
 * 흐름 ②~④, 사용자 브라우저가 지나가는 경로. `/authorize` → 구글 로그인 → `/oauth/google/callback`(동의 화면)
 * → `POST /oauth/consent` → 클라이언트 redirect_uri. 같은 이름의 파라미터가 여러 번 오면 거절한다.
 */
@Controller()
@UseFilters(AuthorizeErrorFilter)
export class AuthorizeController {
  constructor(private readonly authorization: AuthorizationService) {}

  @Get('authorize')
  async authorize(@Query() query: unknown, @Res() res: Response): Promise<void> {
    res.redirect(302, (await this.authorization.start(parse(authorizeQuery, query))).href);
  }

  @Get('oauth/google/callback')
  async googleCallback(@Query() query: unknown, @Res() res: Response): Promise<void> {
    const result = await this.authorization.completeGoogleLogin(parse(callbackQuery, query));
    if (result instanceof URL) res.redirect(302, result.href);
    else res.status(200).set(PAGE_HEADERS).send(consentPage(result));
  }

  /** POST 뒤 GET으로 옮겨 가도록 303으로 보낸다. */
  @Post('oauth/consent')
  async consent(@Body() body: unknown, @Res() res: Response): Promise<void> {
    const form = parse(consentForm, body);
    res.redirect(303, (await this.authorization.decide(form.consent_token, form.decision === 'allow')).href);
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AuthorizeError(400, '요청 파라미터가 올바르지 않다');
  return parsed.data;
}
