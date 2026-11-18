# Social Publisher

A team tool to write, schedule and track social posts. LinkedIn company Pages and personal profiles come first;
Facebook and Instagram plug in later as adapters (`src/platforms/`).

**Features**
- **Accounts:** connect LinkedIn Pages (admins) and personal profiles (each person).
- **Compose:** templates with `{{fields}}`, hashtag sets, images, and links with click tracking. A live preview,
  duplicate check and character counter catch mistakes before posting.
- **AI assist (Gemini):**
  - writes 3 post versions from a short description;
  - designs branded image cards (free, drawn by the tool);
  - makes AI pictures with Gemini's image model.
- **Post now, schedule or repeat:** daily, weekly on chosen days, or monthly, in any timezone.
- **Calendar** with drag to reschedule. **Posts** list with filters, retry and copy.
- **Approvals:** optional. Editors' posts wait for an admin.
- **Reports:**
  - impressions, reactions, comments, shares and link clicks, per day, account, template and post;
  - best time to post, and CSV export.
- **Team:** Admin, Editor and Viewer roles, plus an activity log.

## How it works

| Part | Service (all free tiers) |
|---|---|
| App | Next.js 16 on **Vercel** |
| Database | **Neon** Postgres (Drizzle ORM, HTTP driver) |
| Exact-minute publishing | **Upstash QStash** (500 messages/day free) |
| Safety-net check, every 10 min | **GitHub Actions** → `/api/cron/sweep` (plus a daily Vercel cron) |
| Images | **Vercel Blob** |
| AI | **Google Gemini** (`GEMINI_API_KEY`) |

**A post is never sent twice.** Each post/account pair is locked by one atomic database update before anything is sent.

**Failures are handled by type.**
- A temporary LinkedIn error is retried after 5 and then 10 minutes.
- An expired connection marks the account "expired" and shows a Reconnect banner.
- A run that stopped half-way is marked failed for a person to check. It is never resent blindly.

## Set up (once)

1. **Neon:** in your project, copy the connection string.
   - Locally, put it in `.env.local` (the password goes where `YOUR_PASSWORD` is).
   - Then create the tables with `npm install`, then `npm run db:migrate`.
2. **Vercel:** create a new project from this repository (framework Next.js), then add the environment variables
   below.
   - Generate the random ones with:
     `node -e "c=require('crypto');console.log(c.randomBytes(32).toString('base64url'),c.randomBytes(32).toString('hex'))"`
   - The first value is `AUTH_SECRET` (and use another for `CRON_SECRET`). The second, 64-hex value is `TOKEN_KEY`.
     **Never change `TOKEN_KEY` later**: saved connections would stop working.

   | Variable | What |
   |---|---|
   | `DATABASE_URL` | Neon connection string |
   | `AUTH_SECRET`, `CRON_SECRET`, `TOKEN_KEY` | random values (above) |
   | `APP_URL` | `https://<your-app>.vercel.app` (no trailing slash) |
   | `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | Upstash console → QStash |
   | `BLOB_READ_WRITE_TOKEN` | Vercel → Storage → create a Blob store and connect it to the project (added for you) |
   | `LINKEDIN_PAGE_CLIENT_ID`, `LINKEDIN_PAGE_CLIENT_SECRET` | the approved Community Management app (PGI Page Posts) |
   | `LINKEDIN_MEMBER_CLIENT_ID`, `LINKEDIN_MEMBER_CLIENT_SECRET` | the second LinkedIn app, for personal profiles |
   | `GEMINI_API_KEY` | Google AI Studio key. Optional: `GEMINI_TEXT_MODEL`, `GEMINI_IMAGE_MODEL` |

3. **LinkedIn apps:** in each app → Auth, add the redirect URL `https://<your-app>.vercel.app/api/connect/linkedin/callback`.
   - **Pages app:** products "Community Management API" (already approved).
   - **Profiles app:** create a second app with the products "Share on LinkedIn" and "Sign In with LinkedIn using
     OpenID Connect" (free, instant). LinkedIn does not allow these on the Community Management app.
4. **GitHub Actions** (the 10-minute check): repository → Settings → Secrets → Actions. Add `APP_URL` and `CRON_SECRET`
   (the same values as in Vercel).
5. Open the site → **create the first admin** (works only once) → Accounts → **Connect LinkedIn Page** → Test.
6. Team & settings: brand name and colour (used by AI posts and cards), approval on or off, team timezone, add people.

Keys are only ever set in Vercel or GitHub settings. Never put them in code or chat.

## Notes on LinkedIn
- **Tokens and versions:**
  - Tokens last 60 days. They renew by themselves where LinkedIn gives a refresh token; otherwise the dashboard warns
    7 days before, and you press Reconnect.
  - The `LinkedIn-Version` header falls back through the last months by itself, and remembers the version that works.
- **Numbers:**
  - Impressions and clicks are available for **Page** posts.
  - Personal profile posts show reactions and comments only (LinkedIn's limit).
  - Link clicks are counted by our own `/r/<code>` link for every account. Link-preview bots are not counted.

## Notes on AI assist
- **Write post:** gives 3 different versions (hook, informative, question/list) plus hashtags. It never adds facts that
  are not in your description.
- **Design card:** Gemini suggests a headline; the tool draws the card itself. It has 3 looks and 3 shapes, uses the
  brand colour, and costs no AI image credit.
- **AI picture:** uses `GEMINI_IMAGE_MODEL`. Google may require billing on the key for image models; if it refuses, the
  tool says so.
- **Daily caps per person:** 150 texts, 100 cards and 20 pictures.

## Develop
```
npm install
npm run dev          # http://localhost:3000 (reads .env.local)
npm test             # 32 tests: logic, card rendering, and the server code against an in-memory Postgres (PGlite)
npm run typecheck
npm run db:generate  # after changing src/db/schema.ts, then npm run db:migrate
```
