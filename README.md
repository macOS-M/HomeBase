# HomeBase 🏠

Shared household budget management for couples, roommates, and families.
Built as a **monorepo** — one codebase for web (Next.js) and mobile (Expo).

---

## Stack

| Layer | Technology |
|---|---|
| Monorepo | Turborepo + pnpm workspaces |
| Web | Next.js 14 (App Router) + Tailwind CSS |
| Mobile | Expo (React Native) + NativeWind |
| State | Zustand |
| Data fetching | TanStack React Query |
| Backend | Supabase (Postgres + Auth + Realtime) |
| Language | TypeScript throughout |

---

## Monorepo Structure

```
homebase/
├── apps/
│   ├── web/               # Next.js web app
│   └── mobile/            # Expo iOS + Android app
├── packages/
│   ├── types/             # Shared TypeScript types
│   ├── utils/             # Business logic (settlements, splits, formatters)
│   ├── store/             # Zustand stores (shared state)
│   └── api/               # React Query hooks (shared data fetching)
└── supabase/
    └── schema.sql         # Full database schema + RLS policies
```

**~65% of code is shared** between web and mobile via the `packages/` layer.

---

## Prerequisites

- Node.js 20+
- pnpm 9+ → `npm install -g pnpm`
- A free [Supabase](https://supabase.com) account
- For mobile: Xcode (iOS) or Android Studio

---

## Setup

### 1. Clone and install

```bash
git clone <your-repo>
cd homebase
pnpm install
```

### 2. Create your Supabase project

1. Go to [supabase.com](https://supabase.com) → New project
2. Note your **Project URL** and **anon public key** from Settings → API

### 3. Run the database schema

1. In your Supabase dashboard → SQL Editor
2. Paste the contents of `supabase/schema.sql` and run it
3. This creates all tables, RLS policies, and helper functions

### 4. Enable Auth providers in Supabase

1. Go to Authentication → Providers
2. Enable **Email** (magic links are on by default)
3. Enable **Google** (requires a Google Cloud OAuth app — follow Supabase docs)

### 5. Configure environment variables

**Web app:**
```bash
cp apps/web/.env.example apps/web/.env.local
```
Fill in your Supabase URL and anon key.

**Mobile app:**
```bash
cp apps/mobile/.env.example apps/mobile/.env.local
```
Fill in the same values (note: Expo uses `EXPO_PUBLIC_` prefix).

### 6. Run the apps

**Web only:**
```bash
pnpm dev:web
# → http://localhost:3000
```

**Mobile only:**
```bash
pnpm dev:mobile
# Then press i (iOS) or a (Android) in the terminal
```

**Both simultaneously:**
```bash
pnpm dev
```

---

## First Run

1. Open the web app → click **Join a household**
2. Choose **Create a household** — enter a name and your name
3. You'll land on the dashboard with default categories seeded
4. Copy your **invite code** (shown in the sidebar) and share it with housemates
5. Housemates visit the app → **Join with invite code**

---

## Key Features

### Smart Settlements
The app uses a greedy debt-minimisation algorithm (`packages/utils/src/index.ts → calculateSmartSettlements`) to find the minimum number of payments needed to settle all balances between household members.

Example: 4 members with 8 debts between them → resolved with just 3 payments.

### Realtime Updates
Supabase Realtime is enabled on `expenses`, `bills`, `expense_splits`, and `wallet_transactions`. When one member adds an expense, all other members see it instantly — no refresh needed.

### Row Level Security
Every table has RLS policies ensuring users can only read/write data belonging to their own household. The policies are defined in `supabase/schema.sql`.

### Shared Business Logic
All split calculations, balance aggregation, and formatting live in `@homebase/utils` — a pure TypeScript package with zero platform dependencies. This logic runs identically on web and mobile.

---

## Adding a New Feature

1. **Define types** in `packages/types/src/index.ts`
2. **Add DB table** to `supabase/schema.sql` with RLS policy
3. **Add React Query hooks** in `packages/api/src/index.ts`
4. **Build web UI** in `apps/web/`
5. **Build mobile UI** in `apps/mobile/`

Both apps share the same hooks and types automatically.

---

## Deployment

### Web (Vercel — recommended)

```bash
# Connect your GitHub repo to Vercel
# Set environment variables in Vercel dashboard:
# NEXT_PUBLIC_SUPABASE_URL
# NEXT_PUBLIC_SUPABASE_ANON_KEY

# Vercel auto-detects Next.js — no config needed
```

### Mobile (Expo EAS)

```bash
npm install -g eas-cli
eas login
cd apps/mobile
eas build --platform all    # builds iOS + Android
eas submit                  # submits to App Store + Play Store
```

---

## Scripts Reference

| Command | Description |
|---|---|
| `pnpm dev` | Run web + mobile dev servers |
| `pnpm dev:web` | Run web only |
| `pnpm dev:mobile` | Run mobile only |
| `pnpm build` | Build all apps |
| `pnpm type-check` | TypeScript check across all packages |
| `pnpm lint` | Lint all apps |

---

## Roadmap Ideas

- [ ] Push notifications for bill due dates (Expo Notifications)
- [ ] Receipt photo OCR (extract amount automatically)
- [ ] Monthly spending reports / PDF export
- [ ] Bank account sync (Plaid integration)
- [ ] Multi-currency support
- [ ] Dark mode
