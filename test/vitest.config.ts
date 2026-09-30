import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const migrations = await readD1Migrations(
  fileURLToPath(new URL('../web/db/migrations/', import.meta.url)),
);

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: {
          AUTH_GITHUB_CLIENT_ID: 'test-github-client-id',
          AUTH_GITHUB_CLIENT_SECRET: 'test-github-client-secret',
          BETTER_AUTH_SECRET: 'test-better-auth-secret-at-least-32-characters',
          PUBLIC_ORIGIN: 'https://test.codiff.local',
          TEST_MIGRATIONS: migrations,
        },
      },
      wrangler: { configPath: '../web/dist/ssr/wrangler.json' },
    }),
  ],
  test: {
    include: ['**/*.integration.ts'],
  },
});
