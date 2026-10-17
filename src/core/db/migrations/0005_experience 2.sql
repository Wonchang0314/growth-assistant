CREATE TABLE "experience" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "experience_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"document_id" bigint,
	"origin" varchar(16) NOT NULL,
	"project_name" text,
	"title" text NOT NULL,
	"situation" text NOT NULL,
	"task" text NOT NULL,
	"action" text NOT NULL,
	"result" text NOT NULL,
	"lesson" text NOT NULL,
	"occurred_at" date,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "experience_origin_check" CHECK ("experience"."origin" IN ('DOCUMENT', 'CONVERSATION'))
);
--> statement-breakpoint
CREATE TABLE "experience_concept" (
	"experience_id" bigint NOT NULL,
	"concept_id" bigint NOT NULL,
	CONSTRAINT "experience_concept_experience_id_concept_id_pk" PRIMARY KEY("experience_id","concept_id")
);
--> statement-breakpoint
ALTER TABLE "experience" ADD CONSTRAINT "experience_document_id_source_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."source_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_concept" ADD CONSTRAINT "experience_concept_experience_id_experience_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experience"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_concept" ADD CONSTRAINT "experience_concept_concept_id_concept_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concept"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_experience_document" ON "experience" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_experience_concept_concept" ON "experience_concept" USING btree ("concept_id");