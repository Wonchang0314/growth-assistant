/** Discord 메시지 길이 제한. */
export const DISCORD_MESSAGE_LIMIT = 2000;

const FENCE = '```';
const CLOSE_FENCE = `\n${FENCE}`;

/** 길이 제한에 맞춰 나눈다. 코드 블록 중간에서 나뉘면 닫고 다음 조각에서 같은 언어로 다시 연다. */
export function splitMessage(text: string, limit = DISCORD_MESSAGE_LIMIT): string[] {
  if (limit <= 50) throw new Error(`limit이 너무 작다: ${limit}`);
  const chunks: string[] = [];
  let reopen = '';
  let rest = text;
  for (;;) {
    const body = reopen + rest;
    if (body.length <= limit) {
      chunks.push(body);
      break;
    }
    // 코드 블록을 닫을 자리를 남겨 둔다.
    const [headEnd, restStart] = cutPoint(body, limit - CLOSE_FENCE.length, reopen.length + 1);
    const head = body.slice(0, headEnd).trimEnd();
    const openFence = openFenceAtEnd(head);
    chunks.push(openFence === undefined ? head : head + CLOSE_FENCE);
    reopen = openFence === undefined ? '' : `${openFence}\n`;
    rest = body.slice(restStart);
  }
  return chunks.filter((chunk) => chunk.trim() !== '');
}

/** 줄바꿈 → 공백 → 글자 경계 순으로 자를 곳을 찾는다. 구분 문자는 다음 조각에 넘기지 않는다. */
function cutPoint(body: string, budget: number, minIndex: number): [headEnd: number, restStart: number] {
  const window = body.slice(0, budget);
  const floor = Math.max(minIndex, Math.floor(budget / 2));
  for (const separator of ['\n', ' ']) {
    const index = window.lastIndexOf(separator);
    if (index >= floor) return [index, index + 1];
  }
  // 서로게이트 쌍(이모지 등)을 가르지 않는다.
  const hard = isHighSurrogate(body.charCodeAt(budget - 1)) ? budget - 1 : budget;
  return [hard, hard];
}

/** [chunk] 끝에서 코드 블록이 열려 있으면 그 블록의 여는 줄(언어 표기 포함), 아니면 undefined. */
function openFenceAtEnd(chunk: string): string | undefined {
  let open: string | undefined;
  for (const line of chunk.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith(FENCE)) open = open === undefined ? trimmed : undefined;
  }
  return open;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}
