CREATE TABLE "scheduled_job" (
	"name" varchar(64) PRIMARY KEY NOT NULL,
	"slot_date" date NOT NULL,
	"status" varchar(16) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"result" text,
	CONSTRAINT "scheduled_job_status_check" CHECK ("scheduled_job"."status" IN ('RUNNING', 'SUCCEEDED', 'FAILED'))
);
