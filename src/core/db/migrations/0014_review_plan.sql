CREATE TABLE "review_plan" (
	"plan_date" date NOT NULL,
	"position" smallint NOT NULL,
	"concept_id" bigint NOT NULL,
	CONSTRAINT "review_plan_plan_date_position_pk" PRIMARY KEY("plan_date","position"),
	CONSTRAINT "review_plan_plan_date_concept_id_unique" UNIQUE("plan_date","concept_id")
);
--> statement-breakpoint
ALTER TABLE "review_plan" ADD CONSTRAINT "review_plan_concept_id_concept_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concept"("id") ON DELETE cascade ON UPDATE no action;