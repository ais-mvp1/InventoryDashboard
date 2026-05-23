# SaaS (Supabase) + Android (Capacitor)

## 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. SQL Editor → paste and run `supabase/migrations/001_saas_inventory.sql`, then `002_fix_org_members_rls.sql` (or re-run 001 if setting up fresh—it includes the RLS fix).
3. Authentication → Providers → enable Email (for MVP turn **off** “Confirm email” under Auth settings while testing, or users will not get a session until they confirm).
4. Project Settings → API → copy **Project URL** and **anon public** key into `.env.local`:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

## 2. Netlify / hosting

Add the same two variables under **Site configuration → Environment variables**. Redeploy after changing them.

## 3. First workshop (tenant)

1. Open the web app with env vars set.
2. **Register** → **Create workshop** on `/setup`.
3. Upload monthly Excel files; data is stored per organization in `data_batches`.
4. **Scan** / **Reconcile** use `scan_events` and merged Excel part codes.

## 4. Android build

From the project root (after `npm run build` at least once):

```
npm run cap:sync
npm run cap:open
```

Android Studio opens the `android` project. Use **Run** on a device or emulator (API 33+ recommended). The WebView loads the same UI as production; point builds at your deployed HTTPS URL or use live reload during development per Capacitor docs.

## 5. Selling to more workshops

Each **Register** + **Create workshop** pair creates a new `organizations` row and isolates data via RLS. Next steps for product: billing (Stripe), org invites, roles, and optional subdomain routing.
