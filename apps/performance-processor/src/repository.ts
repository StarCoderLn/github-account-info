import type { CleanedPerformanceEvent } from "@github-account-info/performance-schema";
import type { Pool } from "pg";

export type PerformanceEventRepository = {
	insert(events: ReadonlyArray<CleanedPerformanceEvent>): Promise<number>;
	deleteOlderThan(cutoff: Date): Promise<number>;
};

/**
 * 清洗层与 PostgreSQL 之间的持久化边界。
 *
 * Repository 只接收 CleanedPerformanceEvent，原始浏览器事件不能绕过 processor
 * 直接写库；接口抽象也让消费循环可以用内存实现进行单元测试。
 */
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
				// 同一 SQS batch 在一个事务中落库，避免出现半批成功、半批重试的状态。
				await client.query("BEGIN");
				let inserted = 0;
				for (const event of events) {
					const attributes =
						event.initiatorType === null
							? {}
							: { initiatorType: event.initiatorType };
					// 所有值都使用参数化 SQL；event_id 冲突时忽略，使 SQS 至少一次投递幂等。
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
				// 暂时性数据库错误向上传递，processor 会保留 SQS 消息等待重试。
				await client.query("ROLLBACK");
				throw error;
			} finally {
				client.release();
			}
		},
		async deleteOlderThan(cutoff) {
			// 保留期以事件发生时间为准，而不是异步入库时间。
			const result = await pool.query(
				"DELETE FROM performance_event WHERE occurred_at < $1",
				[cutoff.toISOString()],
			);
			return result.rowCount ?? 0;
		},
	};
}
