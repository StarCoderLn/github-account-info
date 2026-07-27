CREATE TABLE "performance_event" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"app_id" text NOT NULL,
	"environment" text NOT NULL,
	"release" text NOT NULL,
	"session_id" uuid NOT NULL,
	"route" text NOT NULL,
	"event_type" text NOT NULL,
	"metric_name" text NOT NULL,
	"metric_value" double precision,
	"unit" text,
	"message" text,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"processing_lag_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "performance_event_app_env_time_idx" ON "performance_event" USING btree ("app_id","environment","occurred_at");--> statement-breakpoint
CREATE INDEX "performance_event_metric_time_idx" ON "performance_event" USING btree ("app_id","metric_name","occurred_at");--> statement-breakpoint
CREATE INDEX "performance_event_route_time_idx" ON "performance_event" USING btree ("app_id","route","occurred_at");