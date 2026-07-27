import {
	doublePrecision,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

export const performanceEvent = pgTable(
	"performance_event",
	{
		eventId: uuid("event_id").primaryKey(),
		schemaVersion: integer("schema_version").notNull(),
		appId: text("app_id").notNull(),
		environment: text("environment").notNull(),
		release: text("release").notNull(),
		sessionId: uuid("session_id").notNull(),
		route: text("route").notNull(),
		eventType: text("event_type").notNull(),
		metricName: text("metric_name").notNull(),
		metricValue: doublePrecision("metric_value"),
		unit: text("unit"),
		message: text("message"),
		attributes: jsonb("attributes")
			.$type<Record<string, string | number | null>>()
			.notNull()
			.default({}),
		occurredAt: timestamp("occurred_at", {
			withTimezone: true,
			mode: "date",
		}).notNull(),
		receivedAt: timestamp("received_at", {
			withTimezone: true,
			mode: "date",
		}).notNull(),
		processingLagMs: integer("processing_lag_ms").notNull(),
		createdAt: timestamp("created_at", {
			withTimezone: true,
			mode: "date",
		})
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("performance_event_app_env_time_idx").on(
			table.appId,
			table.environment,
			table.occurredAt,
		),
		index("performance_event_metric_time_idx").on(
			table.appId,
			table.metricName,
			table.occurredAt,
		),
		index("performance_event_route_time_idx").on(
			table.appId,
			table.route,
			table.occurredAt,
		),
	],
);

export type PerformanceEventRow = typeof performanceEvent.$inferSelect;
export type PerformanceEventInsert = typeof performanceEvent.$inferInsert;
