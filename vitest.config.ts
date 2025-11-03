import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { viteStaticCopy as copy } from "vite-plugin-static-copy";

export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: "node",
					environment: "node",
					include: ["**/*.test.ts?(x)"],
					exclude: ["**/*.contract.test.ts?(x)", "node_modules"],
					globals: true,
				},
			},
			{
				plugins: [
					copy({
						targets: [
							{
								src: "./node_modules/wa-sqlite/dist/wa-sqlite.wasm",
								dest: "",
							},
						],
					}),
				],
				server: {
					headers: {
						"Cross-Origin-Embedder-Policy": "require-corp",
						"Cross-Origin-Opener-Policy": "same-origin",
					},
				},
				test: {
					name: "browser",
					include: ["**/*.test.ts?(x)"],
					exclude: ["**/*.contract.test.ts?(x)", "node_modules"],
					globals: true,
					browser: {
						enabled: true,
						provider: playwright(),
						headless: true,
						screenshotFailures: false,
						instances: [
							{ browser: "chromium" },
							{ browser: "firefox" },
							{ browser: "webkit" },
						],
					},
				},
			},
		],
	},
});
