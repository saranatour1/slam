# Slam

Post ideas and pitches on a board, share the link, and let people slam them
anonymously with upvotes, downvotes and comments. Run a timed poll, freeze the
results, and send them to Linear or your inbox.

- **Stack:** TanStack Start (SSR) · Convex · Convex Auth v2 (alpha) · shadcn/ui
- **Auth:** the board creator has a username + password account; everyone else
  is signed in anonymously and given a random name like "Brisk Otter 42".
- **Tallies:** `@convex-dev/sharded-counter` for votes, comment counts and poll
  options. Poll results are frozen into a `pollResults` row when the poll closes
  (by timer or "End poll now") and exports read from that snapshot.

## Run it

```bash
npm install
cp .env.example .env.local   # then fill CONVEX_* and VITE_* from `npx convex dev`
npx convex dev               # terminal 1 – pushes convex/ and watches for changes
npm run dev                  # terminal 2 – http://127.0.0.1:3000
```

`npx convex dev` writes `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL` into `.env.local`
(gitignored). Set `VITE_SITE_URL` to the public origin of this app so Open Graph
and canonical URLs are absolute.

```bash
npx convex dev --configure new --project slam   # or --configure existing
npx @convex-dev/auth                            # sets AUTH_PRIVATE_KEY / AUTH_JWKS on it
```

## Routes

| Path                  | Who       | What                                                             |
| --------------------- | --------- | ---------------------------------------------------------------- |
| `/`                   | anyone    | Landing + creator sign in / sign up                              |
| `/dashboard`          | creator   | Your boards, create a board                                      |
| `/dashboard/:boardId` | creator   | Add ideas, toggle votes/comments, run polls, results, exports, sessions |
| `/b/:slug`            | anyone    | Public board: auto anonymous sign-in, vote, comment, poll        |

## Convex environment variables

Set on the deployment with `npx convex env set NAME value`. All optional except
the two auth keys the CLI creates.

| Variable                     | Used for                                                   |
| ---------------------------- | ---------------------------------------------------------- |
| `AUTH_PRIVATE_KEY`, `AUTH_JWKS` | Convex Auth v2 signing keys (`npx @convex-dev/auth`)     |
| `CLOUDFLARE_ACCOUNT_ID`      | Cloudflare Email Sending REST API                          |
| `CLOUDFLARE_EMAIL_API_TOKEN` | API token with Email Sending permission                    |
| `EMAIL_FROM`                 | Verified sender address (e.g. `slam@yourdomain.com`)       |
| `LINEAR_API_KEY`             | Linear personal API key                                    |
| `LINEAR_TEAM_ID`             | Team to create the results issue in                        |
| `TYPESAFE_API_KEY`           | TypeSafe System One (Jev) — Jev idea yes/no/thoughts      |
| `SITE_URL`                   | Public URL of this app, used for links in exports          |

Frontend (Vite, baked at build time — not Convex env):

| Variable          | Used for                                            |
| ----------------- | --------------------------------------------------- |
| `VITE_CONVEX_URL` | Convex client                                       |
| `VITE_SITE_URL`   | Absolute `og:*` / canonical URLs and the share image |

The recipient for emailed results is the board's "Email results to" setting.

## Jev (TypeSafe System One / Jev)

Jev judges ideas with structured TypeSafe answers (not free-text). Set
`TYPESAFE_API_KEY` on the Convex deployment. New ideas enqueue a judgment
automatically; creators can re-run via `jev.evaluateIdea`.

| Call | Kind | What |
| ---- | ---- | ---- |
| `api.jev.evaluateIdea({ ideaId })` | mutation | Board owner; enqueues Jev, returns `jevJudgments` id |
| `api.jev.latestForIdea({ ideaId })` | query | Newest judgment (pending / complete / failed) |
| `api.jev.listForBoard({ boardId, limit? })` | query | Recent judgments on a board |

On success, `verdict` is `yes` \| `no` \| `thoughts` (Choice), `worthPursuing` is a
Noul 0–1, and `thoughts.{clarity,novelty,feasibility}` are Score values with
confidence. Failures (including a missing API key) set `status: "failed"` and
`error`.

## Hosting: Convex (backend) + Cloudflare Workers (frontend)

