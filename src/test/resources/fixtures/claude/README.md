# `claude` CLI 응답 픽스처

2026-10-13, `claude` 2.1.296(WSL2 Ubuntu)에서 실제로 실행해 저장했다. 모든 호출은 빈 작업 디렉터리에서 아래 공통 옵션으로 실행했다.

```
claude -p --model <모델> --tools "" --setting-sources "" --strict-mcp-config --no-session-persistence
```

| 파일 | 추가 옵션·조건 | 확인한 점 |
|---|---|---|
| `text-success.json` | `--output-format json` | 응답 텍스트는 `result`. `is_error: false` |
| `schema-success.json` | `--json-schema` | 객체는 `structured_output`, `result`에는 같은 내용의 JSON 문자열. `num_turns`가 2 |
| `websearch-schema-success.json` | `--tools "WebSearch,WebFetch" --allowedTools ...` + `--system-prompt` + `--json-schema {reply, sources}` | 출처를 `sources` 배열로 받는다. 스키마 없이 쓰면 출처는 본문 텍스트로만 온다 |
| `error-not-logged-in.json` | 로그인 정보가 없는 `HOME` | 종료 코드 1, `is_error: true`, `subtype`은 그래도 `"success"`, `api_error_status: null`, `result`가 `"Not logged in · Please run /login"` |
| `error-unknown-model.json` | `--model no-such-model-x` | 종료 코드 1, `is_error: true`, `api_error_status: 404`. stderr에 `[claude-code:unrecognized_model]` |
| `stream-text-success.jsonl` | `--output-format stream-json --verbose` | `system/init`(도구·MCP 목록) → `assistant` → `rate_limit_event`(한도 상태, `resetsAt`) → `result` |

## 재현하지 못한 것

- **사용량 한도 초과:** 실제로 한도에 닿아야 재현된다. `rate_limit_event.rate_limit_info.status`가 평소에는 `"allowed"`이다. 초과 시의 정확한 출력은 확인하지 못했다.
- **로그인 토큰 만료:** 미로그인(`Not logged in`)과 메시지가 다를 수 있다.
- **타임아웃:** CLI 출력이 아니라 프로세스를 강제로 끝내는 쪽에서 처리한다.

## 판정 규칙 (스파이크 결론)

- 성공 여부는 `subtype`이 아니라 `is_error`로 판단한다.
- 인증 오류는 `api_error_status`가 비어 있을 수 있어 `result` 문자열로 판별한다.
- `usage.server_tool_use.web_search_requests`는 `WebSearch` 도구를 써도 0으로 나온다. 검색 횟수 기록에 쓰지 않는다.
