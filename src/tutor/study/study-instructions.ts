import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * MCP 서버가 연결할 때 Claude에 전달하는 사용 지침 (설계 문서 7.5).
 * 학습과 상관없는 대화에도 전달되므로 도구를 부르는 때와 교수 규칙만 두고,
 * 말투·형식은 튜터용 Claude 프로젝트 지침(`docs/claude-project-instructions.md`)에 둔다.
 */
export const STUDY_INSTRUCTIONS = readFileSync(
  join(import.meta.dirname, 'prompts', 'mcp-instructions.md'),
  'utf8',
).trim();
