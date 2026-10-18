import { homedir } from 'node:os';
import { join } from 'node:path';
import type { LlmPurpose } from './claude.client.js';

export interface PurposeSettings {
  readonly model: string;
  readonly timeoutMs: number;
  /** true면 WebSearch·WebFetch 도구를 허용한다. */
  readonly webAccess: boolean;
}

/** 용도별 설정. `Record<LlmPurpose, …>`라 용도를 추가하고 설정을 빠뜨리면 컴파일되지 않는다. */
export const DEFAULT_PURPOSES: Record<LlmPurpose, PurposeSettings> = {
  TUTOR_CHAT: { model: 'sonnet', timeoutMs: 180_000, webAccess: true },
  SESSION_SUMMARY: { model: 'sonnet', timeoutMs: 120_000, webAccess: false },
  // 문서 하나(최대 2만 자)와 개념 목록을 읽고 카드 여러 장을 쓴다.
  EXTRACTION: { model: 'sonnet', timeoutMs: 300_000, webAccess: false },
  // 판단 사례 (설계 문서 7.1). 선별은 카드 수십 장을 한 번에 읽고 고르기만 한다. 검증은 치환과 다른 모델로 따로 본다.
  CASE_SCREENING: { model: 'sonnet', timeoutMs: 300_000, webAccess: false },
  CASE_ABSTRACTION: { model: 'sonnet', timeoutMs: 180_000, webAccess: false },
  CASE_VERIFICATION: { model: 'opus', timeoutMs: 240_000, webAccess: false },
  // 경험 사례가 끝내 걸리면 만드는 가정 사례 (ADR-0026). 검증은 정답을 숨기고 Opus가 직접 푼다.
  CASE_HYPOTHETICAL: { model: 'sonnet', timeoutMs: 180_000, webAccess: false },
  CASE_HYPOTHETICAL_VERIFICATION: { model: 'opus', timeoutMs: 240_000, webAccess: false },
};

/** `claude` CLI 실행 설정. 클래스라 Nest 주입 토큰으로 바로 쓴다. */
export class ClaudeSettings {
  /** `claude` 실행 파일. OS마다 경로·이름이 다를 수 있다 (`CLAUDE_EXECUTABLE`). */
  readonly executable: string;
  /** CLI를 실행할 빈 디렉터리. 이 디렉터리와 상위 디렉터리에 CLAUDE.md가 없어야 한다. */
  readonly workDir: string;
  readonly maxConcurrency: number;
  readonly purposes: Record<LlmPurpose, PurposeSettings>;

  constructor(values: {
    executable: string;
    workDir: string;
    maxConcurrency: number;
    purposes: Record<LlmPurpose, PurposeSettings>;
  }) {
    if (!Number.isInteger(values.maxConcurrency) || values.maxConcurrency < 1) {
      throw new Error('maxConcurrency는 1 이상의 정수여야 한다');
    }
    this.executable = values.executable;
    this.workDir = values.workDir;
    this.maxConcurrency = values.maxConcurrency;
    this.purposes = values.purposes;
  }

  static defaults(executable: string): ClaudeSettings {
    return new ClaudeSettings({
      executable,
      workDir: join(homedir(), '.growth-assistant', 'claude-work'),
      maxConcurrency: 2,
      purposes: DEFAULT_PURPOSES,
    });
  }
}
