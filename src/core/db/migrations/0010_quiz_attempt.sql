CREATE TABLE "quiz_attempt" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "quiz_attempt_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"question_id" bigint NOT NULL,
	"user_answer" text NOT NULL,
	"is_correct" boolean NOT NULL,
	"confidence" varchar(16) NOT NULL,
	"hint_used" boolean NOT NULL,
	"misconception" text,
	"response_time_ms" integer,
	"answered_at" timestamp with time zone NOT NULL,
	CONSTRAINT "quiz_attempt_confidence_check" CHECK ("quiz_attempt"."confidence" IN ('SURE', 'UNSURE', 'GUESS'))
);
--> statement-breakpoint
ALTER TABLE "quiz_attempt" ADD CONSTRAINT "quiz_attempt_question_id_quiz_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."quiz_question"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_quiz_attempt_question" ON "quiz_attempt" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "idx_quiz_attempt_answered_at" ON "quiz_attempt" USING btree ("answered_at");