import type { ConsentPrompt } from './authorization.service.js';

/*
 * 인가 흐름에서 브라우저에 보여 주는 화면(동의, 오류). 템플릿 엔진 없이 문자열로 만들고,
 * 바깥에서 온 값(클라이언트 이름·URL·이메일·오류 문구)은 모두 [escapeHtml]을 거친다.
 */

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

/** 이 화면들에 붙이는 응답 헤더. 다른 사이트가 iframe으로 덮어씌워 버튼을 누르게 하는 것(클릭재킹)과 캐시를 막는다. */
export const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
} as const;

/**
 * 구글 로그인 뒤의 "연결 허용" 화면. 콜백 주소는 모든 Claude 사용자에게 같으므로, 남이 만든 로그인 링크를 눌러
 * 구글 자동 로그인으로 조용히 통과하지 않게 누가 무엇을 요청하는지 보여 주고 직접 고르게 한다(2026-10-20 결정).
 */
export function consentPage(prompt: ConsentPrompt): string {
  return page(
    '연결 허용',
    `<h1>growth-assistant에 연결할까요?</h1>
<p>아래 클라이언트가 <strong>${escapeHtml(prompt.email)}</strong> 계정으로 학습 기록에 접근하려 합니다.</p>
<dl>
  <dt>클라이언트 이름</dt><dd>${escapeHtml(prompt.clientName)}</dd>
  <dt>client_id</dt><dd>${escapeHtml(prompt.clientId)}</dd>
  <dt>돌아갈 주소</dt><dd>${escapeHtml(prompt.redirectHost)}</dd>
</dl>
<p class="warn">방금 내가 Claude에서 시작한 연결이 아니면 <strong>거절</strong>을 누르세요.</p>
<form method="post" action="/oauth/consent">
  <input type="hidden" name="consent_token" value="${escapeHtml(prompt.consentToken)}">
  <button type="submit" name="decision" value="deny" class="deny">거절</button>
  <button type="submit" name="decision" value="allow" class="allow">허용</button>
</form>`,
  );
}

export function errorPage(message: string): string {
  return page('연결할 수 없음', `<h1>연결할 수 없습니다</h1>\n<p>${escapeHtml(message)}</p>`);
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · growth-assistant</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 28rem; margin: 0 auto; padding: 1.5rem 1rem;
         line-height: 1.5; color: #1f2328; background: #fff; }
  h1 { font-size: 1.25rem; }
  dt { font-size: .85rem; color: #59636e; margin-top: .5rem; }
  dd { margin: 0; word-break: break-all; }
  .warn { background: #fff8c5; padding: .75rem; border-radius: .5rem; }
  form { display: flex; gap: .75rem; margin-top: 1.5rem; }
  button { flex: 1; font-size: 1rem; padding: .85rem; border-radius: .5rem; border: 1px solid #d1d9e0; background: #f6f8fa; }
  .allow { background: #1f883d; border-color: #1f883d; color: #fff; }
  @media (prefers-color-scheme: dark) {
    body { color: #f0f6fc; background: #0d1117; }
    dt { color: #9198a1; }
    .warn { background: #3b2e00; }
    button { background: #21262d; border-color: #3d444d; color: #f0f6fc; }
  }
</style>
</head>
<body>
${body}
</body>
</html>`;
}
