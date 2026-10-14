// Stop: 이번 작업에서 코드 파일을 고쳤으면 종료를 한 번 막고 문서 검토를 요구한다.
// 막는 즉시 기록을 지워 같은 수정으로 두 번 막지 않는다. 검토 라운드(stop_hook_active) 중에는 막지 않는다.
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
const session = input.session_id;
if (!session) {
  console.error('docs-review-gate: session_id가 없어 검사하지 않음');
  process.exit(0);
}

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const state = join(root, '.claude/state', `pending-docs-${session}.txt`);
let files;
try {
  files = readFileSync(state, 'utf8').trim();
} catch {
  process.exit(0); // 기록 없음
}
rmSync(state, { force: true });
if (!files || input.stop_hook_active === true) process.exit(0);

const reason = `이번 작업에서 아래 코드 파일이 수정됐다. 끝내기 전에 CLAUDE.md의 '문서 갱신 규칙'에 따라 관련 문서가 구현과 맞는지 검토하고, 필요한 문서를 고친 뒤 마지막에 '문서 점검: 갱신 <파일들> / 불필요 <이유>' 한 줄로 보고하라.
${files.split('\n').slice(0, 30).join('\n')}`;
console.log(JSON.stringify({ decision: 'block', reason }));
