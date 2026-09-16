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
| `SITE_URL`                   | Public URL of this app, used for links in exports          |

Frontend (Vite, baked at build time — not Convex env):

| Variable          | Used for                                            |
| ----------------- | --------------------------------------------------- |
| `VITE_CONVEX_URL` | Convex client                                       |
| `VITE_SITE_URL`   | Absolute `og:*` / canonical URLs and the share image |

The recipient for emailed results is the board's "Email results to" setting.

## Host on Cloudflare Workers

```bash
# set VITE_CONVEX_URL and VITE_SITE_URL for the production origin, then:
npm run deploy
```

`VITE_SITE_URL` should be `https://slam.<your-subdomain>.workers.dev` (or your
custom domain) so Slack/iMessage/Twitter unfurl the title, description, and
`/og.png` card. After the first deploy, copy the workers.dev URL into
`VITE_SITE_URL` and deploy again if the first share-card URLs were still local.

Dashboard routes send `noindex`. Public board pages (`/b/:slug`) use the board
title and description in `<title>` and Open Graph tags.

## Layout

```
convex/
  convex.config.ts   components: auth core, password, username, anonymous, sharded-counter
  auth.ts            setupCore + setupUsernamePassword + setupAnonymous
  users.ts           createCreator / createParticipant (random names) / me
  boards.ts          create, getBySlug (public), getMine, updateSettings, join, myActivity, listParticipants
  ideas.ts           add, remove, castVote, addComment, listComments
  polls.ts           create (schedules close), endNow, castVote, close, getResults
  exports.ts         emailResults (Cloudflare), linearResults (Linear GraphQL)
  counters.ts        sharded counter keys
src/
  router.tsx         ConvexQueryClient + ConvexAuthProvider wiring
  routes/            index, dashboard/, b.$slug
  components/board/  IdeaCard, PollCard, ResultsCard
```
