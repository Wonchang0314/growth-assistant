CREATE TABLE "concept_mastery" (
	"concept_id" bigint PRIMARY KEY NOT NULL,
	"state" varchar(16) NOT NULL,
	"stability" double precision NOT NULL,
	"difficulty" double precision NOT NULL,
	"reps" integer NOT NULL,
	"lapses" integer NOT NULL,
	"last_review_at" timestamp with time zone,
	"due_at" timestamp with time zone NOT NULL,
	"mastery_score" double precision NOT NULL,
	"weakness_score" double precision NOT NULL,
	"graded_attempts" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "concept_mastery_state_check" CHECK ("concept_mastery"."state" IN ('NEW', 'LEARNING', 'REVIEW', 'RELEARNING')),
	CONSTRAINT "concept_mastery_scores_check" CHECK ("concept_mastery"."mastery_score" BETWEEN 0 AND 1 AND "concept_mastery"."weakness_score" BETWEEN 0 AND 1)
);
--> statement-breakpoint
ALTER TABLE "concept_mastery" ADD CONSTRAINT "concept_mastery_concept_id_concept_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concept"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_concept_mastery_due_at" ON "concept_mastery" USING btree ("due_at");