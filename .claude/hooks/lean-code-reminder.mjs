// PreToolUse(Edit|Write|MultiEdit): 세션에서 처음 src/·test/의 .ts 파일을 고치기 직전에 한 번 코드 규칙 스킬을 상기시킨다.
// 규칙 본문은 넣지 않는다. 본문은 .claude/skills/lean-code/에만 둔다.
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
const session = input.session_id;
const path = input.tool_input?.file_path;
if (!session || !path) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const rel = relative(root, path);
if (!/^(src|test)\/.*\.ts$/.test(rel)) process.exit(0);

const stateDir = join(root, '.claude/state');
const marker = join(stateDir, `lean-code-reminded-${session}`);
if (existsSync(marker)) process.exit(0);
mkdirSync(stateDir, { recursive: true });
writeFileSync(marker, '');

const additionalContext =
  '이 세션에서 처음 .ts 파일을 고친다. 아직 불러오지 않았다면 고치기 전에 lean-code 스킬과 seokit-frontend:typescript-best-practice 스킬을 Skill 도구로 불러와 그 규칙에 맞게 쓴다.';
console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext } }));
