CREATE TABLE "oauth_access_token" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"grant_id" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_authorization_code" (
	"code_hash" varchar(64) PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" varchar(128) NOT NULL,
	"resource" text NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_authorization_request" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "oauth_authorization_request_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"client_id" text NOT NULL,
	"client_name" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" varchar(128) NOT NULL,
	"client_state" text,
	"resource" text NOT NULL,
	"google_state_hash" varchar(64),
	"google_nonce" varchar(64) NOT NULL,
	"google_code_verifier" varchar(128) NOT NULL,
	"email" text,
	"consent_token_hash" varchar(64),
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "oauth_authorization_request_google_state_hash_unique" UNIQUE("google_state_hash"),
	CONSTRAINT "oauth_authorization_request_consent_token_hash_unique" UNIQUE("consent_token_hash")
);
--> statement-breakpoint
CREATE TABLE "oauth_grant" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "oauth_grant_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"client_id" text NOT NULL,
	"email" text NOT NULL,
	"resource" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "oauth_refresh_token" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"grant_id" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"rotated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_grant_id_oauth_grant_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."oauth_grant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_grant_id_oauth_grant_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."oauth_grant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_oauth_access_token_grant" ON "oauth_access_token" USING btree ("grant_id");--> statement-breakpoint
CREATE INDEX "idx_oauth_refresh_token_grant" ON "oauth_refresh_token" USING btree ("grant_id");