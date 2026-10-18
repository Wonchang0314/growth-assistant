/**
 * 판단 사례의 패턴 게이트 (ADR-0024). 회사 용어 목록 없이 모양만 보고 남으면 안 되는 문자열을 찾는다.
 * 통과·거부만 하고 고쳐 쓰지 않는다. 도메인은 URL을 지운 뒤에 찾아 URL 안의 호스트를 두 번 잡지 않는다.
 * 문제로 낼 때 정답이 보기 모양으로 드러나는지(정답만 긺)도 여기서 본다.
 */
const URL = /https?:\/\/[^\s)>"']+/g;
const IP = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
// 끝이 흔한 최상위 도메인인 것만 잡는다. Node.js·package.json 같은 기술 표기를 걸지 않기 위해서다.
const DOMAIN = /\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|kr|jp|dev|app|cloud|internal|local|corp)\b/gi;
// 밑줄이 하나 이상 있는 대문자 식별자(테이블·컬럼·코드값). COUNT·ROLLBACK 같은 SQL 키워드는 밑줄이 없어 걸리지 않는다.
const UPPER_SNAKE = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;

/**
 * 정답 보기가 가장 긴 오답보다 이 배수를 넘게 길면 내용을 몰라도 모양으로 고를 수 있다고 본다.
 * 2026-10-18 시험 7장은 모두 정답이 가장 길었다(1.2~3.6배). 처음 둔 1.3배는 실제로 검토한 선택지(고른 쪽이 더 자세하기 쉽다)를
 * 자주 걸어 경험 사례가 가정 사례로 밀려나서 1.5배로 늦췄다(사용자 결정 2026-10-18).
 */
const MAX_CHOSEN_LENGTH_RATIO = 1.5;

/** 정답 보기만 눈에 띄게 길면 그 길이와 가장 긴 오답의 길이. 아니면 undefined. */
export function findLengthCue(
  options: readonly { readonly text: string; readonly chosen: boolean }[],
): { chosen: number; longestOther: number } | undefined {
  const chosen = Math.max(0, ...options.filter((o) => o.chosen).map((o) => o.text.length));
  const longestOther = Math.max(0, ...options.filter((o) => !o.chosen).map((o) => o.text.length));
  return chosen > longestOther * MAX_CHOSEN_LENGTH_RATIO ? { chosen, longestOther } : undefined;
}

/** [text]에서 걸린 문자열. 없으면 빈 배열. */
export function findLeaks(text: string): string[] {
  const urls = text.match(URL) ?? [];
  const rest = text.replace(URL, ' ');
  return [
    ...new Set([...urls, ...(rest.match(IP) ?? []), ...(rest.match(DOMAIN) ?? []), ...(rest.match(UPPER_SNAKE) ?? [])]),
  ];
}
