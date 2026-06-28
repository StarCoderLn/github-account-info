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
import { useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { trpc } from "@/utils/trpc";

type RouterOutputs = inferRouterOutputs<AppRouter>;
export type AccountRow = RouterOutputs["account"]["list"][number];

interface AccountTableProps {
	onAdd: () => void;
	onEdit: (account: AccountRow) => void;
	onDelete: (account: AccountRow) => void;
}

export function AccountTable({ onAdd, onEdit, onDelete }: AccountTableProps) {
	const { data, isLoading } = useQuery(trpc.account.list.queryOptions());

	if (isLoading) {
		return (
			<div className="space-y-2">
				{Array.from({ length: 4 }).map((_, i) => (
					<Skeleton key={i} className="h-10 w-full" />
				))}
			</div>
		);
	}

	if (!data || data.length === 0) {
		return (
			<div className="rounded-none border p-12 text-center">
				<p className="mb-4 text-muted-foreground text-sm">暂无账户记录</p>
				<Button onClick={onAdd}>
					<Plus />
					新增账户
				</Button>
			</div>
		);
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-12">头像</TableHead>
					<TableHead>Login</TableHead>
					<TableHead>Name</TableHead>
					<TableHead>Company</TableHead>
					<TableHead className="text-right">Followers</TableHead>
					<TableHead className="text-right">Following</TableHead>
					<TableHead className="w-20">操作</TableHead>
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
									className="size-8 rounded-full object-cover"
								/>
							) : (
								<div className="size-8 rounded-full bg-muted" />
							)}
						</TableCell>
						<TableCell className="font-medium font-mono">
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
									onClick={() => onEdit(account)}
									aria-label="编辑"
								>
									<Pencil />
								</Button>
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={() => onDelete(account)}
									aria-label="删除"
								>
									<Trash2 className="text-destructive" />
								</Button>
							</div>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
