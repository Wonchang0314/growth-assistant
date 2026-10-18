CREATE TABLE "decision_case" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "decision_case_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"experience_id" bigint NOT NULL,
	"situation" text NOT NULL,
	"constraints" text[] NOT NULL,
	"options" jsonb NOT NULL,
	"decision" text NOT NULL,
	"rationale" text NOT NULL,
	"outcome" text NOT NULL,
	"invariants" text[] NOT NULL,
	"status" varchar(16) NOT NULL,
	"review_note" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "decision_case_experience_id_unique" UNIQUE("experience_id"),
	CONSTRAINT "decision_case_status_check" CHECK ("decision_case"."status" IN ('PENDING', 'ACTIVE', 'REJECTED'))
);
--> statement-breakpoint
CREATE TABLE "decision_case_concept" (
	"case_id" bigint NOT NULL,
	"concept_id" bigint NOT NULL,
	CONSTRAINT "decision_case_concept_case_id_concept_id_pk" PRIMARY KEY("case_id","concept_id")
);
--> statement-breakpoint
ALTER TABLE "experience" ADD COLUMN "case_screen" varchar(16);--> statement-breakpoint
ALTER TABLE "decision_case" ADD CONSTRAINT "decision_case_experience_id_experience_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experience"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_case_concept" ADD CONSTRAINT "decision_case_concept_case_id_decision_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."decision_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_case_concept" ADD CONSTRAINT "decision_case_concept_concept_id_concept_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concept"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_decision_case_status" ON "decision_case" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_decision_case_concept_concept" ON "decision_case_concept" USING btree ("concept_id");--> statement-breakpoint
ALTER TABLE "experience" ADD CONSTRAINT "experience_case_screen_check" CHECK ("experience"."case_screen" IN ('DECISION', 'NO_DECISION'));