import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Secrets long enough for lib/secrets.ts to accept, and never real ones.
    env: {
      JWT_SECRET: "test-jwt-secret-long-enough-for-the-minimum-length",
      MAGIC_LINK_SECRET: "test-magic-link-secret-long-enough-for-the-minimum",
      OPS_API_KEY: "test-ops-key",
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    },
  },
});
