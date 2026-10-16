CREATE TABLE "concept" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "concept_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"track_id" integer NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"description" text NOT NULL,
	"status" varchar(16) NOT NULL,
	"origin" varchar(16) NOT NULL,
	"auto_approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "concept_name_unique" UNIQUE("name"),
	CONSTRAINT "concept_status_check" CHECK ("concept"."status" IN ('ACTIVE', 'PROPOSED', 'REJECTED')),
	CONSTRAINT "concept_origin_check" CHECK ("concept"."origin" IN ('SEED', 'INGESTION', 'CONVERSATION'))
);
--> statement-breakpoint
CREATE TABLE "concept_edge" (
	"from_id" bigint NOT NULL,
	"to_id" bigint NOT NULL,
	"type" varchar(16) NOT NULL,
	CONSTRAINT "concept_edge_from_id_to_id_type_pk" PRIMARY KEY("from_id","to_id","type"),
	CONSTRAINT "concept_edge_type_check" CHECK ("concept_edge"."type" IN ('PART_OF', 'PREREQUISITE', 'RELATED')),
	CONSTRAINT "concept_edge_not_self" CHECK ("concept_edge"."from_id" <> "concept_edge"."to_id")
);
--> statement-breakpoint
CREATE TABLE "track" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "track_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"weight" real NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "track_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "study_note_concept" (
	"note_id" bigint NOT NULL,
	"concept_id" bigint NOT NULL,
	"signal" varchar(16) NOT NULL,
	CONSTRAINT "study_note_concept_note_id_concept_id_pk" PRIMARY KEY("note_id","concept_id"),
	CONSTRAINT "study_note_concept_signal_check" CHECK ("study_note_concept"."signal" IN ('DISCUSSED', 'CONFUSED'))
);
--> statement-breakpoint
ALTER TABLE "concept" ADD CONSTRAINT "concept_track_id_track_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."track"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_edge" ADD CONSTRAINT "concept_edge_from_id_concept_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."concept"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_edge" ADD CONSTRAINT "concept_edge_to_id_concept_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."concept"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_note_concept" ADD CONSTRAINT "study_note_concept_note_id_study_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."study_note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_note_concept" ADD CONSTRAINT "study_note_concept_concept_id_concept_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concept"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_concept_edge_to" ON "concept_edge" USING btree ("to_id","type");--> statement-breakpoint
CREATE INDEX "idx_study_note_concept_concept" ON "study_note_concept" USING btree ("concept_id");