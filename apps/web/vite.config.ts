import { cloudflarePreviewKey } from "@github-account-info/preview-environment";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const previewKey = cloudflarePreviewKey(process.env);

export default defineConfig({
	define: {
		"import.meta.env.VITE_PREVIEW_KEY": JSON.stringify(previewKey),
	},
	server: {
		port: 3001,
	},
	resolve: {
		tsconfigPaths: true,
	},
	plugins: [
		tailwindcss(),
		tanstackRouter({
			target: "react",
			autoCodeSplitting: true,
		}),
		react(),
	],
});
