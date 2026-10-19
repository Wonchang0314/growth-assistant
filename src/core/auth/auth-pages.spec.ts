import { expect, it } from 'vitest';
import { consentPage, errorPage } from './auth-pages.js';

it('동의 화면은 바깥에서 온 값을 이스케이프한다', () => {
  const html = consentPage({
    consentToken: 'token',
    clientName: '<script>alert(1)</script>',
    clientId: 'https://claude.ai/x?a="b"',
    redirectHost: 'claude.ai',
    email: "o'neil@example.com",
  });

  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  expect(html).toContain('a=&quot;b&quot;');
  expect(html).toContain('o&#39;neil@example.com');
});

it('오류 화면도 메시지를 이스케이프한다', () => {
  expect(errorPage('<b>x</b>')).toContain('&lt;b&gt;x&lt;/b&gt;');
});
