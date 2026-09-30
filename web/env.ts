import { defineEnv, string } from 'void/env';

// For local GitHub OAuth, use http://localhost:6002/api/auth/callback/github.
export default defineEnv({
  AUTH_GITHUB_CLIENT_ID: string(),
  AUTH_GITHUB_CLIENT_SECRET: string(),
  BETTER_AUTH_SECRET: string(),
});
