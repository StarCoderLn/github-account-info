import type { CleanedPerformanceEvent } from "@github-account-info/performance-schema";
import type { Pool } from "pg";

export type PerformanceEventRepository = {
	insert(events: ReadonlyArray<CleanedPerformanceEvent>): Promise<number>;
	deleteOlderThan(cutoff: Date): Promise<number>;
};

export function createPerformanceEventRepository(
	pool: Pool,
): PerformanceEventRepository {
	return {
		async insert(events) {
			if (events.length === 0) {
				return 0;
			}
			const client = await pool.connect();
			try {
				await client.query("BEGIN");
				let inserted = 0;
				for (const event of events) {
					const attributes =
						event.initiatorType === null
							? {}
							: { initiatorType: event.initiatorType };
					const result = await client.query(
						`INSERT INTO performance_event (
							event_id, schema_version, app_id, environment, release,
							session_id, route, event_type, metric_name, metric_value,
							unit, message, attributes, occurred_at, received_at,
							processing_lag_ms
						) VALUES (
							$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
							$13::jsonb, $14, $15, $16
						) ON CONFLICT (event_id) DO NOTHING`,
						[
							event.eventId,
							event.schemaVersion,
							event.appId,
							event.environment,
							event.release,
							event.sessionId,
							event.route,
							event.type,
							event.name,
							event.value,
							event.unit,
							event.message,
							JSON.stringify(attributes),
							event.occurredAt,
							event.receivedAt,
							event.processingLagMs,
						],
					);
					inserted += result.rowCount ?? 0;
				}
				await client.query("COMMIT");
				return inserted;
			} catch (error) {
				await client.query("ROLLBACK");
				throw error;
			} finally {
				client.release();
			}
		},
		async deleteOlderThan(cutoff) {
			const result = await pool.query(
				"DELETE FROM performance_event WHERE occurred_at < $1",
				[cutoff.toISOString()],
			);
			return result.rowCount ?? 0;
		},
	};
}
