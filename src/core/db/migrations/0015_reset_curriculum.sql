-- ADR-0042: 학습 범위를 개발에서 회계·업무 도메인으로 바꾸며 학습 상태를 한 번 지운다. 뒤이은 시드 적재가 새 트랙과 개념을 넣는다.
-- 지우는 것: 풀이·문제, 하루 계획, 숙련도·복습 일정, 학습 기록과 그 개념 연결, 경험 카드·판단 사례의 개념 연결, 개념 관계, 개념(시드·수집·대화·거절 모두), 트랙.
-- 남기는 것: Notion 원문·청크·동기화 커서, 경험 카드, 판단 사례(개념 연결만 끊긴다), OAuth, 예약 작업 기록, LLM 호출 로그, app_setting(출제 지침 포함).
-- 개념을 ON DELETE 없이 가리키는 테이블이 있어 시드 적재만으로는 옛 개념을 지울 수 없다. 외래 키 순서로 지우고 TRUNCATE … CASCADE는 쓰지 않는다(지울 범위가 SQL에 드러나게).
-- 주의: 이 마이그레이션 전 백업을 복원한 뒤 마이그레이션을 다시 돌리면 학습 상태가 또 지워진다.
DELETE FROM "quiz_attempt";
--> statement-breakpoint
DELETE FROM "quiz_question";
--> statement-breakpoint
DELETE FROM "review_plan";
--> statement-breakpoint
DELETE FROM "concept_mastery";
--> statement-breakpoint
DELETE FROM "study_note_concept";
--> statement-breakpoint
DELETE FROM "study_note";
--> statement-breakpoint
DELETE FROM "experience_concept";
--> statement-breakpoint
DELETE FROM "decision_case_concept";
--> statement-breakpoint
DELETE FROM "concept_edge";
--> statement-breakpoint
DELETE FROM "concept";
--> statement-breakpoint
DELETE FROM "track";
