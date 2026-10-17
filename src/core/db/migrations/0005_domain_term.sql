CREATE TABLE "domain_term" (
	"term" text PRIMARY KEY NOT NULL,
	"replacement" text NOT NULL,
	"is_pattern" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
