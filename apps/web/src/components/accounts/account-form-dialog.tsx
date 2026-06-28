import { Button } from "@github-account-info/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@github-account-info/ui/components/dialog";
import { Input } from "@github-account-info/ui/components/input";
import { Label } from "@github-account-info/ui/components/label";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { trpc } from "@/utils/trpc";

// ---------------------------------------------------------------------------
// Schema  (Zod v4 — uses `error` instead of `required_error/invalid_type_error`)
// ---------------------------------------------------------------------------

/**
 * Form validation schema aligned with the backend githubAccountInsertSchema.
 *
 * - login / githubId are required; all other fields are optional.
 * - githubId uses valueAsNumber so react-hook-form gives the resolver a
 *   number (NaN when empty). Zod v4 z.number() rejects NaN by default, so an
 *   empty field naturally fails with the `error` message.
 * - publicRepos / followers / following likewise use valueAsNumber and default
 *   to 0 when the user leaves them untouched.
 * - email: empty string is allowed (treated as "no email"); non-empty must be
 *   valid format.
 */
export const accountFormSchema = z.object({
	login: z.string().min(1, "login 不能为空"),
	githubId: z
		.number({ error: "GitHub ID 不能为空" })
		.int("GitHub ID 必须为整数")
		.min(1, "GitHub ID 必须为正整数"),
	name: z.string().optional(),
	avatarUrl: z.string().optional(),
	bio: z.string().optional(),
	company: z.string().optional(),
	location: z.string().optional(),
	/** Empty string ⇒ "no email"; any non-empty value must be a valid address. */
	email: z
		.union([z.string().email("email 格式不正确"), z.literal("")])
		.optional(),
	publicRepos: z.number({ error: "必须为数字" }).int().min(0),
	followers: z.number({ error: "必须为数字" }).int().min(0),
	following: z.number({ error: "必须为数字" }).int().min(0),
});

export type AccountFormValues = z.infer<typeof accountFormSchema>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Default values for a "new account" form.
 *
 * githubId is set to NaN so the number input renders empty in the browser
 * (browsers display NaN as an empty number field). NaN is of type `number` in
 * TypeScript, satisfying the inferred schema type, and Zod v4 rejects it with
 * the configured error message on submit.
 */
