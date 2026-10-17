/**
 * 판단 사례의 패턴 게이트 (ADR-0024). 회사 용어 목록 없이 모양만 보고 남으면 안 되는 문자열을 찾는다.
 * 통과·거부만 하고 고쳐 쓰지 않는다. 도메인은 URL을 지운 뒤에 찾아 URL 안의 호스트를 두 번 잡지 않는다.
 */
const URL = /https?:\/\/[^\s)>"']+/g;
const IP = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
// 끝이 흔한 최상위 도메인인 것만 잡는다. Node.js·package.json 같은 기술 표기를 걸지 않기 위해서다.
const DOMAIN = /\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|kr|jp|dev|app|cloud|internal|local|corp)\b/gi;
// 밑줄이 하나 이상 있는 대문자 식별자(테이블·컬럼·코드값). COUNT·ROLLBACK 같은 SQL 키워드는 밑줄이 없어 걸리지 않는다.
const UPPER_SNAKE = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;

/** [text]에서 걸린 문자열. 없으면 빈 배열. */
export function findLeaks(text: string): string[] {
  const urls = text.match(URL) ?? [];
  const rest = text.replace(URL, ' ');
  return [
    ...new Set([...urls, ...(rest.match(IP) ?? []), ...(rest.match(DOMAIN) ?? []), ...(rest.match(UPPER_SNAKE) ?? [])]),
  ];
}
