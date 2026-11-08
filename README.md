# ScopePulse

ScopePulse is a strategy-first proposal workspace built with Next.js. The responsive dashboard is served in the App Router app from `public/scopepulse/`; the standalone `index.html` remains available for a local, heuristic-only preview.

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and add your Supabase project URL, Supabase anon/publishable key, and Anthropic API key.
3. Apply [`supabase/schema.sql`](./supabase/schema.sql) in your Supabase SQL editor. It enables email/password accounts, creates a default workspace for new users, adds workspace and proposal storage, and configures row-level security and client acceptance.
4. Enable Google under Supabase **Authentication → Providers**, add your Google OAuth client ID and secret, and add the Supabase callback URL shown on that provider page to the Google Cloud OAuth client.
5. Add `http://localhost:3000/` and your deployed app origin to the Supabase Auth URL allow list.
6. Run `npm run dev`, then open `http://localhost:3000`.

The root `render.yaml` is a Render Blueprint; Vercel deployments need the same environment variables configured in the project settings.

## Production environment variables

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon or publishable key. This is intentionally public; RLS protects all data.
- `ANTHROPIC_API_KEY`: server-side Anthropic API key. Never expose this as a `NEXT_PUBLIC_` variable.
- `ANTHROPIC_MODEL`: optional Anthropic model override; defaults to `claude-sonnet-4-5-20250929`.

The analysis route requires an authenticated Supabase user, validates input and model output, and keeps the Anthropic key on the server. Missing service configuration is reported instead of silently presented as an AI result. Unauthenticated local preview uses clearly labelled heuristic sample analysis.

## Client links and acceptance

Sign in, generate and save a proposal, then select **Preview client link** to publish a UUID-backed share URL at `/p/<id>`. Clients can choose a tier and record their name and explicit acceptance. Proposals and acceptance records are protected with Supabase RLS. This records an acceptance; it is **not** a qualified e-signature or payment checkout.

Set the Supabase Auth site URL to your production domain and allow the local/deployed redirect URLs. Never put a Supabase service-role key in the browser or in committed files.

Google sign-in uses Supabase OAuth with PKCE and the `/auth/callback` route. Configure the Google provider and add `https://<your-app-domain>/auth/callback` to the Supabase Auth URL allow list, alongside your local and production app origins, before using the button.