The Convex instance was never in Git — it lives on Convex Cloud. Local
`.env.local` (gitignored) points at the **dev** deployment. GitHub Actions
deploys `convex/` to **production**, then builds and ships the Worker.

| Deployment | URL | Used by |
| ---------- | --- | ------- |
| Dev        | `https://dutiful-kiwi-883.convex.cloud` | `npm run dev` |
| Prod       | `https://secret-mandrill-184.convex.cloud` | Cloudflare / `npx convex deploy` |

Dashboard: [dev](https://dashboard.convex.dev/d/dutiful-kiwi-883) · [prod](https://dashboard.convex.dev/d/secret-mandrill-184)

### GitHub Actions (push to `main`)

Add these under the repo **Settings → Secrets and variables → Actions**:

| Kind   | Name                   | Where to get it |
| ------ | ---------------------- | --------------- |
| Secret | `CONVEX_DEPLOY_KEY`    | Convex dashboard → Production → Settings → Deploy key |
| Secret | `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers edit |
| Secret | `CLOUDFLARE_ACCOUNT_ID`| Cloudflare account id |
| Variable | `VITE_SITE_URL`      | `https://slam.<your-subdomain>.workers.dev` (or your domain) |

The workflow runs `npx convex deploy --cmd 'npm run build'` so the Worker is
built against the **production** Convex URL, then `wrangler deploy`.

Production also needs Convex Auth keys (`npx @convex-dev/auth` against prod, or
copy `AUTH_PRIVATE_KEY` / `AUTH_JWKS` onto that deployment). Set `SITE_URL` on
prod to the same public origin as `VITE_SITE_URL`.

### Cloudflare Workers Builds (Git integration)

Separate from GitHub Actions: the Cloudflare GitHub app builds on push. TanStack
Start + the Vite Cloudflare plugin **must** run `vite build` before
`wrangler versions upload`, or the upload fails with a missing entry-point.

In Workers → **slam** → Settings → Build:

| Setting | Value |
| ------- | ----- |
| Build command | `npm run build` |
| Deploy command (production / `main`) | `npx wrangler deploy` |
| Non-production branch deploy command | `npm run deploy:preview` |

`npm run deploy:preview` is `npm run build && wrangler versions upload` (preview
versions without promoting production). If the Build command is empty and the
non-production command is only `npx wrangler versions upload`, PR branches fail
while `main` can still succeed when its deploy script builds first.

### Deploy locally

```bash
# backend → production Convex (confirms before pushing)
npx convex deploy

# frontend → Cloudflare (after `npx wrangler login`)
VITE_CONVEX_URL=https://secret-mandrill-184.convex.cloud VITE_SITE_URL=https://<your-worker>.workers.dev npm run deploy
```

`VITE_SITE_URL` must be the public origin so Slack/iMessage/Twitter unfurl
`/og.png`. Dashboard routes send `noindex`. Public board pages (`/b/:slug`) use
the board title and description in `<title>` and Open Graph tags.

## Layout

```
convex/
  convex.config.ts     components: auth core, password, username, anonymous, sharded-counter
  auth.ts              setupCore + setupUsernamePassword + setupAnonymous
  schema.ts            composes per-table `_schema.ts` fragments
  lib/                 shared helpers (auth, views, Zod wrappers) — no registered functions
  users.ts             me  ·  users/internal.ts: createCreator, createParticipant
  boards.ts            create, listMine, getBySlug, getMine, updateSettings, join, myActivity, listParticipants
  ideas.ts             add, remove, castVote, addComment, listComments (add enqueues Jev)
  polls.ts             create, endNow, castVote, getResults  ·  polls/internal.ts: close
  exports.ts           emailResults, linearResults  ·  exports/internal.ts: sendEmail (REST), sendLinear
  jev.ts               evaluateIdea, latestForIdea, listForBoard  ·  jev/internal.ts: TypeSafe run
  <table>/_schema.ts   table fragment (bundled, not an extra API module)
  counters.ts          sharded counter keys
src/
  router.tsx           ConvexQueryClient + ConvexAuthProvider wiring
  routes/              index, dashboard/, b.$slug
  components/board/    IdeaCard, PollCard, ResultsCard
```
