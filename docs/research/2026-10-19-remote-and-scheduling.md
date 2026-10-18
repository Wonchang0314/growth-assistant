# 원격 전환·예약 작업 사실 확인 (2026-10-19)

4단계(원격 전환)와 5단계(예약 작업) 결정 인터뷰의 입력이다([ADR-0034](../adr/0034-prototype-before-quality.md)). 2026-10-14 조사([ADR-0018](../adr/0018-claude-mcp-server.md) 맥락, 설계 문서 "원격 전환 (4단계, 새 ADR로 결정)")에서 바뀌었을 수 있는 사실을 웹 검색과 설치된 SDK로 다시 확인했다. 결정은 하지 않는다. 선택지, 장단점, 추천 후보만 적고 사용자 인터뷰로 정한다. ADR을 쓰고 나면 이 파일은 지운다.

- **표기:** "확인"은 공식 문서나 설치된 코드로 확인한 것, "미확인"은 문서에 없거나 출처끼리 다른 것이다. 미확인 항목은 [실험으로 확인할 것](#실험으로-확인할-것)에 모았다.
- **출처:** 절마다 링크를 달았다. 블로그·제3자 글은 공식 문서와 다를 때 공식 문서를 따랐다.

## 2026-10-14 조사에서 바뀐 것

| 항목 | 10-14 조사 | 지금 (10-19) |
|---|---|---|
| Cowork 예약 작업 실행 위치 | 이 Mac에서 실행, Mac이 깨어 있고 Desktop이 켜져 있어야 함 | **2026-10-06부터 Pro·Max의 새 예약 작업은 클라우드에서 돈다.** "내 컴퓨터에서만" 선택지는 없어졌다. 로컬 MCP(데스크톱 확장)는 Desktop에서만 동작한다 |
| 휴대폰 알림 | 예약 작업 완료 푸시는 문서로 확인되지 않음 | Cowork 문서에 "작업이 끝나거나 입력이 필요하면 휴대폰 알림"이 있다. 예약 작업에도 오는지는 미확인 |
| OAuth 클라이언트 등록 | 고정 `client_id`로 최소 구현 | **CIMD(Client ID Metadata Document)를 기본 지원한다.** 등록 엔드포인트(`/register`)와 클라이언트 저장 없이 Claude의 메타데이터 URL을 `client_id`로 받는다 |
| MCP 명세 | 2025-11-25 | **2026-07-28 개정**이 나왔다. 프로토콜 세션·`initialize`·GET 스트림이 없어진 무상태 방식이다. 설치된 SDK 2.3.1이 두 시대를 함께 처리한다 |
| 고정 헤더 인증 | 베타, 이 계정은 못 씀 | 그대로 베타, "일부 조직"만. 조직 Owner가 넣는다 |
| IP 대역 | `160.79.104.0/21` | 그대로. IPv4만 쓴다 |

## 1. 커스텀 커넥터 인증

**확인한 것** ([인증 문서](https://claude.com/docs/connectors/building/authentication), [커스텀 커넥터 시작하기](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)):

- 지원하는 방식: `oauth_dcr`(동적 등록), `oauth_cimd`(CIMD), `none`(인증 없음)은 기본 지원. `static_headers`(고정 헤더)는 베타로 일부 조직만. 나머지 둘(`oauth_anthropic_creds`, `custom_connection`)은 디렉터리 등록용이라 메일로 요청해야 한다.
- 같은 인증 기반을 claude.ai, Desktop, 모바일, Claude Code, Cowork가 함께 쓴다. 웹에서 한 번 붙이면 모바일에서도 쓴다.
- 고정 헤더: Owner가 `authorization`·`x-api-key`·`x-auth-token` 같은 헤더에 키를 한 번 넣는다. 다이얼로그에 **Request headers** 절이 안 보이면 그 조직은 아직 못 쓴다. 키를 URL 쿼리에 넣지 말라고 한다.
- CIMD: 인가 서버 메타데이터에 `client_id_metadata_document_supported: true`와 `token_endpoint_auth_methods_supported`에 `"none"`이 둘 다 있으면 CIMD를 쓰고, 아니면 DCR로 넘어간다. `/authorize`는 `client_id` URL을 받아 문서를 읽고, 문서의 `client_id`가 그 URL과 같은지, `redirect_uri`가 문서 목록에 정확히 있는지 본다([lazy authentication 문서](https://claude.com/docs/connectors/building/lazy-authentication)).
- 리디렉트 URI: 호스팅 앱(웹·Desktop·모바일·Cowork)은 `https://claude.ai/api/mcp/auth_callback` 하나. Claude Code는 포트가 바뀌는 루프백(`http://localhost:<포트>/callback`, `127.0.0.1`)이다.
- PKCE S256 필수, 메타데이터에 `code_challenge_methods_supported: ["S256"]`.
- 인증 시작은 `401` + `WWW-Authenticate: Bearer resource_metadata="…"`일 때만이다. `200`에 실은 오류는 로그인을 띄우지 않는다. 보호 리소스 메타데이터(RFC 9728)의 `resource`는 사용자가 넣은 MCP URL과 정확히 같아야 한다.
- 토큰: 만료 5분 전부터 미리 갱신하고 `401`이 오면 갱신한다. 공개 클라이언트(DCR·CIMD)는 리프레시 토큰을 회전하라고 한다. 무효한 리프레시 토큰은 `invalid_grant`. `/token`은 `application/x-www-form-urlencoded`를 받아야 한다. 탐색·등록·토큰 응답은 10초, 갱신은 30초 안에 와야 한다.
- 인가 서버의 탐색 요청도 Anthropic 외부 요청 대역에서 온다. 인가 서버 앞에 IP 제한을 걸면 그 대역은 열어야 한다.
- 무료 플랜은 커스텀 커넥터 1개. Pro·Max는 사용자가 직접 Customize > Connectors에서 붙인다.

**미확인:** 호스팅 앱(claude.ai)이 CIMD로 보내는 `client_id` URL 값은 문서에 없다(Claude Code 것은 `https://claude.ai/oauth/claude-code-client-metadata`). 첫 연결 때 로그로 보고 허용 목록에 고정할 수 있다. 이 계정(개인 Pro·Max)에 Request headers 절이 열렸는지는 다이얼로그를 직접 열어 봐야 한다.

**선택지 (인증):**

| 선택지 | 좋은 점 | 나쁜 점 |
|---|---|---|
| A. OAuth 최소 구현 + CIMD | 등록 엔드포인트·클라이언트 테이블이 없다. `client_id`를 Claude 메타데이터 URL 하나로 묶을 수 있다. 모든 플랜·모든 앱에서 된다 | `/authorize`(비밀번호 로그인 화면), `/token`, 메타데이터 2개, 토큰 저장·회전을 직접 만든다. CIMD 문서를 가져올 때 SSRF를 막아야 한다(허용 URL만) |
| B. OAuth 최소 구현 + DCR | 명세가 오래돼 예제가 많다 | 새 연결마다 클라이언트가 등록되어 쌓인다. A보다 엔드포인트가 하나 많다 |
| C. 고정 헤더 | 서버 코드가 가장 적다(헤더 비교 한 번) | 이 계정에서 쓸 수 있는지 불확실하다. 베타라 바뀔 수 있다 |
| D. 인증 없음 + IP 제한 + 추측 어려운 경로 | 가장 빠르다 | IP 대역은 모든 Claude 사용자가 공유한다. 경로 비밀은 로그·기록에 남는다. 문서도 URL에 비밀을 넣지 말라고 한다 |

**추천 후보:** A. 다이얼로그에 Request headers가 보이면 C를 먼저 써서 프로토타입을 빨리 띄우고 A로 옮기는 것도 후보다. D는 학습 기록이 개인 데이터라 권하지 않는다.

## 2. Anthropic 외부 요청 IP 대역

**확인** ([IP 주소 문서](https://platform.claude.com/docs/en/api/ip-addresses)): 외부 요청(MCP 도구 호출 등)은 IPv4 `160.79.104.0/21`에서 나간다. 들어오는 쪽은 `160.79.104.0/23`, `2607:6bc0::/48`이다. 예전 `34.162.x.x/32` 다섯 개는 더 쓰지 않는다. 바꿀 때는 미리 알린다고 한다.

- 외부 요청 대역에 IPv6는 없다. 공개 주소에 A 레코드가 있어야 한다(Funnel·Cloudflare 모두 해당).
- 여전히 모든 Claude 사용자가 공유하는 대역이라 인증을 대신하지 못한다. `/authorize`는 사용자 브라우저가 열므로 제외한다는 10-14 설계는 그대로 맞다.

## 3. 공개 경로

### Tailscale Funnel

**확인** ([Funnel 문서](https://tailscale.com/kb/1223/funnel), [CLI 문서](https://tailscale.com/kb/1311/tailscale-funnel)):

- 모든 플랜에서 쓴다(무료 Personal 포함).
- 주소는 `<기기>.<tailnet>.ts.net`만. 자기 도메인은 문서에 없다(제3자 글은 안 된다고 한다). 주소는 바뀌지 않는다.
- 포트는 443, 8443, 10000만. 대역폭 한도는 있지만 수치를 공개하지 않는다.
- TLS는 이 Mac의 Tailscale이 끝내고 로컬 서비스로 넘긴다.
- `--bg`로 켜면 재부팅·`tailscale up` 뒤에도 다시 켜진다.
- macOS 변형: CLI 문서는 App Store·Standalone 변형도 포트 공유가 되고 파일·폴더 공유만 오픈소스 변형이 필요하다고 한다. Funnel 문서 요약에는 macOS에서 오픈소스 변형이 필요하다는 문장도 있어 엇갈린다. 설치할 때 확인한다.
- `--proxy-protocol`(v1·v2)은 TCP 전달에서 원래 접속 IP를 넘긴다.

**미확인:** HTTPS 모드에서 원래 접속 IP를 `X-Forwarded-For` 같은 헤더로 넘기는지 공식 문서에 없다. 10-14 조사에서도 못 찾았다. 헤더를 찍는 작은 서버를 Funnel 뒤에 두고 확인해야 한다. IP를 못 받으면 앱에서 IP 제한을 할 수 없다.

### Cloudflare Tunnel

**확인** ([Quick Tunnel 문서](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/), [macOS 서비스 문서](https://developers.cloudflare.com/tunnel/advanced/local-management/as-a-service/macos/), [IP Access rules](https://developers.cloudflare.com/waf/tools/ip-access-rules/)):

- Quick Tunnel(`trycloudflare.com`)은 계정·도메인이 필요 없지만 **SSE를 지원하지 않고**, 동시 요청 200개, 가동 보장 없음, 재시작하면 주소가 바뀐다. 커넥터 주소로는 맞지 않는다.
- 이름 있는 터널은 무료 계정과 Cloudflare DNS에 올린 도메인이 필요하다(도메인 구입 비용은 따로).
- `cloudflared service install`은 로그인 시 실행(LaunchAgent, `~/.cloudflared`), `sudo`면 부팅 시 실행(LaunchDaemon, `/etc/cloudflared`)으로 등록한다.
- IP Access rules로 IP·ASN·국가 단위 허용·차단을 할 수 있다. 무료 플랜의 WAF 사용자 정의 규칙 수는 출처끼리 다르다(5개라는 글과 없다는 글).
- `CF-Connecting-IP`로 원래 IP를 받는 것은 10-14에 확인한 내용이고 이번에 다시 보지 않았다.

### 선택지 (공개 경로)

| 선택지 | 좋은 점 | 나쁜 점 |
|---|---|---|
| A. Tailscale Funnel | 도메인이 필요 없다. 설정이 짧다. 무료 | 원래 IP 전달이 미확인이라 IP 제한을 앱에서 못 할 수 있다. 주소가 인증서 기록에 남는다. 대역폭 한도 비공개 |
| B. Cloudflare Tunnel(이름 있는 터널) | 원래 IP를 받고, 경계(Cloudflare)에서 IP 제한을 건다. 자기 도메인 주소 | 도메인이 필요하다(연 비용). Cloudflare 계정·DNS 설정이 하나 더 생긴다 |
| C. Funnel로 시작, IP 확인 실패하면 B | 오늘 바로 띄운다 | 주소가 바뀌면 커넥터를 다시 붙이고 OAuth를 다시 한다 |

**추천 후보:** 인증을 OAuth(1절 A)로 하면 IP 제한은 보조라서 A도 충분하다. IP 제한을 반드시 두려면 B. 먼저 Funnel 헤더 실험(30분 이내)을 해 보고 정하는 것을 권한다. 도메인이 이미 있으면 B가 더 낫다.

## 4. MCP Streamable HTTP와 SDK

**확인 (명세):** 최신 개정은 **2026-07-28**이다. 프로토콜 수준 세션, `initialize` 핸드셰이크, 독립 GET 스트림, `Last-Event-ID` 재개가 없어졌고 요청마다 완결된 무상태 방식이 됐다. `Mcp-Method`·`Mcp-Name` 헤더가 생겼다. 2024-11-05의 HTTP+SSE 전송은 계속 폐기 예정 상태다([Cloudflare 블로그](https://blog.cloudflare.com/mcp-v2/), [C# SDK v2 발표](https://devblogs.microsoft.com/dotnet/announcing-v20-of-the-official-mcp-csharp-sdk/), [명세 미러](https://modelcontextprotocol.net/specification/draft/basic/transports/streamable-http)). 공식 명세 페이지(modelcontextprotocol.io)는 직접 열어 보지 못했다.

**확인 (설치된 SDK, `@modelcontextprotocol/server` 2.3.1 = npm 최신, 2026-10-05):**

- HTTP 진입은 `createMcpHandler(factory, options)`다. 요청마다 `factory`로 `McpServer`를 새로 만든다. 2026-07-28 요청은 새 방식으로, 2025 시대 요청은 기본값 `legacy: 'stateless'`로 무상태 처리한다(GET·DELETE는 `405`). `legacy: 'reject'`면 새 방식만 받는다.
- 반환값은 웹 표준 `{ fetch, close, notify, bus }`다. Node에서는 `@modelcontextprotocol/node`(2.1.1, Hono 기반)의 `toNodeHandler(handler)`나 `@modelcontextprotocol/express`(2.0.2)로 붙인다.
- `responseMode`: `auto`(기본, 필요할 때만 SSE), `sse`, `json`(중간 알림 버림). 요청 본문 한도 기본 4 MiB.
- 핸들러 자체는 Origin·Host 검증을 하지 않는다. `hostHeaderValidationResponse` 같은 도우미를 앞에 둔다.
- 리소스 서버 쪽 인증 도우미가 있다: `requireBearerAuth`, `verifyBearerToken`, `buildOAuthProtectedResourceMetadata`, `oauthMetadataResponse`, `bearerAuthChallengeResponse`. 인가 서버(`/authorize`·`/token`) 구현은 서버 패키지에 없다.
- `factory`에는 `authInfo`와 원래 `Request`가 넘어온다.

**우리 코드에 주는 영향:** 지금 `McpServerHost`(`src/core/mcp/mcp-server.host.ts`)는 `McpServer` 하나를 만들어 stdio 전송에 `connect`한다. HTTP에서는 요청마다 서버를 만드는 `factory`가 필요하므로, 도구 등록을 함수로 빼 stdio와 HTTP가 함께 쓰게 바꿔야 한다. 도구 처리기와 유스케이스는 바뀌지 않는다(ADR-0018의 전송 분리).

**미확인:** Claude 커넥터 클라이언트가 지금 2026-07-28로 말하는지 2025-11-25로 말하는지 문서에 없다. 기본값(`legacy: 'stateless'`)이면 둘 다 받으므로 첫 연결 로그로 확인하면 된다. Cloudflare Quick Tunnel이 SSE를 막으므로, 만약 Quick Tunnel로 시험한다면 `responseMode: 'json'`이 필요하다.

**선택지 (HTTP 서버):**

| 선택지 | 좋은 점 | 나쁜 점 |
|---|---|---|
| A. `node:http` + `toNodeHandler` + OAuth 라우트 직접 | 의존성이 가장 적다(`@modelcontextprotocol/node`가 Hono를 끌고 옴) | 본문 파싱(form-urlencoded)·라우팅을 직접 쓴다 |
| B. Nest HTTP 어댑터(Express) + `@modelcontextprotocol/express` | Nest 컨트롤러로 `/authorize`·`/token`을 쓰고 기존 모듈 구조에 맞는다 | Nest가 HTTP 없이 애플리케이션 컨텍스트로만 도는 지금 구조(CLAUDE.md)를 바꾼다. 의존성이 늘어난다 |

**추천 후보:** 엔드포인트가 다섯 개 안팎(`/mcp`, 메타데이터 2개, `/authorize`, `/token`, `/healthz`)이라 A가 적은 코드다. 로그인 화면·폼 처리가 늘어날 것 같으면 B.

## 5. 예약 작업과 알림

**확인** ([Cowork 웹·데스크톱·모바일](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile), [Cowork 예약 작업](https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork), [Dispatch](https://support.claude.com/en/articles/13947068-assign-tasks-from-anywhere-in-claude-cowork), [커넥터 개요](https://claude.com/docs/connectors/overview)):

- **Cowork 예약 작업:** 모든 유료 플랜. 매시간·매일·매주·평일·수동. 2026-10-06부터 Pro·Max의 새 작업은 클라우드에서 돌아 컴퓨터가 잠들어도 된다. 이미 로컬에서 돌던 작업은 그대로 로컬이다. "내 컴퓨터에서만" 선택지는 없어졌고, 그 설정이던 작업은 다음에 Desktop을 열 때 클라우드로 옮겨지며 되돌릴 수 없다. 로컬 파일·앱이 필요한 작업은 로컬에서만 돈다.
- **예약 작업이 쓰는 커넥터:** "커넥터와 Claude 계정에 저장한 파일"을 쓴다. 로컬 커넥터(데스크톱 확장)와 로컬 MCP를 쓰는 플러그인은 Desktop에서만 동작한다. **그래서 지금 stdio 서버는 클라우드 예약 작업에서 닿지 않는다.** 원격 커스텀 커넥터를 클라우드 예약 작업에서 쓰는지는 문서에 따로 적혀 있지 않다(같은 커넥터 기반이라 될 것으로 보이지만 미확인).
- **휴대폰 알림:** Cowork 문서는 "작업이 끝나거나 입력이 필요하면 휴대폰 알림"이라고 한다. 예약 작업 문서는 알림을 말하지 않고 "Scheduled"에서 결과를 본다고만 한다. Dispatch는 일부 Pro·Max의 제한 베타이고 컴퓨터가 깨어 있어야 한다.
- **Claude Code 클라우드 루틴:** 최소 1시간 간격, claude.ai에서 붙인 커넥터를 쓴다. 결과는 claude.ai/code 세션 목록에서 본다. 모바일 푸시는 확인하지 못했다([제3자 정리](https://agentsroom.dev/blog/claude-code-routines-cloud-vs-local-scheduled-tasks)).
- **Claude Code Desktop 예약 작업:** 이 Mac에서 돈다. 로컬 stdio MCP에 닿지만 Desktop이 켜져 있어야 한다.
- **서버가 Claude 앱에 먼저 말을 거는 방법:** 여전히 찾지 못했다. 서버 쪽 시작 경로는 외부 알림(ntfy 등)뿐이다.

**ntfy** ([게시 문서](https://docs.ntfy.sh/publish/), [요금](https://ntfy.sh/#pricing)):

- 가입 없이 ntfy.sh에 게시할 수 있다. 이때 토픽 이름이 사실상 비밀번호다. 토픽 예약(남이 못 쓰게)은 유료(월 $5부터).
- 우선순위 1~5, `Click` 헤더에 URL을 넣으면 알림을 눌렀을 때 그 주소를 연다(`https://claude.ai/...`도 될 것으로 보이나 Claude 앱으로 바로 열리는지는 미확인).
- 메시지 4,096바이트 한도. 무료 일일 한도 수치는 공식 문서에서 찾지 못했다.
- 직접 운영하면 iOS 알림은 ntfy.sh 상위 서버를 거친다(내용 없는 깨우기만 전달).

**선택지 (학습 알림, 아침 복습):**

| 선택지 | 좋은 점 | 나쁜 점 |
|---|---|---|
| A. Cowork 예약 작업(클라우드) | 아침에 Claude가 커넥터로 `get_review_set`을 불러 문제를 준비하고, 휴대폰 알림을 받으면 그 대화에서 바로 푼다. 맥이 잠들어도 된다 | 원격 커넥터가 먼저 있어야 한다. 예약 작업 완료 알림이 실제로 오는지, 결과 대화에서 이어서 풀 수 있는지 미확인. 매일 구독 사용량을 쓴다 |
| B. 서버 스케줄러 + ntfy | 시각·문구를 서버가 정하고 알림이 확실하다. LLM 사용량이 없다 | 알림을 누른 뒤 Claude 앱을 열고 "복습하자"라고 직접 말해야 한다(한 단계 더). 토픽 비밀 관리 |
| C. A와 B를 함께 (A를 주로, 서버가 "오늘 안 풀었으면" 저녁에 ntfy) | 한쪽이 실패해도 알림이 온다 | 둘 다 만든다 |

**선택지 (새벽 동기화·문제 보충):**

| 선택지 | 좋은 점 | 나쁜 점 |
|---|---|---|
| A. 서버 스케줄러(launchd 상시 앱 안, `core/scheduler`) | `npm run sync`·`extract`·출제가 이미 서버 코드다. `claude -p`를 그대로 쓴다(ADR-0012). 놓친 실행 복구를 직접 정한다 | 상시 실행 앱과 감시가 필요하다(4단계에서 어차피 만든다) |
| B. Cowork 예약 작업이 도구를 불러 보충 | 서버에 스케줄러가 없다 | 동기화·추출처럼 오래 걸리는 일을 MCP 도구로 열어야 한다. 실패 감지·재시도가 Claude에 달린다 |

**추천 후보:** 보충은 A(서버 스케줄러). 아침 알림은 원격 연결 뒤 Cowork 예약 작업(A)을 하루 시험해 알림·이어 풀기가 되면 A, 안 되면 B. 운영 알림(인증 만료, 작업 실패, 서버 다운)은 사람이 꼭 받아야 하므로 10-14 조사대로 ntfy + 헬스체크 감시를 그대로 권한다.

## 6. MCP Apps (모바일)

**확인** ([MCP Apps 디자인 가이드](https://claude.com/docs/connectors/building/mcp-apps/design-guidelines), [커넥터 개요](https://claude.com/docs/connectors/overview)):

- 디자인 가이드: 모바일은 MCP App을 iOS `WKWebView`, Android `WebView`로 그린다. 카메라·마이크·위치는 못 쓴다. 커넥터는 웹·Desktop에서 붙여야 모바일에 뜬다. 인라인 카드(행동 2개까지, 탭 영역 44pt 이상), 캐러셀, 전체 화면 모드가 있다. 외부 출처는 기본 차단이고 `_meta.ui.csp`로 연다.
- 커넥터 개요의 앱별 목록은 "claude.ai 웹: 원격 커넥터와 MCP Apps", "모바일 앱: 원격 커넥터"라고만 적는다. 두 문서가 엇갈린다.
- 로컬(stdio) 서버는 모바일에서 쓸 수 없다. 원격 커넥터가 전제다.

**미확인:** 지금 iOS 앱에서 원격 커넥터의 MCP App이 실제로 그려지는지. 객관식 카드 하나로 확인하면 된다. ADR-0034에 따라 퀴즈 UI는 6단계이므로 4단계 결정에는 "원격 커넥터로 바꾸면 MCP Apps 길이 열린다" 정도만 넣는 것을 권한다.

## 7. 맥 상시 실행 (launchd)

**이 Mac의 지금 상태 (2026-10-19 확인):** `pmset -g`는 `sleep 0`, `autorestart 1`(정전 뒤 자동 켜짐), `womp 1`, `powernap 1`. FileVault 켜짐. Docker는 OrbStack. Tailscale·cloudflared는 설치되지 않았다. 잠자기 설정은 [운영 가이드](../ops.md) "잠자기와 전원"과 같다.

**주의점** ([launchd 정리](https://stackharbor.com/en/knowledge-base/openclaw-as-launchd-service/), [Mac mini 서버 설정](https://hometechops.com/mac/mac-mini-home-server-setup), `man launchd.plist`):

- **LaunchAgent**(`~/Library/LaunchAgents`)는 사용자가 로그인해야 뜬다. **LaunchDaemon**(`/Library/LaunchDaemons`, `UserName` 키로 사용자 지정)은 부팅하면 뜬다.
- **FileVault가 켜져 있으면 재부팅 뒤 누군가 디스크 암호를 풀기 전까지 아무것도 뜨지 않는다.** 자동 로그인도 FileVault와 함께 쓸 수 없다. 정전·업데이트 재부팅 뒤 원격 서버는 사람이 맥 앞에서 로그인할 때까지 멈춘다. OrbStack(DB)도 사용자 세션 앱이라 로그인 뒤에 뜬다.
- `KeepAlive`로 죽으면 다시 띄운다. 자식 프로세스를 따로 띄우는 실행 파일이면 여러 개가 뜰 수 있다. `ThrottleInterval`로 너무 잦은 재시작을 막는다.
- 앱이 DB보다 먼저 뜨면 연결이 실패한다. 시작 시 DB를 기다리거나(재시도) 실패하면 종료해 `KeepAlive`가 다시 띄우게 한다.
- Node 경로는 배포 릴리스의 `app/node` 링크를 쓴다(Desktop 설정과 같은 방식, 운영 가이드).
- 터널도 상시 실행이 필요하다. Funnel은 `--bg`(Tailscale 앱이 로그인 항목), cloudflared는 `service install`.
- macOS 업데이트 재부팅이 밤에 일어날 수 있다. 헬스체크 감시(외부에서 `/healthz`)로 알아채야 한다.

**선택지 (상시 실행):**

| 선택지 | 좋은 점 | 나쁜 점 |
|---|---|---|
| A. LaunchAgent + 재부팅 뒤 사람이 로그인 | FileVault를 유지한다. OrbStack·Tailscale 앱과 같은 사용자 세션이다. 가장 단순하다 | 재부팅 뒤 로그인할 때까지 멈춘다 |
| B. FileVault 끄고 자동 로그인 + LaunchAgent | 정전 뒤 스스로 돌아온다 | 디스크 암호화를 잃는다(학습 기록·Notion 원문이 있음) |
| C. LaunchDaemon | 로그인 없이 뜬다 | FileVault가 켜져 있으면 결국 같다. OrbStack DB가 사용자 세션이라 DB 없이 뜬다 |

**추천 후보:** A. 재부팅은 드물고, 헬스체크 감시로 멈춘 것을 알 수 있으면 충분하다. 맥 앞에 오래 없을 계획이 있으면 그때 B를 다시 묻는다.

## 인터뷰에서 물을 것

4단계(새 ADR):

1. 인증: OAuth + CIMD(추천) / 고정 헤더가 보이면 먼저 고정 헤더 / 그 밖
2. 공개 경로: Funnel 헤더 실험 뒤 결정(추천) / 바로 Funnel / 도메인 사서 Cloudflare
3. IP 제한: 원래 IP를 받을 수 있으면 `/mcp`·`/token`에 건다(10-14 설계 그대로) / 인증만 믿고 걸지 않는다
4. HTTP 서버: `node:http` + `toNodeHandler`(추천) / Nest HTTP 어댑터
5. 상시 실행: LaunchAgent + 재부팅 뒤 로그인(추천) / FileVault 끄고 자동 로그인
6. 운영 알림: ntfy + 외부 헬스체크(추천). 헬스체크를 무엇이 할지(무료 감시 서비스, ntfy 자체 등)
7. MCP Apps: 이번 ADR에는 경로만 남기고 6단계에서(추천) / 4단계에서 카드 하나로 확인

5단계(예약 작업):

1. 새벽 동기화·문제 보충: 서버 스케줄러(추천) / Cowork 예약 작업
2. 아침 복습 알림: Cowork 예약 작업을 시험해 보고 정함(추천) / 처음부터 ntfy / 둘 다
3. 시각: 새벽 작업과 아침 알림 시각, 놓친 실행 처리(맥이 꺼져 있던 경우)

## 실험으로 확인할 것

인터뷰 전에 하거나, 인터뷰에서 "확인 뒤 정한다"로 남길 것이다. 모두 코드 변경 없이 할 수 있다.

1. claude.ai Customize > Connectors > Add custom connector 다이얼로그에 **Request headers** 절이 보이는지 (1분)
2. Funnel 뒤에서 원래 접속 IP 헤더가 오는지: 헤더를 찍는 작은 서버 + `tailscale funnel` (30분, Tailscale 설치 필요)
3. 원격 커넥터를 붙인 뒤: Claude가 2026-07-28로 말하는지, 호스팅 앱의 CIMD `client_id` 값 (4단계 첫 PR에서 로그로)
4. Cowork 예약 작업이 원격 커스텀 커넥터를 부르는지, 끝나면 휴대폰 알림이 오는지, 그 대화에서 이어서 풀 수 있는지 (4단계 뒤 하루)
5. iOS 앱에서 원격 커넥터의 MCP App이 그려지는지 (6단계)
