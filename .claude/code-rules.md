# growth-assistant 코드 룰 보강

`seokit-frontend:code-rules`에 더해 적용한다.

## 프로젝트 규칙

- **P1. lean-code.** `.claude/skills/lean-code/SKILL.md`의 L1–L5를 함께 적용한다. 리뷰에서는 `L번호`로 인용한다. 예시는 같은 폴더의 `references/patterns.md`에 있다.

## 공통 규칙 변경

- **R6 대체:** 호출처가 하나뿐인 래퍼, pass-through, 감추는 게 없는 인터페이스를 만들지 않는 것은 그대로다. "중복 세 줄이 성급한 추상화보다 낫다"는 L2(같은 의미의 로직은 두 번째에 합친다)로 바꾼다.

## 검증 명령

- typecheck: `npm run typecheck`
- lint: `npm run lint && npm run format:check`
- test: `npm test` (DB 테스트는 Testcontainers를 쓰므로 Docker가 실행 중이어야 한다)