const EMPTY_FORM_VALUES: AccountFormValues = {
	login: "",
	githubId: Number.NaN,
	name: "",
	avatarUrl: "",
	bio: "",
	company: "",
	location: "",
	email: "",
	publicRepos: 0,
	followers: 0,
	following: 0,
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type AccountFormDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/**
	 * Present in edit mode (the database row id, NOT GitHub's githubId).
	 * Absent for new account creation.
	 */
	editId?: number;
	/**
	 * Pre-populate the form fields.
	 * - Edit mode: pass the existing account's values.
	 * - Token prefill (T-004): pass the values returned by github.getAccount.
	 * Merged on top of EMPTY_FORM_VALUES when the dialog opens.
	 */
	defaultValues?: Partial<AccountFormValues>;
	/** Called with fully validated / coerced form values on submit. */
	onSubmit: (values: AccountFormValues) => Promise<void>;
	/** Disables the submit button while a mutation is in-flight. */
	isPending?: boolean;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AccountFormDialog({
	open,
	onOpenChange,
	editId,
	defaultValues,
	onSubmit,
	isPending = false,
}: AccountFormDialogProps) {
	// Store defaultValues in a ref so the open-change effect always picks up the
	// latest value without being listed as a dependency — prevents spurious resets
	// when the parent re-renders with the same data but a new object reference.
	const defaultValuesRef = useRef(defaultValues);
	defaultValuesRef.current = defaultValues;

	const {
		register,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<AccountFormValues>({
		resolver: zodResolver(accountFormSchema),
		defaultValues: EMPTY_FORM_VALUES,
	});

	// ---------------------------------------------------------------------------
	// Token prefill state (T-004) — token is NOT part of the form submission.
	// ---------------------------------------------------------------------------
	const [token, setToken] = useState("");

	const fetchMutation = useMutation(trpc.github.getAccount.mutationOptions());

	const handleFetchAccount = async () => {
		const trimmed = token.trim();
		if (!trimmed) {
			toast.error("请先输入 GitHub PAT");
			return;
		}
		try {
			const acc = await fetchMutation.mutateAsync({ token: trimmed });
			// Map nullable API fields → empty strings for controlled form inputs.
			reset({
				login: acc.login,
				githubId: acc.githubId,
				name: acc.name ?? "",
				avatarUrl: acc.avatarUrl ?? "",
				bio: acc.bio ?? "",
				company: acc.company ?? "",
				location: acc.location ?? "",
				email: acc.email ?? "",
				publicRepos: acc.publicRepos,
				followers: acc.followers,
				following: acc.following,
			});
			setToken("");
			fetchMutation.reset();
			toast.success("已成功从 GitHub 拉取账户信息");
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "拉取 GitHub 账户信息失败",
			);
		}
	};

	// Reset the form whenever the dialog opens or closes.
	// On open: merge any defaultValues (edit / prefill) over the empty template.
	// On close: wipe back to empty so a subsequent "new account" open is clean.
	// Also clear the PAT input on close so it is never retained across sessions.
	useEffect(() => {
		if (open) {
			reset({ ...EMPTY_FORM_VALUES, ...defaultValuesRef.current });
		} else {
			reset(EMPTY_FORM_VALUES);
			setToken("");
			fetchMutation.reset();
		}
	}, [open, reset, fetchMutation.reset]);

	const isEdit = editId !== undefined;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			{/* showCloseButton={false}: DialogFooter already renders a "Close" button;
			    having both the X icon and the text "Close" violates the single-entry
			    principle documented in AGENTS.md T-003. */}
			<DialogContent className="sm:max-w-lg" showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>{isEdit ? "编辑账户" : "新增账户"}</DialogTitle>
				</DialogHeader>

				{/* ── Token prefill section (T-004) ────────────────────────────────
				    PAT is only used for the one-shot GitHub fetch and is discarded
				    immediately after; it is never included in the form submit payload
				    or written to any storage. ──────────────────────────────────── */}
				<div className="flex flex-col gap-1 rounded-md border p-3">
					<Label htmlFor="af-token" className="text-muted-foreground text-xs">
						GitHub PAT（可选 · 用于自动填写下方字段）
					</Label>
					<div className="flex gap-2">
						<Input
							id="af-token"
							type="password"
							autoComplete="off"
							placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
							value={token}
							onChange={(e) => setToken(e.target.value)}
							className="flex-1"
						/>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={fetchMutation.isPending}
							onClick={handleFetchAccount}
						>
							{fetchMutation.isPending ? "拉取中…" : "从 GitHub 拉取"}
						</Button>
					</div>
				</div>

				{/* noValidate: delegate all validation to zod, not the browser */}
				<form
					onSubmit={handleSubmit(onSubmit)}
					className="grid gap-4"
					noValidate
				>
					{/* ── login + githubId ── */}
					<div className="grid grid-cols-2 gap-3">
						<div className="flex flex-col gap-1">
							<Label htmlFor="af-login">
								Login <span className="text-destructive">*</span>
							</Label>
							<Input
								id="af-login"
								{...register("login")}
								aria-invalid={!!errors.login}
								placeholder="octocat"
								autoComplete="off"
							/>
							{errors.login && (
								<p role="alert" className="text-destructive text-xs">
									{errors.login.message}
								</p>
							)}
						</div>

						<div className="flex flex-col gap-1">
							<Label htmlFor="af-githubId">
								GitHub ID <span className="text-destructive">*</span>
							</Label>
							{/* valueAsNumber: react-hook-form passes a number (NaN if empty)
							    to the zodResolver — avoids z.coerce / z.preprocess type issues */}
							<Input
								id="af-githubId"
								type="number"
								min={1}
								{...register("githubId", { valueAsNumber: true })}
								aria-invalid={!!errors.githubId}
								placeholder="583231"
							/>
							{errors.githubId && (
								<p role="alert" className="text-destructive text-xs">
									{errors.githubId.message}
								</p>
							)}
						</div>
					</div>

					{/* ── name + email ── */}
					<div className="grid grid-cols-2 gap-3">
						<div className="flex flex-col gap-1">
							<Label htmlFor="af-name">姓名</Label>
							<Input
								id="af-name"
								{...register("name")}
								placeholder="The Octocat"
								autoComplete="off"
							/>
						</div>

						<div className="flex flex-col gap-1">
							<Label htmlFor="af-email">Email</Label>
							<Input
								id="af-email"
								type="email"
								{...register("email")}
								aria-invalid={!!errors.email}
								placeholder="octocat@github.com"
								autoComplete="off"
							/>
							{errors.email && (
								<p role="alert" className="text-destructive text-xs">
									{errors.email.message}
								</p>
							)}
						</div>
					</div>

					{/* ── company + location ── */}
					<div className="grid grid-cols-2 gap-3">
						<div className="flex flex-col gap-1">
							<Label htmlFor="af-company">公司</Label>
							<Input
								id="af-company"
								{...register("company")}
								placeholder="GitHub, Inc."
								autoComplete="off"
							/>
						</div>

						<div className="flex flex-col gap-1">
							<Label htmlFor="af-location">地点</Label>
							<Input
								id="af-location"
								{...register("location")}
								placeholder="San Francisco, CA"
								autoComplete="off"
							/>
						</div>
					</div>

					{/* ── avatarUrl ── */}
					<div className="flex flex-col gap-1">
						<Label htmlFor="af-avatarUrl">头像 URL</Label>
						<Input
							id="af-avatarUrl"
							{...register("avatarUrl")}
							aria-invalid={!!errors.avatarUrl}
							placeholder="https://avatars.githubusercontent.com/u/583231"
							autoComplete="off"
						/>
						{errors.avatarUrl && (
							<p role="alert" className="text-destructive text-xs">
								{errors.avatarUrl.message}
							</p>
						)}
					</div>

					{/* ── bio ── */}
					<div className="flex flex-col gap-1">
						<Label htmlFor="af-bio">简介</Label>
						<Input
							id="af-bio"
							{...register("bio")}
							placeholder="GitHub's mascot"
							autoComplete="off"
						/>
					</div>

					{/* ── publicRepos + followers + following ── */}
					<div className="grid grid-cols-3 gap-3">
						<div className="flex flex-col gap-1">
							<Label htmlFor="af-publicRepos">公开仓库</Label>
							<Input
								id="af-publicRepos"
								type="number"
								min={0}
								{...register("publicRepos", { valueAsNumber: true })}
								aria-invalid={!!errors.publicRepos}
							/>
							{errors.publicRepos && (
								<p role="alert" className="text-destructive text-xs">
									{errors.publicRepos.message}
								</p>
							)}
						</div>

						<div className="flex flex-col gap-1">
							<Label htmlFor="af-followers">关注者</Label>
							<Input
								id="af-followers"
								type="number"
								min={0}
								{...register("followers", { valueAsNumber: true })}
								aria-invalid={!!errors.followers}
							/>
							{errors.followers && (
								<p role="alert" className="text-destructive text-xs">
									{errors.followers.message}
								</p>
							)}
						</div>

						<div className="flex flex-col gap-1">
							<Label htmlFor="af-following">正在关注</Label>
							<Input
								id="af-following"
								type="number"
								min={0}
								{...register("following", { valueAsNumber: true })}
								aria-invalid={!!errors.following}
							/>
							{errors.following && (
								<p role="alert" className="text-destructive text-xs">
									{errors.following.message}
								</p>
							)}
						</div>
					</div>

					{/* Footer: DialogFooter's showCloseButton renders a "Close/Cancel"
					    button via DialogPrimitive.Close; the submit button lives here too */}
					<DialogFooter showCloseButton>
						<Button type="submit" disabled={isPending}>
							{isPending ? "保存中…" : "保存"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
