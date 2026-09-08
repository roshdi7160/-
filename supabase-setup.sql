-- ============================================================
--  حلم وهدف — Supabase setup
--  Run this once: Supabase dashboard → SQL Editor → New query
--  → paste all of this → Run.
-- ============================================================

-- ---------- 1. the page content row ----------
create table if not exists public.site_content (
  id         bigint primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.site_content (id, data)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

alter table public.site_content enable row level security;

-- visitors may read the page content
drop policy if exists "public read" on public.site_content;
create policy "public read" on public.site_content
  for select to anon, authenticated using (true);

-- only a signed-in manager may change it
drop policy if exists "manager write" on public.site_content;
create policy "manager write" on public.site_content
  for update to authenticated using (true) with check (true);


-- ---------- 2. image storage ----------
-- Images live in Storage, not in the row above. That keeps the JSON every
-- visitor downloads at ~10KB instead of megabytes of base64, and lets the
-- CDN and the browser cache the photos.
insert into storage.buckets (id, name, public)
values ('site-images', 'site-images', true)
on conflict (id) do nothing;

-- anyone may view the photos
drop policy if exists "public view images" on storage.objects;
create policy "public view images" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'site-images');

-- only a signed-in manager may add / replace / remove them
drop policy if exists "manager upload images" on storage.objects;
create policy "manager upload images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-images');

drop policy if exists "manager update images" on storage.objects;
create policy "manager update images" on storage.objects
  for update to authenticated
  using (bucket_id = 'site-images');

drop policy if exists "manager delete images" on storage.objects;
create policy "manager delete images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'site-images');


-- ---------- 3. check it worked ----------
select
  (select count(*) from public.site_content where id = 1)               as content_row,
  (select count(*) from storage.buckets where id = 'site-images')       as bucket,
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'site_content')        as content_policies;
-- expect: content_row = 1, bucket = 1, content_policies = 2
