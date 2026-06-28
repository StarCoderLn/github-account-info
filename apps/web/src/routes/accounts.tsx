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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	AccountFormDialog,
	type AccountFormValues,
} from "@/components/accounts/account-form-dialog";
import type { AccountRow } from "@/components/accounts/account-table";
import { AccountTable } from "@/components/accounts/account-table";
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
	const queryClient = useQueryClient();

	const [formOpen, setFormOpen] = useState(false);
	const [editAccount, setEditAccount] = useState<AccountRow | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<AccountRow | null>(null);

	// ── Mutations ────────────────────────────────────────────────────────────

	const createMut = useMutation(trpc.account.create.mutationOptions());
	const updateMut = useMutation(trpc.account.update.mutationOptions());
	const deleteMut = useMutation(trpc.account.delete.mutationOptions());

	// ── Event handlers ───────────────────────────────────────────────────────

	const handleAdd = () => {
		setEditAccount(null);
		setFormOpen(true);
	};

	const handleEdit = (account: AccountRow) => {
		setEditAccount(account);
		setFormOpen(true);
	};

	const handleDelete = (account: AccountRow) => {
		setDeleteTarget(account);
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
		<div className="container mx-auto max-w-5xl px-4 py-6">
			<div className="mb-6 flex items-center justify-between">
				<h1 className="font-medium text-lg">GitHub Accounts</h1>
				<Button onClick={handleAdd}>
					<Plus />
					新增账户
				</Button>
			</div>

			<AccountTable
				onAdd={handleAdd}
				onEdit={handleEdit}
				onDelete={handleDelete}
			/>

			{/* Create / Edit dialog */}
			<AccountFormDialog
				open={formOpen}
				onOpenChange={setFormOpen}
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
