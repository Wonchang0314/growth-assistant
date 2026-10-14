import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** `test/fixtures/claude/`의 실제 CLI 출력 (README.md 참고). */
export function readClaudeFixture(name: string): string {
  return readFileSync(join(import.meta.dirname, 'claude', name), 'utf8');
}

/**
 * 한도 초과 출력은 재현하지 못해 실제 이벤트 형식에 값만 바꿔 만든 것이다.
 * 실제 출력을 처음 겪으면 픽스처로 교체한다.
 */
export const ASSUMED_RATE_LIMITED = [
  '{"type":"rate_limit_event","rate_limit_info":{"status":"rejected","resetsAt":1791868200,"rateLimitType":"five_hour"}}',
  '{"type":"result","subtype":"success","is_error":true,"api_error_status":429,"result":"You\'ve hit your limit · resets 3pm"}',
].join('\n');
