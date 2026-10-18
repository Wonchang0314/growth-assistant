-- 이미 있는 사례는 모두 경험 사례다(ADR-0026). 기본값은 채우는 데만 쓰고 바로 지운다.
ALTER TABLE "decision_case" ADD COLUMN "kind" varchar(16) NOT NULL DEFAULT 'EXPERIENCE';--> statement-breakpoint
ALTER TABLE "decision_case" ALTER COLUMN "kind" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "decision_case" ADD CONSTRAINT "decision_case_kind_check" CHECK ("decision_case"."kind" IN ('EXPERIENCE', 'HYPOTHETICAL'));