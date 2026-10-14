// PostToolUse(Edit|Write|MultiEdit): 이번 작업에서 고친 코드 파일을 기록한다.
// 문서(.md), docs/, .claude/ 아래 파일은 기록하지 않는다. 짝은 docs-review-gate.mjs(Stop).
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
const session = input.session_id;
const path = input.tool_input?.file_path;
if (!session || !path) {
  console.error('track-code-edit: session_id 또는 tool_input.file_path가 없어 기록하지 않음');
  process.exit(0);
}

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const rel = relative(root, path);
if (rel.startsWith('..') || isAbsolute(rel)) process.exit(0); // 프로젝트 밖 파일
if (rel.endsWith('.md') || rel.startsWith('docs/') || rel.startsWith('.claude/')) process.exit(0);

const stateDir = join(root, '.claude/state');
mkdirSync(stateDir, { recursive: true });
const state = join(stateDir, `pending-docs-${session}.txt`);
let recorded = [];
try {
  recorded = readFileSync(state, 'utf8').split('\n');
} catch {
  // 아직 기록 없음
}
if (!recorded.includes(rel)) appendFileSync(state, `${rel}\n`);
