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
  /** 회사 용어 후보 수백 개를 한 번에 분류한다 (`npm run terms -- candidates`). */
  TERM_SUGGESTION: { model: 'sonnet', timeoutMs: 600_000, webAccess: false },
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
