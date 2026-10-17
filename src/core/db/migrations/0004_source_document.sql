CREATE TABLE "document_chunk" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "document_chunk_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"document_id" bigint NOT NULL,
	"seq" integer NOT NULL,
	"chunk_hash" varchar(64) NOT NULL,
	"content" text NOT NULL,
	CONSTRAINT "document_chunk_document_seq_key" UNIQUE("document_id","seq")
);
--> statement-breakpoint
CREATE TABLE "source_document" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "source_document_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"source" varchar(16) NOT NULL,
	"external_id" varchar(64) NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"summary" text,
	"content_hash" varchar(64) NOT NULL,
	"source_updated_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	"extraction_status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"last_error" text,
	CONSTRAINT "source_document_source_external_id_key" UNIQUE("source","external_id"),
	CONSTRAINT "source_document_source_check" CHECK ("source_document"."source" IN ('NOTION')),
	CONSTRAINT "source_document_extraction_status_check" CHECK ("source_document"."extraction_status" IN ('PENDING', 'DONE', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE "sync_cursor" (
	"source" varchar(16) PRIMARY KEY NOT NULL,
	"last_synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sync_cursor_source_check" CHECK ("sync_cursor"."source" IN ('NOTION'))
);
--> statement-breakpoint
ALTER TABLE "document_chunk" ADD CONSTRAINT "document_chunk_document_id_source_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."source_document"("id") ON DELETE cascade ON UPDATE no action;