import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				miniflare: {
					bindings: {
						API_KEY: "TEST_API_KEY",
					},
				},
				wrangler: { configPath: "./wrangler.toml" },
			},
		},
	},
});
