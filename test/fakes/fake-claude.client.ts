import type { z } from 'zod';
import {
  ClaudeClient,
  type ClaudeErrorType,
  ClaudeException,
  type ClaudeRequest,
  type LlmPurpose,
} from '../../src/core/llm/claude.client.js';

/**
 * 유스케이스 테스트용. 준비한 응답을 차례로 돌려주고 받은 요청을 기록한다.
 * 구조화된 응답은 JSON 문자열로 준비하고, 실제 클라이언트처럼 스키마로 검증한다.
 */
export class FakeClaudeClient extends ClaudeClient {
  readonly requests: ClaudeRequest[] = [];
  private readonly responses: (() => string)[] = [];

  reply(text: string): this {
    this.responses.push(() => text);
    return this;
  }

  fail(error: ClaudeException | ClaudeErrorType, message?: string): this {
    const exception = error instanceof ClaudeException ? error : new ClaudeException(error, message ?? error);
    this.responses.push(() => {
      throw exception;
    });
    return this;
  }

  requestsFor(purpose: LlmPurpose): ClaudeRequest[] {
    return this.requests.filter((r) => r.purpose === purpose);
  }

  complete(request: ClaudeRequest): Promise<string> {
    this.requests.push(request);
    const next = this.responses.shift();
    if (!next) return Promise.reject(new Error(`준비한 응답이 없다: ${JSON.stringify(request)}`));
    return Promise.resolve().then(next);
  }

  async completeStructured<T>(request: ClaudeRequest, schema: z.ZodType<T>): Promise<T> {
    return schema.parse(JSON.parse(await this.complete(request)));
  }
}
