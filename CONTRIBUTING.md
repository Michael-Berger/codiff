# Contributing to Codiff

## AI Assistance Notice

> [!IMPORTANT]
>
> If you use any kind of AI assistance to contribute to Codiff, disclose it in
> the pull request.

Include the extent of the assistance, such as research, documentation, tests, or
code generation. Disclose AI-generated pull request responses as well. Trivial
tab completion limited to a keyword or short phrase does not need disclosure.

Example:

> This PR was written primarily with Claude Code.

Or:

> I used ChatGPT to understand the sharing flow. I wrote and tested the change
> myself.

Contributors are expected to understand submitted code and be able to explain
its behavior and tradeoffs.

Thanks to
[Ghostty's contribution guidelines](https://github.com/ghostty-org/ghostty/blob/main/CONTRIBUTING.md)
for inspiring this policy.

## Requirements

Codiff uses Node.js 24, pnpm 11, and
[Vite+](https://viteplus.dev/). Install Vite+ before working in the repository.

You will also need Git. The native application requires a platform supported by
Electron.

## Initial Setup

From the repository root:

```bash
vp install
vp run build
```

The first build creates the package output consumed by the desktop application
and the public web service.

## Native Application Development

Start the renderer from the repository root:

```bash
vp run dev
```

In another terminal, launch Electron against the development renderer:

```bash
vp run dev:app
```

Run the built application without the development server with:

```bash
vp run electron
```

Changes to `core/`, Electron code, or CLI behavior should include focused tests
under the corresponding `__tests__` directory.

## Public Web Service

The public service is a Cloudflare Worker backed by D1, R2, and a Durable
Object. Wrangler provides local versions of these bindings, so ordinary web
development does not require a Cloudflare account.

Public plan and walkthrough shares are unlisted. Creating a share requires a
GitHub-authenticated account, while reading a share only requires its
unguessable URL.

### Create a GitHub App

Create a GitHub App in your GitHub developer settings. For local development,
use:

- Homepage URL: `http://localhost:6002`
- Callback URL: `http://localhost:6002/api/auth/callback/github`
- Webhooks: disabled
- Account permission for email addresses: read-only

No repository or organization permissions are required for sharing.

Copy the client ID and generate a client secret. If you deploy your own
instance, add its production callback URL to the app or create a separate
GitHub App for production.

### Configure Local Secrets

Copy the example file:

```bash
cp web/.env.example web/.env.local
```

Generate a Better Auth secret:

```bash
openssl rand -base64 32
```

Fill in `web/.env.local`:

```dotenv
AUTH_GITHUB_CLIENT_ID=
AUTH_GITHUB_CLIENT_SECRET=
BETTER_AUTH_SECRET=
```

### Run the Service

From the repository root:

```bash
vp run --filter '@nkzw/codiff-web' dev
```

This applies local D1 migrations and starts the service at
`http://localhost:6002`. Local state is stored under `web/.void/`.

When server views or Fate schema types change, regenerate the client:

```bash
vp run --filter '@nkzw/codiff-web' fate:generate
```

Do not edit files under `web/.fate/` or `web/.void/` manually.

### Test Sharing End to End

Point the Codiff CLI at the local public service:

```bash
CODIFF_SHARE_SERVER_URL=http://localhost:6002 \
  node ./bin/codiff.js --share --public
```

The command opens the GitHub sign-in and claim page, uploads the walkthrough
after authentication, and prints the local share URL.

To test a plan:

```bash
CODIFF_SHARE_SERVER_URL=http://localhost:6002 \
  node ./bin/codiff.js --plan ./plan.md --share --public
```

Use `--public` for this workflow even if your Git email would normally route to
another Codiff service.

### Database Changes

The Drizzle schema lives in `service/schema.ts`. Public D1 migrations live in
`web/db/migrations/`.

For a schema change:

1. Update the Drizzle schema.
2. Add a forward-only SQL migration under `web/db/migrations/`.
3. Apply it locally with:

```bash
vp run --filter '@nkzw/codiff-web' db:migrate
```

Do not rewrite a migration that may already have been applied. Add another
migration instead.

### Deploy a Separate Instance

Deployment is not required for normal contributions. To run your own instance,
work from the web package and connect Void to the Cloudflare account for your
domain:

```bash
cd web
vp exec void cloudflare login
vp exec void connect --platform cloudflare
```

Update `web/void.config.ts` with a unique Worker name, D1 database name, R2
bucket name, `PUBLIC_ORIGIN`, and route for your domain. Void provisions new
storage or adopts resources with those names during deployment.

Set the production secrets:

```bash
vp exec void secret put AUTH_GITHUB_CLIENT_ID
vp exec void secret put AUTH_GITHUB_CLIENT_SECRET
vp exec void secret put BETTER_AUTH_SECRET
```

Deploy the Worker and apply pending D1 migrations:

```bash
vp run --filter '@nkzw/codiff-core' build
vp run --filter '@nkzw/codiff-service' build
vp exec void deploy --platform cloudflare
```

Do not deploy a pull request or use the `codiff.dev` production resources
without maintainer approval.

## Validation

Before opening a pull request, run:

```bash
vp check --fix
vp test
vp run build
```

Changes to public authentication, sharing, storage, quotas, or comments should
also run:

```bash
vp run test:integration
```

This builds the Worker and exercises the public sharing flow against local D1
and R2 bindings.

`vp run build` builds Core, the sharing service, the public website, and the
desktop renderer in dependency order. If an `@nkzw/codiff-core` or
`@nkzw/codiff-service` module cannot be resolved, rebuild from the repository
root.

Run a focused test while iterating:

```bash
vp test path/to/file.test.ts
```

For UI changes, test the affected desktop or web workflow and include
screenshots in the pull request when they help reviewers verify the result.
