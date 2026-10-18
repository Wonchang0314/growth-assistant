# ADR-0012: `claude` CLI를 `stream-json` 출력으로 호출한다

- 상태: 일부 대체됨 (동시 실행 수 → ADR-0027)
- 날짜: 2026-10-13
- 대체: [ADR-0002](0002-claude-cli-subscription.md)

## 맥락

ADR-0002는 `claude -p --output-format json`으로 호출하기로 했다. 1단계 CLI 스파이크(`claude` 2.1.296)에서 다음을 확인했다. 응답 샘플은 `src/test/resources/fixtures/claude/`에 있다.

- `json` 출력은 최종 `result` 객체 하나뿐이고, 사용량 한도 정보가 없다. 설계 문서 9장은 한도에 걸렸을 때 대화에 재개 가능 시각을 안내하라고 요구한다.
- `stream-json --verbose` 출력은 이벤트를 한 줄에 JSON 하나씩 낸다. 마지막 `result` 이벤트는 `json` 출력과 내용이 같다. 그 밖에 `rate_limit_event`(한도 상태, `resetsAt`)와 도구 호출 이벤트가 있다.
- 오류가 나도 `subtype`은 `"success"`로 나온다. 실패 여부는 `is_error`가 알려 준다. 미로그인일 때는 `api_error_status`가 비어 있고 `result` 문자열로만 알 수 있다.
- `--bare`는 구독 로그인(OAuth)을 읽지 않아 쓸 수 없다.
- 세션 파일이 `~/.claude/projects`에 쌓이므로 `--no-session-persistence`가 필요하다.

## 결정

ADR-0002의 원칙(구독을 쓰는 `claude -p` 서브프로세스, `ClaudeClient` 단일 경로, 격리, 도구 기본 비활성, 동시 실행 2개, `llm_call_log`)은 유지한다. 호출 형식은 다음과 같이 바꾼다.

```
claude -p --output-format stream-json --verbose --model <용도별 설정>
       --setting-sources "" --strict-mcp-config --no-session-persistence
       --tools "" | --tools "WebSearch,WebFetch" --allowedTools "WebSearch,WebFetch"
       [--system-prompt <프롬프트>] [--json-schema <스키마>]
```

- 출력은 끝까지 읽은 뒤 `result` 이벤트와 마지막 `rate_limit_event`만 해석한다. 나머지 이벤트는 무시한다.
- 성공 여부는 `is_error`로 판단한다. 오류 분류(AUTH, RATE_LIMIT 등)는 `api_error_status`, `rate_limit_event.status`, `result` 문자열을 함께 본다.
- 구조화된 출력은 `--json-schema`로 받고 `structured_output`을 Kotlin DTO로 다시 검증한다. 튜터 대화도 `{reply, sources}` 스키마를 써서 웹 출처를 구조화해 받는다.

## 결과

- 좋은 점: 한도 상태와 재개 시각을 문자열 추측 없이 얻는다. 도구 호출 이벤트로 웹 검색 사용 여부를 알 수 있다(`usage.server_tool_use`는 `WebSearch`를 써도 0으로 나온다). 나중에 응답을 점진적으로 보여 주고 싶어지면 확장할 수 있다.
- 나쁜 점·감수할 것: 줄 단위 파싱이 필요하다. 이벤트 형식이 CLI 버전에 따라 바뀔 수 있다(픽스처 테스트로 감지한다). 실제 한도 초과 출력은 아직 재현하지 못해, 처음 겪을 때 픽스처를 보강해야 한다.

## 검토한 대안

- `--output-format json` 유지: 한도 초과를 `result` 문자열로만 추측해야 하고 재개 시각을 얻지 못할 수 있다.
- `--include-partial-messages`(토큰 단위 스트리밍): 1단계는 응답을 한 번에 수정하므로 필요 없다.
