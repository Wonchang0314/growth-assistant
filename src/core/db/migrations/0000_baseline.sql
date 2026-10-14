-- Kotlin 버전의 Flyway V1(대화·운영 테이블)과 V2(summarized_message_id)를 합친 baseline (ADR-0014, 설계 문서 5.5)
CREATE TABLE "llm_call_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "llm_call_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"purpose" varchar(32) NOT NULL,
	"model" varchar(64) NOT NULL,
	"duration_ms" bigint NOT NULL,
	"success" boolean NOT NULL,
	"input_chars" integer NOT NULL,
	"output_chars" integer NOT NULL,
	"error" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_setting" (
	"key" varchar(128) PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_message" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "conversation_message_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"session_id" bigint NOT NULL,
	"role" varchar(16) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "conversation_message_role_check" CHECK ("conversation_message"."role" IN ('USER', 'TUTOR'))
);
--> statement-breakpoint
CREATE TABLE "conversation_session" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "conversation_session_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"discord_thread_id" bigint NOT NULL,
	"topic" text,
	"status" varchar(16) NOT NULL,
	"summary" text,
	"summarized_message_id" bigint,
	"answer_revealed" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "conversation_session_discord_thread_id_unique" UNIQUE("discord_thread_id"),
	CONSTRAINT "conversation_session_status_check" CHECK ("conversation_session"."status" IN ('ACTIVE', 'CLOSED'))
);
--> statement-breakpoint
ALTER TABLE "conversation_message" ADD CONSTRAINT "conversation_message_session_id_conversation_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."conversation_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_llm_call_log_created_at" ON "llm_call_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_conversation_message_session" ON "conversation_message" USING btree ("session_id","id");--> statement-breakpoint
CREATE INDEX "idx_conversation_session_active" ON "conversation_session" USING btree ("status") WHERE status = 'ACTIVE';