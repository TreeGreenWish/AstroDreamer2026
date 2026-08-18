# Hosted Persistence Setup

AstraDream now supports two persistence modes:

- **SQLite**: automatic local fallback for AI Studio/local development.
- **Supabase/Postgres**: selected automatically when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured on the server.

No browser code receives the Supabase service-role key.

## 1. Create a Supabase project

Create a project in Supabase, then open the SQL Editor and run:

`supabase/schema.sql`

This creates:

- `user_profiles`
- `dreams`
- indexes for chronological lookup and tags
- automatic `updated_at` timestamps
- a public `dream-images` Storage bucket

The first hosted version deliberately preserves AstraDream's current single-user behavior. Authentication and per-user ownership should be added before public beta.

## 2. Configure server environment variables

Copy `.env.example` to `.env` for local development or add the same values in your deployment provider:

```bash
GEMINI_API_KEY=...
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

`SUPABASE_SERVICE_ROLE_KEY` is a server secret. Never expose it through Vite-prefixed variables, client code, screenshots, or a public repository.

## 3. Verify the provider

Start the app and open:

`/api/health`

With Supabase configured, the response should contain:

```json
{ "ok": true, "persistence": "supabase" }
```

Without those variables, AstraDream will continue using the local `astradream.db` SQLite file.

## 4. Existing local data

This branch does not automatically upload an existing SQLite database. That is intentional: schema migration and data migration are separate operations so there is no chance of silently damaging the only copy of a dream archive.

Before switching your daily journal to hosted persistence:

1. Back up `astradream.db`.
2. Run and verify the Supabase schema.
3. Export/import existing dreams with a dedicated migration script.
4. Compare dream counts and several full records before treating Supabase as canonical.

A one-time SQLite-to-Supabase importer is the next migration task.

## 5. Generated dream images

When Supabase is active, new base64-generated dream images are uploaded to the `dream-images` Storage bucket. The dream row stores the resulting URL instead of the entire base64 payload.

When SQLite is active, existing behavior is retained.
