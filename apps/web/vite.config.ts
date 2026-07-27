import { cloudflarePreviewKey } from "@github-account-info/preview-environment";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const previewKey = cloudflarePreviewKey(process.env);
const LOCAL_API_PREFIX = "/api";

export default defineConfig(({ mode }) => {
	const configEnvironment = loadEnv(mode, process.cwd(), "");
	const localApiProxyTarget = configEnvironment.LOCAL_API_PROXY_TARGET;

	return {
		define: {
			"import.meta.env.VITE_PREVIEW_KEY": JSON.stringify(previewKey),
		},
		server: {
			port: 3001,
			proxy: localApiProxyTarget
				? {
						[LOCAL_API_PREFIX]: {
							target: localApiProxyTarget,
							changeOrigin: true,
							rewrite: (path) => path.replace(LOCAL_API_PREFIX, ""),
						},
					}
				: undefined,
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
	};
});
