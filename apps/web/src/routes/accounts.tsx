import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@github-account-info/ui/components/alert-dialog";
import { Button } from "@github-account-info/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@github-account-info/ui/components/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	AccountFormDialog,
	type AccountFormValues,
} from "@/components/accounts/account-form-dialog";
import type { AccountRow } from "@/components/accounts/account-table";
import { AccountTable } from "@/components/accounts/account-table";
import { getTokens, type SavedToken } from "@/utils/token-store";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/accounts")({
	component: AccountsPage,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert optional form string fields to null for nullable backend columns.
 * Per AGENTS.md T-003: empty string ≠ null at the DB level.
 */
function toNullable(value: string | undefined): string | null | undefined {
	if (value === undefined) return undefined;
	return value === "" ? null : value;
}

/** Map an existing AccountRow to AccountFormValues for edit pre-population */
function toFormValues(row: AccountRow): Partial<AccountFormValues> {
	return {
		login: row.login,
		githubId: row.githubId,
		name: row.name ?? "",
		avatarUrl: row.avatarUrl ?? "",
		bio: row.bio ?? "",
		company: row.company ?? "",
		location: row.location ?? "",
		email: row.email ?? "",
		publicRepos: row.publicRepos,
		followers: row.followers,
		following: row.following,
	};
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

function AccountsPage() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const [formOpen, setFormOpen] = useState(false);
	const [editAccount, setEditAccount] = useState<AccountRow | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<AccountRow | null>(null);
	const [localTokens, setLocalTokens] = useState<SavedToken[]>([]);

	// ── Mutations ────────────────────────────────────────────────────────────

	const listQuery = useQuery(trpc.account.list.queryOptions());
	const createMut = useMutation(trpc.account.create.mutationOptions());
	const updateMut = useMutation(trpc.account.update.mutationOptions());
	const deleteMut = useMutation(trpc.account.delete.mutationOptions());

	useEffect(() => setLocalTokens(getTokens()), []);

	const manageableLogins = useMemo(
		() => new Set(localTokens.map((token) => token.login)),
		[localTokens],
	);

	const canManage = (account: AccountRow) =>
		manageableLogins.has(account.login);

	// ── Event handlers ───────────────────────────────────────────────────────

	const handleAdd = () => {
		setEditAccount(null);
		setFormOpen(true);
	};

	const handleEdit = (account: AccountRow) => {
		if (!canManage(account)) {
			toast.error("当前浏览器没有该账号的 Token，只能查看公开资料");
			return;
		}
		setEditAccount(account);
		setFormOpen(true);
	};

	const handleDelete = (account: AccountRow) => {
		if (!canManage(account)) {
			toast.error("当前浏览器没有该账号的 Token，不能删除该账号");
			return;
		}
		setDeleteTarget(account);
	};

	const handleView = (account: AccountRow) => {
		void navigate({
			to: "/u/$username",
			params: { username: account.login },
		});
	};

	async function handleFormSubmit(values: AccountFormValues) {
		// Convert empty strings → null for nullable columns (see AGENTS.md T-003).
		const payload = {
			login: values.login,
			githubId: values.githubId,
			name: toNullable(values.name),
			avatarUrl: toNullable(values.avatarUrl),
			bio: toNullable(values.bio),
			company: toNullable(values.company),
			location: toNullable(values.location),
			email: toNullable(values.email),
			publicRepos: values.publicRepos,
			followers: values.followers,
			following: values.following,
		};

		try {
			if (editAccount !== null) {
				await updateMut.mutateAsync({ id: editAccount.id, ...payload });
				queryClient.invalidateQueries(trpc.account.list.queryFilter());
				toast.success("账户已更新");
			} else {
				await createMut.mutateAsync(payload);
				queryClient.invalidateQueries(trpc.account.list.queryFilter());
				toast.success("账户已新增");
			}
			setFormOpen(false);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "操作失败，请重试");
		}
	}

	const handleConfirmDelete = () => {
		if (deleteTarget === null) return;
		const target = deleteTarget;
		deleteMut.mutate(
			{ id: target.id },
			{
				onSuccess: () => {
					queryClient.invalidateQueries(trpc.account.list.queryFilter());
					toast.success(`账户 ${target.login} 已删除`);
					setDeleteTarget(null);
				},
				onError: (err) => {
					toast.error(err.message ?? "删除失败，请重试");
					setDeleteTarget(null);
				},
			},
		);
	};

	const isPending = createMut.isPending || updateMut.isPending;

	// ── Render ───────────────────────────────────────────────────────────────

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<p className="font-medium text-blue-600 text-xs tracking-[0.16em]">
						ACCOUNT DIRECTORY
					</p>
					<h1 className="text-balance font-semibold text-2xl tracking-tight">
						GitHub 账号管理
					</h1>
					<p className="mt-1 text-muted-foreground">
						有本地 Token 的账号可以管理，其他账号仅可查看公开资料。
					</p>
				</div>
				<Button
					onClick={handleAdd}
					className="rounded-lg bg-blue-600 text-white hover:bg-blue-700"
				>
					<Plus data-icon="inline-start" />
					新增账号
				</Button>
			</div>

			<Card className="rounded-2xl bg-white shadow-sm ring-blue-100">
				<CardHeader className="border-blue-100 border-b bg-gradient-to-r from-blue-50/80 to-transparent">
					<div className="flex items-center gap-3">
						<div className="flex size-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
							<UsersRound className="size-5" aria-hidden="true" />
						</div>
						<div>
							<CardTitle>账号目录</CardTitle>
							<CardDescription>
								操作权限以当前浏览器保存的账号 Token 为准。
							</CardDescription>
						</div>
					</div>
					<CardAction className="rounded-full bg-blue-50 px-3 py-1.5 text-blue-700 tabular-nums ring-1 ring-blue-100">
						{listQuery.data?.length ?? 0} 个账号
					</CardAction>
				</CardHeader>
				<CardContent className="px-0">
					<AccountTable
						data={listQuery.data}
						isLoading={listQuery.isLoading}
						canManage={canManage}
						onAdd={handleAdd}
						onView={handleView}
						onEdit={handleEdit}
						onDelete={handleDelete}
					/>
				</CardContent>
			</Card>

			{/* Create / Edit dialog */}
			<AccountFormDialog
				open={formOpen}
				onOpenChange={(open) => {
					setFormOpen(open);
					if (!open) {
						setEditAccount(null);
					}
				}}
				editId={editAccount?.id}
				defaultValues={editAccount ? toFormValues(editAccount) : undefined}
				onSubmit={handleFormSubmit}
				isPending={isPending}
			/>

			{/* Delete confirmation dialog */}
			<AlertDialog
				open={deleteTarget !== null}
				onOpenChange={(open) => {
					if (!open) setDeleteTarget(null);
				}}
			>
				<AlertDialogContent size="sm">
					<AlertDialogHeader>
						<AlertDialogTitle>确认删除</AlertDialogTitle>
						<AlertDialogDescription>
							确定要删除账户{" "}
							<strong className="text-foreground">{deleteTarget?.login}</strong>{" "}
							吗？此操作不可撤销。
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleteMut.isPending}>
							取消
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={deleteMut.isPending}
							onClick={handleConfirmDelete}
						>
							{deleteMut.isPending ? "删除中…" : "删除"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
