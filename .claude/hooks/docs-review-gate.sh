#!/usr/bin/env bash
# Stop: 이번 작업에서 코드 파일을 고쳤으면 종료를 한 번 막고 문서 검토를 요구한다.
# 막는 즉시 기록을 지워 같은 수정으로 두 번 막지 않는다. 검토 라운드(stop_hook_active) 중에는 막지 않는다.
input=$(cat)
session=$(jq -r '.session_id // empty' <<<"$input")
active=$(jq -r '.stop_hook_active // false' <<<"$input")
[[ -z "$session" ]] && exit 0

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
state="$root/.claude/state/pending-docs-$session.txt"
[[ -s "$state" ]] || exit 0
files=$(head -n 30 "$state")
rm -f "$state"
[[ "$active" == "true" ]] && exit 0

reason="이번 작업에서 아래 코드 파일이 수정됐다. 끝내기 전에 CLAUDE.md의 '문서 갱신 규칙'에 따라 관련 문서가 구현과 맞는지 검토하고, 필요한 문서를 고친 뒤 마지막에 '문서 점검: 갱신 <파일들> / 불필요 <이유>' 한 줄로 보고하라.
$files"
jq -n --arg reason "$reason" '{decision: "block", reason: $reason}'
