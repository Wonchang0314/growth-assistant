import { z } from 'zod';
import { ClaudeException } from './claude.client.js';

/** `claude -p --output-format stream-json --verbose`의 출력. 응답 샘플은 `test/fixtures/claude/`. */
export interface ClaudeOutput {
  readonly isError: boolean;
  readonly result: string;
  readonly structuredOutput: unknown;
  readonly apiErrorStatus: number | undefined;
  readonly rateLimit: RateLimitInfo | undefined;
}

export interface RateLimitInfo {
  readonly status: string;
  readonly resetsAt: Date | undefined;
}

// 출력은 외부 데이터라 필요한 필드만 경계에서 한 번 검증한다. 나머지 필드는 무시한다.
const resultEvent = z.object({
  is_error: z.boolean(),
  result: z.string().catch(''),
  structured_output: z.unknown().optional(),
  api_error_status: z.number().nullish(),
});

const rateLimitEvent = z.object({
  rate_limit_info: z.object({ status: z.string(), resetsAt: z.number().optional() }),
});

const RATE_LIMIT_REJECTED = 'rejected';
// 한도 초과 출력은 아직 재현하지 못했다. rate_limit_event가 없을 때를 대비한 문자열 판별이다.
const RATE_LIMIT_TEXT = /(usage|rate) limit|hit your limit/i;
const AUTH_TEXT = /not logged in|\/login|invalid api key|oauth token/i;

/** 끝까지 읽은 출력에서 `result` 이벤트와 마지막 `rate_limit_event`만 해석한다 (ADR-0012). */
export function parseClaudeStream(stdout: string): ClaudeOutput {
  let result: z.infer<typeof resultEvent> | undefined;
  let rateLimit: RateLimitInfo | undefined;

  for (const raw of stdout.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('{')) continue;
    const event = parseLine(line);
    switch (event.type) {
      case 'result': {
        const parsed = resultEvent.safeParse(event);
        if (!parsed.success) {
          throw new ClaudeException('INVALID_OUTPUT', `result 이벤트 형식 오류: ${z.prettifyError(parsed.error)}`);
        }
        result = parsed.data;
        break;
      }
      case 'rate_limit_event': {
        const parsed = rateLimitEvent.safeParse(event);
        if (parsed.success) {
          const { status, resetsAt } = parsed.data.rate_limit_info;
          rateLimit = { status, resetsAt: resetsAt === undefined ? undefined : new Date(resetsAt * 1000) };
        }
        break;
      }
    }
  }

  if (!result) throw new ClaudeException('INVALID_OUTPUT', `result 이벤트가 없다: ${stdout.slice(0, 500)}`);
  return {
    isError: result.is_error,
    result: result.result,
    structuredOutput: result.structured_output ?? undefined,
    apiErrorStatus: result.api_error_status ?? undefined,
    rateLimit,
  };
}

/** 실패한 호출이면 분류한 예외, 성공이면 undefined. */
export function classifyError(output: ClaudeOutput): ClaudeException | undefined {
  // 응답을 받았으면 한도 상태가 rejected여도 성공으로 본다 (초과 사용으로 처리됐을 수 있다).
  if (!output.isError) return undefined;
  const rateLimited = output.rateLimit?.status === RATE_LIMIT_REJECTED || output.apiErrorStatus === 429;
  if (rateLimited || RATE_LIMIT_TEXT.test(output.result)) {
    return new ClaudeException('RATE_LIMIT', output.result, { resetsAt: output.rateLimit?.resetsAt });
  }
  if (output.apiErrorStatus === 401 || AUTH_TEXT.test(output.result)) {
    return new ClaudeException('AUTH', output.result);
  }
  return new ClaudeException('UNKNOWN', `api_error_status=${String(output.apiErrorStatus)}: ${output.result}`);
}

function parseLine(line: string): { type?: unknown } {
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === 'object' && value !== null ? value : {};
  } catch (e) {
    throw new ClaudeException('INVALID_OUTPUT', `JSON이 아닌 출력 줄: ${line.slice(0, 200)}`, { cause: e });
  }
}
