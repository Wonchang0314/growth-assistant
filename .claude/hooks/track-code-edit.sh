#!/usr/bin/env bash
# PostToolUse(Edit|Write|MultiEdit): 이번 작업에서 고친 코드 파일을 기록한다.
# 문서(.md), docs/, .claude/ 아래 파일은 기록하지 않는다. 짝은 docs-review-gate.sh(Stop).
input=$(cat)
session=$(jq -r '.session_id // empty' <<<"$input")
path=$(jq -r '.tool_input.file_path // empty' <<<"$input")
[[ -z "$session" || -z "$path" ]] && exit 0

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
rel="${path#"$root"/}"
[[ "$rel" == /* ]] && exit 0   # 프로젝트 밖 파일
case "$rel" in
  *.md|docs/*|.claude/*) exit 0 ;;
esac

state_dir="$root/.claude/state"
mkdir -p "$state_dir"
state="$state_dir/pending-docs-$session.txt"
grep -qxF "$rel" "$state" 2>/dev/null || echo "$rel" >>"$state"
exit 0
