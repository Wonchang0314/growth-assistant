# ADR-0037: ChatGPT도 같은 원격 커넥터로 받고, WAF IP 제한은 끈다

- 상태: 채택
- 날짜: 2026-10-20
- ADR-0035의 "`/mcp`·`/token`은 Anthropic 외부 요청 대역에서만 받는다(WAF)"와 "CIMD 허용 호스트는 `claude.ai`"를 바꾼다. 나머지(터널, OAuth 2.1 CIMD, 구글 로그인·허용 이메일, 동의 화면)는 그대로다.

## 맥락

사용자가 같은 서버를 ChatGPT에서도 써 보려 한다. ChatGPT도 CIMD를 지원하고, 서버가 지원하면 CIMD를 먼저 쓴다([OpenAI 인증 문서](https://developers.openai.com/plugins/build/auth)). 처음 연결했을 때 막힌 곳은 셋이었다. 셋을 고친 뒤에도 ChatGPT에서 다시 연결해야 OAuth를 처음부터 다시 했다(요청 로그로 확인, ChatGPT 서버는 `/mcp`에 Origin을 싣지 않는다).

- WAF가 `/mcp`·`/token`을 Anthropic 대역(`160.79.104.0/21`) 밖에서 막는다. ChatGPT 연동이 쓰는 IP는 2026-10-06 기준 283개 대역이고([OpenAI IP 문서](https://developers.openai.com/api/docs/guides/ip-addresses)) 바뀔 수 있어 주기적으로 갱신하라고 한다. 규칙 표현식에 넣기에는 길이 제한을 넘어 Cloudflare IP 목록이 필요하다.
- CIMD 허용 호스트가 `claude.ai`뿐이다. ChatGPT의 `client_id`는 `https://chatgpt.com/oauth/client.json`이다.
- 그 문서의 기본 토큰 인증 방식이 `private_key_jwt`다. 지원 목록(`token_endpoint_auth_methods_supported`)에는 `none`도 있다. 서버는 기본 방식이 `none`인 공개 클라이언트만 받았다.

## 결정

1. **WAF IP 제한 규칙은 끈다(사용자가 대시보드에서 비활성화).** 누가 부르든 OAuth 액세스 토큰이 없으면 `/mcp`는 401이고, 토큰은 허용 이메일의 구글 로그인과 동의 화면을 거쳐야 나온다. IP 목록을 손으로 갱신하는 일을 지지 않는다. 규칙은 지우지 않고 꺼 두어 다시 켤 수 있다.
2. **CIMD 허용 호스트 기본값을 `claude.ai,chatgpt.com`으로 한다.** 허용 호스트 제한(SSRF 방지)은 그대로다.
3. **클라이언트 문서의 기본 방식이 공개 클라이언트가 아니어도 지원 목록에 `none`이 있으면 받는다.** 서버 메타데이터가 `token_endpoint_auth_methods_supported: ["none"]`만 알리므로 클라이언트는 `none`(PKCE)으로 토큰을 받는다.
4. MCP Apps 퀴즈 카드 시험(`try_quiz_card`)은 한 번 지웠다가 ChatGPT에서 시험하려고 되살렸다. ChatGPT도 MCP Apps 표준(`_meta.ui.resourceUri`)을 기본으로 쓴다([MCP Apps compatibility in ChatGPT](https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt)). 채팅만으로는 보기·확신도 버튼을 만들 수 없다.

## 결과

- 좋은 점
  - 같은 서버·같은 학습 기록을 Claude와 ChatGPT 양쪽에서 쓴다.
  - IP 대역 변경으로 연결이 갑자기 막히는 일이 없다.
- 나쁜 점·감수할 것
  - 누구나 `/mcp`·`/token`까지 요청을 보낼 수 있다. 막는 것은 OAuth뿐이고, 거절 로그가 늘 수 있다. 무차별 요청이 보이면 WAF 규칙을 다시 켜거나 속도 제한을 건다.
  - 서버 instructions(한 문제씩 내기, 학습 기록 남기기)를 ChatGPT가 Claude만큼 따르는지는 써 보며 본다.

## 검토한 대안

- **WAF에 OpenAI 대역을 Cloudflare IP 목록으로 더하기:** 바깥 요청을 줄이지만 목록이 자주 바뀌어 손으로 갱신해야 하고, 늦으면 ChatGPT 연결이 끊긴다.
- **ChatGPT용으로 미리 등록한 OAuth 클라이언트나 DCR:** ChatGPT가 CIMD를 지원하므로 필요 없다.
