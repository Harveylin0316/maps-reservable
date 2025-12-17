# Supabase Setup (visited restaurants sync)

This app stores each user's "visited restaurant" selections in Supabase.

## 1) Create a Supabase project

- Create a new project in Supabase.
- Copy:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (Server-side only, keep secret)

## 2) Create table

Run this in Supabase SQL Editor:

```sql
create table if not exists public.visited_restaurants (
  user_id text not null,
  place_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);
```

Notes:
- This app uses a **single shared username** as `user_id`.
- Using the Service Role key means we bypass RLS. Keep the key private and only set it in server environments.

## 3) Configure environment variables

Set these in:
- Local: `.env.local`
- Netlify: Site settings → Environment variables

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
APP_USERNAME=...
APP_PASSWORD=...
APP_SESSION_SECRET=...
GOOGLE_MAPS_API_KEY=...
```


