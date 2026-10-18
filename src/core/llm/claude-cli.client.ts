import { mkdir } from 'node:fs/promises';
import { Injectable, Logger } from '@nestjs/common';
import pLimit, { type LimitFunction } from 'p-limit';
import { z } from 'zod';
import { Clock } from '../clock/clock.js';
import { AdminNotifier } from '../logging/admin-notifier.js';
import { ClaudeClient, ClaudeException, type ClaudeRequest } from './claude.client.js';
import { ClaudeProcessRunner } from './claude-process.runner.js';
import { type ClaudeOutput, classifyError, parseClaudeStream } from './claude-stream.parser.js';
import { ClaudeSettings, type PurposeSettings } from './claude.settings.js';
import { LlmCallLogRepository } from './llm-call-log.repository.js';

const WEB_TOOLS = 'WebSearch,WebFetch';
const MAX_ERROR_CHARS = 2000;

/** `claude -p` 서브프로세스로 호출한다 (ADR-0012, 설계 문서 7.0). */
@Injectable()
export class ClaudeCliClient extends ClaudeClient {
  private readonly logger = new Logger(ClaudeCliClient.name);
  private readonly limit: LimitFunction;
  readonly maxConcurrency: number;
  /** 인증 오류를 이미 알렸는지. 다시 로그인해 호출이 성공하면 풀린다. */
  private authAlerted = false;

  constructor(
    private readonly settings: ClaudeSettings,
    private readonly runner: ClaudeProcessRunner,
    private readonly callLogs: LlmCallLogRepository,
    private readonly clock: Clock,
    private readonly adminNotifier: AdminNotifier,
  ) {
    super();
    this.maxConcurrency = settings.maxConcurrency;
    this.limit = pLimit(settings.maxConcurrency);
  }

  complete(request: ClaudeRequest): Promise<string> {
    return this.callWithTimeoutRetry(request, undefined, (output) => output.result);
  }

  async completeStructured<T>(request: ClaudeRequest, schema: z.ZodType<T>): Promise<T> {
    const jsonSchema = toJsonSchema(schema);
    const convert = (output: ClaudeOutput): T => {
      if (output.structuredOutput === undefined) {
        throw new ClaudeException('INVALID_OUTPUT', 'structured_output이 없다');
      }
      const parsed = schema.safeParse(output.structuredOutput);
      if (!parsed.success) {
        throw new ClaudeException('INVALID_OUTPUT', `스키마와 다른 응답: ${z.prettifyError(parsed.error)}`);
      }
      return parsed.data;
    };

    try {
      return await this.callWithTimeoutRetry(request, jsonSchema, convert);
    } catch (e) {
      if (!(e instanceof ClaudeException) || e.type !== 'INVALID_OUTPUT') throw e;
      const retry = {
        ...request,
        prompt: `${request.prompt}\n\n[이전 응답 오류] ${e.message}\n스키마를 정확히 지켜 다시 답한다.`,
      };
      return this.callWithTimeoutRetry(retry, jsonSchema, convert);
    }
  }

  private async callWithTimeoutRetry<T>(
    request: ClaudeRequest,
    jsonSchema: string | undefined,
    convert: (output: ClaudeOutput) => T,
  ): Promise<T> {
    try {
      return await this.callOnce(request, jsonSchema, convert);
    } catch (e) {
      if (!(e instanceof ClaudeException) || e.type !== 'TIMEOUT') throw e;
      return this.callOnce(request, jsonSchema, convert);
    }
  }

  /** 프로세스 한 번 실행. 결과와 상관없이 `llm_call_log`에 한 줄을 남긴다. */
  private callOnce<T>(
    request: ClaudeRequest,
    jsonSchema: string | undefined,
    convert: (output: ClaudeOutput) => T,
  ): Promise<T> {
    return this.limit(async () => {
      const purpose = this.settings.purposes[request.purpose];
      const inputChars = request.prompt.length + (request.systemPrompt?.length ?? 0);
      const startedAt = performance.now();
      try {
        await mkdir(this.settings.workDir, { recursive: true });
        const process = await this.runner.run(
          this.command(request, purpose, jsonSchema),
          request.prompt,
          this.settings.workDir,
          purpose.timeoutMs,
        );
        const output = parseClaudeStream(process.stdout);
        const error = classifyError(output);
        if (error) throw error;
        const value = convert(output);
        this.authAlerted = false;
        await this.record(request, purpose, startedAt, inputChars, output.result.length, undefined);
        return value;
      } catch (e) {
        const error = e instanceof ClaudeException ? e : new ClaudeException('UNKNOWN', String(e), { cause: e });
        await this.record(request, purpose, startedAt, inputChars, 0, `${error.type}: ${error.message}`);
        if (error.type === 'AUTH') await this.alertAuthOnce(error);
        throw error;
      }
    });
  }

  private command(request: ClaudeRequest, purpose: PurposeSettings, jsonSchema: string | undefined): string[] {
    return [
      this.settings.executable,
      ...['-p', '--output-format', 'stream-json', '--verbose'],
      ...['--model', purpose.model],
      // 다른 프로젝트의 설정·CLAUDE.md·MCP 서버가 섞이지 않게 격리한다.
      ...['--setting-sources', '', '--strict-mcp-config', '--no-session-persistence'],
      ...(purpose.webAccess ? ['--tools', WEB_TOOLS, '--allowedTools', WEB_TOOLS] : ['--tools', '']),
      ...(request.systemPrompt === undefined ? [] : ['--system-prompt', request.systemPrompt]),
      ...(jsonSchema === undefined ? [] : ['--json-schema', jsonSchema]),
    ];
  }

  private async record(
    request: ClaudeRequest,
    purpose: PurposeSettings,
    startedAt: number,
    inputChars: number,
    outputChars: number,
    error: string | undefined,
  ): Promise<void> {
    // 로그 저장 실패가 호출 결과를 바꾸면 안 된다.
    try {
      await this.callLogs.insert({
        purpose: request.purpose,
        model: purpose.model,
        durationMs: Math.round(performance.now() - startedAt),
        success: error === undefined,
        inputChars,
        outputChars,
        error: error?.slice(0, MAX_ERROR_CHARS) ?? null,
        createdAt: this.clock.now(),
      });
    } catch (e) {
      this.logger.warn(`llm_call_log 저장 실패: ${String(e)}`);
    }
  }

  /** 인증 오류는 호출마다 반복되므로 `#관리`에는 한 번만 알린다 (설계 문서 9장). */
  private async alertAuthOnce(error: ClaudeException): Promise<void> {
    if (this.authAlerted) return;
    this.authAlerted = true;
    try {
      await this.adminNotifier.notify(
        `Claude CLI 인증 오류: ${error.message}\n서버를 실행하는 기기에서 \`claude\`를 실행해 다시 로그인하면 이후 호출부터 정상으로 돌아옵니다.`,
      );
    } catch (e) {
      this.logger.warn(`인증 오류 알림 실패: ${String(e)}`);
    }
  }
}

/** zod 스키마를 `--json-schema`에 넘길 JSON Schema 문자열로 바꾼다. 응답 검증도 같은 스키마로 한다. */
function toJsonSchema(schema: z.ZodType): string {
  const jsonSchema = z.toJSONSchema(schema);
  delete jsonSchema.$schema; // CLI에는 스키마 본문만 넘긴다.
  return JSON.stringify(jsonSchema);
}
