CREATE TABLE "quiz_question" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "quiz_question_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"concept_id" bigint NOT NULL,
	"type" varchar(16) NOT NULL,
	"angle" varchar(16) NOT NULL,
	"key_point" text NOT NULL,
	"variant_of" bigint,
	"difficulty" smallint NOT NULL,
	"prompt" text NOT NULL,
	"choices" jsonb,
	"answer" text NOT NULL,
	"accepted_answers" text[] DEFAULT '{}' NOT NULL,
	"explanation" text NOT NULL,
	"reference_material" text NOT NULL,
	"experience_id" bigint,
	"case_id" bigint,
	"validation_status" varchar(16) NOT NULL,
	"validation_note" text,
	"reported" boolean DEFAULT false NOT NULL,
	"report_reason" text,
	"used_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "quiz_question_type_check" CHECK ("quiz_question"."type" IN ('MULTIPLE_CHOICE', 'FILL_BLANK')),
	CONSTRAINT "quiz_question_angle_check" CHECK ("quiz_question"."angle" IN ('WHY', 'WHEN', 'TRADEOFF', 'MECHANISM', 'SCENARIO', 'MY_PROJECT')),
	CONSTRAINT "quiz_question_validation_check" CHECK ("quiz_question"."validation_status" IN ('PENDING', 'VALID', 'INVALID')),
	CONSTRAINT "quiz_question_difficulty_check" CHECK ("quiz_question"."difficulty" BETWEEN 1 AND 3),
	CONSTRAINT "quiz_question_choices_check" CHECK (("quiz_question"."type" = 'MULTIPLE_CHOICE') = ("quiz_question"."choices" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "quiz_question" ADD CONSTRAINT "quiz_question_concept_id_concept_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concept"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_question" ADD CONSTRAINT "quiz_question_variant_of_quiz_question_id_fk" FOREIGN KEY ("variant_of") REFERENCES "public"."quiz_question"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_question" ADD CONSTRAINT "quiz_question_experience_id_experience_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experience"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_question" ADD CONSTRAINT "quiz_question_case_id_decision_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."decision_case"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_quiz_question_concept" ON "quiz_question" USING btree ("concept_id","validation_status");