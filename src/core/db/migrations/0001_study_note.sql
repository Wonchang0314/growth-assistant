CREATE TABLE "study_note" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "study_note_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"topic" text NOT NULL,
	"summary" text NOT NULL,
	"confused_points" text[] DEFAULT '{}' NOT NULL,
	"answer_revealed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_study_note_created_at" ON "study_note" USING btree ("created_at" DESC NULLS LAST);