const TOKENS_KEY = "gh_tokens";
const SELECTED_KEY = "gh_selected_token_id";

export interface SavedToken {
	id: string;
	name: string;
	token: string;
	login: string;
	displayName: string | null;
	avatarUrl: string | null;
	publicRepos: number;
	followers: number;
	following: number;
	createdAt: string;
}

export function getTokens(): SavedToken[] {
	try {
		const raw = localStorage.getItem(TOKENS_KEY);
		return raw ? (JSON.parse(raw) as SavedToken[]) : [];
	} catch {
		return [];
	}
}

export function addToken(t: SavedToken): void {
	const existing = getTokens().filter((x) => x.id !== t.id);
	localStorage.setItem(TOKENS_KEY, JSON.stringify([t, ...existing]));
}

export function removeToken(id: string): void {
	localStorage.setItem(
		TOKENS_KEY,
		JSON.stringify(getTokens().filter((x) => x.id !== id)),
	);
}

export function getSelectedTokenId(): string | null {
	return localStorage.getItem(SELECTED_KEY);
}

export function setSelectedTokenId(id: string | null): void {
	if (id) {
		localStorage.setItem(SELECTED_KEY, id);
	} else {
		localStorage.removeItem(SELECTED_KEY);
	}
}

export function getSelectedToken(): SavedToken | null {
	const id = getSelectedTokenId();
	if (!id) return null;
	return getTokens().find((t) => t.id === id) ?? null;
}

export function maskToken(token: string): string {
	return token.slice(0, 4) + "****";
}
