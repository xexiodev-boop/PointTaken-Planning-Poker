# Point Taken

**Free, real-time planning poker for agile teams. No signup, no tracking.**

Live at **[pointtaken.team](https://pointtaken.team)**.

Point Taken is a planning poker app for sprint estimation. A facilitator creates a room,
shares the link, and the team votes on tasks with a card deck in real time. There are no
accounts to make. Rooms expire on their own, and the app doesn't keep anything about your
team or your backlog.

## Features

- **Instant rooms**: create a room and share one link; everyone joins with just a display name.
- **Real-time voting**: live card selection, confirmation tracking, and reveal over WebSockets.
- **Flexible decks**: Fibonacci, t-shirt sizes, and more; add, remove, or reorder cards freely.
- **Estimate suggestions**: most votes, median, average rounded up, middle ground, highest
  vote, or no suggestion at all.
- **Backlog queue**: batch-add items to estimate, reorder them by drag and drop, and edit
  titles inline between rounds.
- **Jira import**: optionally sign in with Atlassian and pull issues into the queue with a
  project picker or your own JQL. Read-only, and the token never leaves an HttpOnly cookie.
- **Round insights**: agreement percentage, unanimous-vote detection, vote spread, and a
  detailed per-estimate breakdown.
- **History export**: download completed estimates as CSV or Markdown, generated locally in
  your browser.
- **People management**: observers, facilitator transfer, participant removal, room locking.
- **Reactions**: an optional curated reaction palette with raised hands that persist until
  lowered.
- **Auto-reveal and reminders**: reveal automatically when everyone has voted, or nudge after
  a configurable timer.

## Privacy

The app holds as little about you as possible:

- No accounts, emails, passwords, or profiles.
- Rooms are anonymous and expire seven days after the last real activity. A facilitator can
  delete a room and everything in it at any time.
- Participant identity lives in a room-scoped, HttpOnly, SameSite cookie. Application
  JavaScript can't read it, and it never appears in WebSocket URLs.
- Logs leave out names, votes, task titles, identity tokens, and joinable room ids. Rooms
  show up only as one-way hashed tags, and per-request URL logging is turned off.
- Exports are built in your browser. Nothing has to leave the room to produce them.

## How a session works

1. A facilitator creates a room and selects a deck.
2. Anyone with the link joins using a display name.
3. The facilitator starts a task; eligible participants select and confirm a card.
4. The facilitator reveals the cards, reviews the suggested estimate, and saves the result.
5. Votes and final estimates stay in the room history until the room expires or is deleted.

## Tech stack

- [React](https://react.dev/) + [Vite](https://vite.dev/) frontend
- [Cloudflare Workers](https://workers.cloudflare.com/) backend
- One SQLite-backed Durable Object per planning room
- Hibernatable WebSockets for live room state

### Production safeguards

- Requests and WebSocket upgrades are restricted to the app origin.
- Room creation, joining, and WebSocket actions are rate-limited.
- HTTP bodies and WebSocket messages are limited to 16 KB.
- Security headers and a restrictive Content Security Policy are applied.
- Room state is schema-versioned and automatically upgraded when loaded.

### Room limits

- 20 people, including the facilitator
- 50 pending items
- 100 completed estimates (older history is pruned)
- 16 cards per deck

## Local development

```bash
npm install
npm run dev
```

The app is available at `http://localhost:5173`.

### Jira import (optional)

The import button only appears when the Worker has both halves of an Atlassian OAuth 2.0 (3LO)
app with the `read:jira-work` scope and `<origin>/api/jira/callback` as a callback URL:

- `JIRA_CLIENT_ID`: a plain var in `wrangler.jsonc`.
- `JIRA_CLIENT_SECRET`: `wrangler secret put JIRA_CLIENT_SECRET` in production, or a line in
  `.dev.vars` locally.

### Verification

```bash
npm run check
```

This runs ESLint, the Vitest unit and authorization tests, and the production build. With a
dev server running on port `4175`, `npm run smoke` runs an end-to-end room smoke test
(set `APP_URL` to target another URL).

### Deployment

Authenticate Wrangler with Cloudflare, then:

```bash
npm run deploy
```

The first deployment creates the `PlanningRoom` Durable Object namespace using the migration
declared in `wrangler.jsonc`.

## AI Disclosure

AI tools were used in the development of this app as code assistants and as bug and
vulnerability scanners. Architecture, product, and privacy decisions are the author's own.

## License

This project is licensed under the [MIT License](LICENSE.md). You are free to use, modify,
and distribute it, including for commercial purposes, as long as you keep the copyright and
license notice.
