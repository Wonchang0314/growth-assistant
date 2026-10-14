import type { z } from 'zod';

/** 용도마다 모델·타임아웃·웹 허용 여부를 따로 정한다 (`claude.settings.ts`). */
export const LLM_PURPOSES = ['TUTOR_CHAT', 'SESSION_SUMMARY'] as const;
export type LlmPurpose = (typeof LLM_PURPOSES)[number];

export interface ClaudeRequest {
  readonly purpose: LlmPurpose;
  readonly prompt: string;
  readonly systemPrompt?: string | undefined;
}

export type ClaudeErrorType = 'AUTH' | 'RATE_LIMIT' | 'TIMEOUT' | 'INVALID_OUTPUT' | 'UNKNOWN';

export class ClaudeException extends Error {
  /** 사용량 한도에 걸렸을 때 다시 쓸 수 있는 시각. 알 수 없으면 undefined. */
  readonly resetsAt: Date | undefined;

  constructor(
    readonly type: ClaudeErrorType,
    message: string,
    options: { resetsAt?: Date | undefined; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ClaudeException';
    this.resetsAt = options.resetsAt;
  }
}

/** 모든 LLM 호출이 지나가는 유일한 경로 (ADR-0012). 추상 클래스라 Nest 주입 토큰으로도 쓴다. */
export abstract class ClaudeClient {
  /** 자유 텍스트 응답. */
  abstract complete(request: ClaudeRequest): Promise<string>;

  /** [schema]를 만족하는 응답. 스키마와 다르면 오류 내용을 붙여 한 번 다시 요청한다. */
  abstract completeStructured<T>(request: ClaudeRequest, schema: z.ZodType<T>): Promise<T>;
}
