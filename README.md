# DraftOptimizer

[Link to App](https://draft-optimizer.vercel.app/)

DraftOptimizer is a fantasy baseball auction draft workspace for running a full shadow draft:

- League setup and team management
- Player pool seeding/import
- Keeper entry and finalization
- Live main draft tracking with budget + roster constraints
- Taxi round (free bench picks)
- Post-draft analysis and CSV exports

This repository contains both apps:

- `/` (repository root): Next.js 16 web client
- `/backend`: Express + MongoDB API

## Tech Stack

- Frontend: Next.js 16 (App Router), React 18, TypeScript, TailwindCSS
- Backend: Express, Mongoose, JWT auth (HTTP-only cookies)
- Database: MongoDB
- Tests: Playwright (E2E), Node test runner (backend unit tests)

## Repository Layout

```text
.
├── backend/
│   ├── models/
│   ├── routes/
│   ├── utils/
│   └── tests/
├── src/
│   ├── app/
│   ├── api/
│   ├── components/
│   └── context/
└── tests/e2e/
```

## Prerequisites

- Node.js 20+
- npm 10+
- A MongoDB instance (local or Atlas)

## Local Setup

1. Install dependencies.

```bash
npm install
npm --prefix backend install
```

2. Configure backend env.

```bash
cp backend/.env.example backend/.env
```

Required backend env values in `backend/.env`:

- `ACCESS_TOKEN_SECRET` (long random string)
- `REFRESH_TOKEN_SECRET` (long random string)
- `MONGODB_URI` (MongoDB connection string)
- `NODE_ENV=development`
- `PORT=5001`
- Optional: `CORS_ORIGIN=http://localhost:3000`

3. Configure frontend env.

```bash
cp .env.local.example .env.local
```

Set in `.env.local`:

- `NEXT_PUBLIC_API_URL=http://localhost:5001/api`

4. Start both servers (two terminals).

Terminal 1:

```bash
npm --prefix backend run dev
```

Terminal 2:

```bash
npm run dev
```

5. Open the app.

- Frontend: `http://localhost:3000`
- API health check: `http://localhost:5001/api/health`

## Product Workflow (Onboarding)

1. Register and sign in.
2. Create a league from Dashboard.
3. Configure league basics: name, budget, main roster slot counts (`C`, `1B`, `2B`, `3B`, `SS`, `OF`, `UTIL`, `P`), bench slots, and scoring categories.
4. Configure teams and player pool: add teams, mark one as "My Team", load sample players (165), or upload a `.csv`/`.tsv`/`.txt` player file.
5. Optionally clear the undrafted player pool (only before any keeper/draft activity).
6. Enter keepers: select player + team + cost, undo last keeper if needed, then finalize keepers to lock edits.
7. Run main draft: select player + team + bid; bid guards enforce legal max bids and open-position eligibility; undo last pick is supported.
8. Start taxi round once every team's main roster is full; taxi picks are free and fill bench slots.
9. Open post-draft analysis once taxi round is complete for all teams; export your roster, all rosters, and full draft log; review matchup projections and strengths/weaknesses.

## Player Import Notes

- Accepted file types: `.csv`, `.tsv`, `.txt`
- Header aliases are supported for common names (for example `name`, `team`, `positions`, `projectedValue`, `adp`)
- Additional columns are imported into the player `projections` map
- Duplicate players (by normalized `name + mlbTeam`) are skipped
- Max rows per import request: `3000`

## Scripts

Frontend:

- `npm run dev` - start Next.js dev server
- `npm run build` - production build
- `npm run start` - run built frontend
- `npm run lint` - type generation + TypeScript check
- `npm run typecheck` - same as lint type check path
- `npm run test:e2e` - Playwright tests

Backend:

- `npm --prefix backend run dev` - start API with nodemon
- `npm --prefix backend start` - start API
- `npm --prefix backend test` - run backend unit tests
- `npm --prefix backend run test:coverage` - backend coverage run

## Testing

Run backend tests:

```bash
npm --prefix backend test
```

Run frontend type/build checks:

```bash
npm run lint
npm run build
```

Run Playwright E2E tests (requires running app services first):

```bash
npm run test:e2e
```

## API Surface (High-Level)

- `/api/auth/*` - register, login, logout, refresh, password reset/change
- `/api/leagues/*` - CRUD, seed players, clear player pool
- `/api/teams/*` - team CRUD and roster fetch
- `/api/players/*` - list/filter, add custom, import
- `/api/draft/*` - bid, keeper, undo, position swap, history, taxi round, exports, post-analysis
- `/api/news` - draft news feed

## Notes for Production

- Auth uses cookie-based JWTs (`httpOnly`).
- Current cookie policy is strict same-site. If frontend and backend are on different sites/domains, adjust cookie settings accordingly before production rollout.
