import { defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "2fa-local",
		compatibilityDate: "2026-10-26",
	},
});
