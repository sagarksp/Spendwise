# Spendwise

Spendwise is a private, offline-first expense tracker. Amounts are stored as integer paise to avoid floating-point currency errors.

## Current state

The app is a React 19 + TypeScript single-page application built with Vite. Expenses, quick adds, limits, and preferences live in browser IndexedDB (`spendwise-local`). An installable Progressive Web App (PWA) shell is available for Android browsers and caches the app shell for offline launches.

The frontend includes optional Google sign-in and cloud-sync calls, but this checkout has no `server/` directory. The Express/MySQL API, migrations, authentication endpoints, and cloud backup are intended design only until the backend is implemented. There is no native Android/Capacitor project, Android SDK, or signed APK in this workspace.

## Features

- Add, edit, and remove expenses with date, category, need/want type, and optional note.
- Suggest categories from item names and save frequent entries as quick adds.
- Browse and filter history; see weekly reports by category, day, and need/want.
- Set weekly, monthly, and annual spending limits.
- Keep a local ledger without an account or network connection.
- Install on Android from Chrome as a PWA and cache the shell for offline launches.

## Architecture

```text
React UI (src/App.tsx)
  ├── Domain rules and INR/date helpers (src/domain.ts)
  ├── IndexedDB local-first persistence (src/storage.ts)
  └── Optional HTTP client (src/api.ts) → /v1 API (not included)

Vite build → static PWA shell (dist/)
  ├── Manifest (public/manifest.webmanifest)
  └── Service worker caches shell and versioned assets (public/sw.js)
```

Local writes are primary. Records carry `baseVersion`, `version`, `updatedAt`, and `syncState` fields for future version-aware sync. Deletions use `deleted` tombstones. The client sends pending records and a cursor to `POST /v1/sync`; a server must authenticate users, validate and resolve versions, persist changes, and return updates and a cursor. Client sync metadata does not replace server authorization or validation.

### Data model and flows

- `Expense`: item name, integer `amountPaise`, category, need/want tag, local date, optional note, sync fields, tombstone.
- `QuickAdd`: default amount/category/tag and pin/use metadata.
- `SpendingLimit`: week/month/year period, amount in paise, active state.
- `Settings`: week start, language, reminder preferences. A daily reminder can appear at the selected time while Spendwise is open, if notifications are allowed.

`src/main.tsx` mounts React and registers the service worker in production. `src/App.tsx` renders screens and coordinates state. `src/domain.ts` contains category matching, dates, totals, and limit rules. `src/storage.ts` wraps IndexedDB. `src/api.ts` handles token requests, refresh, Google sign-in exchange, and sync. API base defaults to `/v1`; Vite proxies it to `localhost:4000` during development.

## Requirements

- Node.js 20.19+ or 22.12+ (required by Vite 7; Node 24 also works).
- npm or pnpm (a `pnpm-lock.yaml` is included).
- A modern browser with IndexedDB; Chrome or another PWA-capable browser for Android.
- Optional backup requires an implemented/deployed API, MySQL, Google Identity Services credentials, and production HTTPS.

## Run locally

```sh
npm install
npm run dev:web
```

Open `http://localhost:5173`. Local tracking needs no `.env`. The combined `npm run dev` also starts `npm run dev:api`, configured for `server/index.ts`; that directory is absent, so the combined command and cloud backup do not work yet.

Copy `.env.example` to `.env` only when configuring API/sign-in:

| Variable | Used by | Purpose |
| --- | --- | --- |
| `PORT` | API | Intended API port (4000). |
| `DATABASE_URL` | API | MySQL connection string. |
| `JWT_SECRET` | API | Token-signing secret; use a strong secret. |
| `GOOGLE_CLIENT_ID` | API | Google ID-token validation audience. |
| `WEB_ORIGIN` | API | Browser origin allowed by CORS. |
| `VITE_GOOGLE_CLIENT_ID` | Web | Enables Google Identity Services button. |
| `VITE_API_URL` | Web | API base URL; defaults to `/v1`. |

Vite exposes `VITE_` variables to browser code. Never place database credentials or signing secrets there.

## Build and preview

```sh
npm run build
npm run preview
```

The build type-checks and writes the app to `dist/`. Serve over HTTPS for Android installation and configure the host to return `index.html` for app routes. Set `VITE_API_URL` at build time if the API is not same-origin.

## Install on Android

1. Deploy to an HTTPS URL.
2. Open it in Chrome on Android.
3. Choose **Install app** or **Add to Home screen** from Chrome's menu.
4. Launch Spendwise from the home screen. Local data stays on that device; clearing browser/app data removes it.

For a responsive check on the same Wi-Fi, run `npm run dev:web -- --host 0.0.0.0` and open `http://<computer-LAN-IP>:5173` on the phone. Plain LAN HTTP permits a layout check; service-worker installation requires HTTPS or localhost.

### APK status

This workspace has no Android Studio, Java, Android SDK, Capacitor project, or Gradle wrapper. The Android deliverable is an installable PWA, not a native APK/AAB. A native wrapper needs Android build tools and validation of storage, navigation, and app origin.

## Project structure

```text
src/App.tsx          UI and app state
src/api.ts           Optional auth and sync client
src/domain.ts        Categories, currency, dates, totals, limits
src/storage.ts       IndexedDB persistence
src/styles.css       Responsive UI
src/types.ts         Domain and API types
public/manifest.webmanifest   Install metadata
public/sw.js                  Offline shell and asset cache
public/icons/                 App icon
docs/                          Product, architecture, API, database PDFs
```

PDFs in `docs/` are design inputs. Capabilities absent from source, especially API/server behavior, are planned design rather than shipped functionality.

## Review notes and next decisions

- The referenced API is absent. Before backup, implement/review auth, schema/migrations, conflict handling, and export/deletion.
- Google sign-in needs real client IDs, allowed origins, and the missing token-verification endpoint.
- Reminder fields are preferences only; notifications are not scheduled.
- A language preference exists, while visible UI copy is English.
- Daily reminders use an in-page timer. Browsers may suspend timers, and a reminder cannot fire after the app is closed; reliable closed-app delivery requires server push or a native Android scheduled alarm.
- Decide whether Android support means browser-installed PWA or a Play Store/native package.

## Change history

See [CHANGELOG.md](CHANGELOG.md) for dated project changes and follow-up items.

