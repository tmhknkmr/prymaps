-- PRY Database Schema

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles (extends Supabase Auth users)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text unique,
  display_name text,
  avatar_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Archives (one per user, top-level container)
create table if not exists public.archives (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null unique,
  name text not null default 'My Archive',
  description text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Layers (photo grouping within an archive)
create table if not exists public.layers (
  id uuid default uuid_generate_v4() primary key,
  archive_id uuid references public.archives(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  description text,
  color text not null default '#3B82F6',
  is_public boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Photos
create table if not exists public.photos (
  id uuid default uuid_generate_v4() primary key,
  layer_id uuid references public.layers(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  storage_path text not null,
  filename text not null,
  title text,
  description text,
  lat double precision,
  lng double precision,
  taken_at timestamptz,
  is_public boolean not null default false,
  width integer,
  height integer,
  file_size integer,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Map view settings (per user)
create table if not exists public.map_view_settings (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null unique,
  center_lat double precision not null default 35.6812,
  center_lng double precision not null default 139.7671,
  zoom integer not null default 12,
  hidden_user_ids uuid[] not null default '{}',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- RLS Policies

alter table public.profiles enable row level security;
alter table public.archives enable row level security;
alter table public.layers enable row level security;
alter table public.photos enable row level security;
alter table public.map_view_settings enable row level security;

-- Profiles policies
drop policy if exists "Profiles are viewable by everyone" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Profiles are viewable by everyone" on public.profiles
  for select using (true);
create policy "Users can insert their own profile" on public.profiles
  for insert with check (auth.uid() = id);
create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id);

-- Archives policies
drop policy if exists "Public archives are viewable by everyone" on public.archives;
drop policy if exists "Users can manage their own archive" on public.archives;
create policy "Public archives are viewable by everyone" on public.archives
  for select using (true);
create policy "Users can manage their own archive" on public.archives
  for all using (auth.uid() = user_id);

-- Layers policies
drop policy if exists "Public layers are viewable by everyone" on public.layers;
drop policy if exists "Users can manage their own layers" on public.layers;
create policy "Public layers are viewable by everyone" on public.layers
  for select using (is_public = true or auth.uid() = user_id);
create policy "Users can manage their own layers" on public.layers
  for all using (auth.uid() = user_id);

-- Photos policies
drop policy if exists "Public photos in public layers are viewable" on public.photos;
drop policy if exists "Users can manage their own photos" on public.photos;
create policy "Public photos in public layers are viewable" on public.photos
  for select using (
    auth.uid() = user_id
    or (
      is_public = true
      and exists (
        select 1 from public.layers l
        where l.id = layer_id and l.is_public = true
      )
    )
  );
create policy "Users can manage their own photos" on public.photos
  for all using (auth.uid() = user_id);

-- Map view settings policies
drop policy if exists "Users can manage their own map settings" on public.map_view_settings;
create policy "Users can manage their own map settings" on public.map_view_settings
  for all using (auth.uid() = user_id);

-- Functions

-- Auto-create profile and archive on user signup
create or replace function public.handle_new_user()
returns trigger as $$
declare
  new_profile_id uuid;
  new_archive_id uuid;
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.archives (user_id, name)
  values (new.id, 'My Archive')
  on conflict (user_id) do nothing;

  insert into public.map_view_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$ language plpgsql security definer;

-- Trigger on auth.users insert
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Updated_at trigger function
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_updated_at on public.profiles;
drop trigger if exists archives_updated_at on public.archives;
drop trigger if exists layers_updated_at on public.layers;
drop trigger if exists photos_updated_at on public.photos;
drop trigger if exists map_view_settings_updated_at on public.map_view_settings;
create trigger profiles_updated_at before update on public.profiles
  for each row execute procedure public.handle_updated_at();
create trigger archives_updated_at before update on public.archives
  for each row execute procedure public.handle_updated_at();
create trigger layers_updated_at before update on public.layers
  for each row execute procedure public.handle_updated_at();
create trigger photos_updated_at before update on public.photos
  for each row execute procedure public.handle_updated_at();
create trigger map_view_settings_updated_at before update on public.map_view_settings
  for each row execute procedure public.handle_updated_at();

-- Storage bucket for photos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/webp', 'image/jpeg', 'image/png', 'image/gif'])
on conflict (id) do nothing;

-- Storage policies
drop policy if exists "Public photos are viewable by everyone" on storage.objects;
drop policy if exists "Authenticated users can upload photos" on storage.objects;
drop policy if exists "Users can update their own photos" on storage.objects;
drop policy if exists "Users can delete their own photos" on storage.objects;
create policy "Public photos are viewable by everyone" on storage.objects
  for select using (bucket_id = 'photos');
create policy "Authenticated users can upload photos" on storage.objects
  for insert with check (bucket_id = 'photos' and auth.role() = 'authenticated');
create policy "Users can update their own photos" on storage.objects
  for update using (bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Users can delete their own photos" on storage.objects
  for delete using (bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1]);
