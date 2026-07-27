import type { AppRouter } from "@github-account-info/api/routers/index";
import { Button } from "@github-account-info/ui/components/button";
import { Skeleton } from "@github-account-info/ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@github-account-info/ui/components/table";
import type { inferRouterOutputs } from "@trpc/server";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";

type RouterOutputs = inferRouterOutputs<AppRouter>;
export type AccountRow = RouterOutputs["account"]["list"][number];

interface AccountTableProps {
	data: AccountRow[] | undefined;
	isLoading: boolean;
	canManage: (account: AccountRow) => boolean;
	onAdd: () => void;
	onView: (account: AccountRow) => void;
	onEdit: (account: AccountRow) => void;
	onDelete: (account: AccountRow) => void;
}

export function AccountTable({
	data,
	isLoading,
	canManage,
	onAdd,
	onView,
	onEdit,
	onDelete,
}: AccountTableProps) {
	if (isLoading) {
		return (
			<div className="flex flex-col gap-2 px-4 py-5">
				{Array.from({ length: 4 }).map((_, i) => (
					<Skeleton key={`account-skeleton-${i}`} className="h-10 w-full" />
				))}
			</div>
		);
	}

	if (!data || data.length === 0) {
		return (
			<div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
				<div className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
					<Plus className="size-5" aria-hidden="true" />
				</div>
				<div>
					<p className="font-medium">暂无账号记录</p>
					<p className="text-muted-foreground">
						新增一个 GitHub 账号后即可在这里统一管理。
					</p>
				</div>
				<Button onClick={onAdd}>
					<Plus data-icon="inline-start" />
					新增账户
				</Button>
			</div>
		);
	}

	return (
		<Table>
			<TableHeader className="bg-blue-50/70">
				<TableRow>
					<TableHead className="w-12">头像</TableHead>
					<TableHead>GitHub 用户名</TableHead>
					<TableHead>显示名称</TableHead>
					<TableHead>公司</TableHead>
					<TableHead className="text-right">关注者</TableHead>
					<TableHead className="text-right">正在关注</TableHead>
					<TableHead className="w-28">操作</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{data.map((account) => (
					<TableRow key={account.id}>
						<TableCell>
							{account.avatarUrl ? (
								<img
									src={account.avatarUrl}
									alt={account.login}
									width={40}
									height={40}
									loading="lazy"
									className="size-10 rounded-xl object-cover ring-1 ring-blue-100"
								/>
							) : (
								<div
									className="flex size-10 items-center justify-center rounded-xl bg-blue-50 font-semibold text-blue-600"
									aria-hidden="true"
								>
									{account.login.slice(0, 1).toUpperCase()}
								</div>
							)}
						</TableCell>
						<TableCell className="font-medium font-mono" translate="no">
							{account.login}
						</TableCell>
						<TableCell className="text-muted-foreground">
							{account.name ?? "—"}
						</TableCell>
						<TableCell className="text-muted-foreground">
							{account.company ?? "—"}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{account.followers.toLocaleString()}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{account.following.toLocaleString()}
						</TableCell>
						<TableCell>
							<div className="flex gap-1">
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={() => onView(account)}
									aria-label={`查看 ${account.login} 的公开主页`}
									className="text-blue-600 hover:bg-blue-50 hover:text-blue-700"
								>
									<Eye />
								</Button>
								{canManage(account) ? (
									<>
										<Button
											variant="ghost"
											size="icon-sm"
											onClick={() => onEdit(account)}
											aria-label={`编辑 ${account.login}`}
											className="text-blue-600 hover:bg-blue-50 hover:text-blue-700"
										>
											<Pencil />
										</Button>
										<Button
											variant="ghost"
											size="icon-sm"
											onClick={() => onDelete(account)}
											aria-label={`删除 ${account.login}`}
										>
											<Trash2 className="text-destructive" />
										</Button>
									</>
								) : null}
							</div>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
