import type { z } from 'zod';

/** 용도마다 모델·타임아웃·웹 허용 여부를 따로 정한다 (`claude.settings.ts`). */
export const LLM_PURPOSES = [
  'TUTOR_CHAT',
  'SESSION_SUMMARY',
  'EXTRACTION',
  'CASE_SCREENING',
  'CASE_ABSTRACTION',
  'CASE_VERIFICATION',
  'CASE_HYPOTHETICAL',
  'CASE_HYPOTHETICAL_VERIFICATION',
  'QUIZ_GENERATION',
  'QUIZ_VERIFICATION',
] as const;
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

/** 입력 탓이 아니라 다음 호출도 똑같이 실패하는 오류(사용량 한도, 로그인). 여러 건을 차례로 처리하다 만나면 멈춘다. */
export const isStopError = (e: unknown): e is ClaudeException =>
  e instanceof ClaudeException && (e.type === 'RATE_LIMIT' || e.type === 'AUTH');

/** 모든 LLM 호출이 지나가는 유일한 경로 (ADR-0012). 추상 클래스라 Nest 주입 토큰으로도 쓴다. */
export abstract class ClaudeClient {
  /** 동시에 실행하는 호출 수의 상한. 넘는 호출은 기다린다. 여러 건을 나눠 돌리는 쪽이 동시 처리 수로 쓴다. */
  abstract readonly maxConcurrency: number;

  /** 자유 텍스트 응답. */
  abstract complete(request: ClaudeRequest): Promise<string>;

  /** [schema]를 만족하는 응답. 스키마와 다르면 오류 내용을 붙여 한 번 다시 요청한다. */
  abstract completeStructured<T>(request: ClaudeRequest, schema: z.ZodType<T>): Promise<T>;
}
