# ScopePulse

A no-build, responsive frontend prototype for a strategy-first proposal workflow. Open `index.html` directly in a modern browser, or serve this folder from a local HTTP server to enable clipboard permissions.

The Next.js App Router entry point is `app/page.tsx`. Start it locally with `npm run dev`, and create a production build with `npm run build`.

## Try the workflow

1. Review or edit the sample client brief and choose a proposal angle.
2. Select **Analyze & shape proposal** to see a staged, heuristic scope scan and recalibrated pricing options.
3. Select a pricing tier, then open the client preview to try the client-facing proposal and acceptance flow.
4. Visit **Insights** to see sample proposal analytics and engagement from your preview session.
5. Press **Ctrl/Cmd + K** for the command palette. `N` starts a proposal; `G` then `O`, `P`, `I`, or `C` opens Overview, Proposals, Insights, or Integrations.

The shareable client preview uses a local hash route, such as `#/p/brightforge`; the demo does not publish a hosted client link.

## Prototype boundary

This project contains frontend demo behavior, not a production AI or proposal service. Brief scans use local keyword heuristics, sample analytics are illustrative, clipboard access depends on browser permissions, and client acceptance does not create a legally binding signature or collect a payment. Nothing is sent to an external provider.

A production launch needs a backend, authenticated accounts, persistent proposal and consent records, an AI provider and validation policy, hosted client routes, a compliant e-signature flow, Stripe Connect authorization and checkout, consent-aware analytics and notifications, and provider-authorized CRM/webhook integrations. Never put provider credentials in this static frontend.
