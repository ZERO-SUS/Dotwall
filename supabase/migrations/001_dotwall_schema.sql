-- ============================================================================
-- DOTWALL — COMPLETE SUPABASE POSTGRESQL SCHEMA, RLS & SERVER-SIDE FUNCTIONS
-- Global 1000 x 1000 (1,000,000 pixel) Collaborative Multiplayer Canvas
-- ============================================================================

create extension if not exists "pgcrypto";

-- 1. PROFILES & COOLDOWNS
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) between 2 and 24),
  display_name text not null default '',
  avatar_color text not null default '#6B3DFF',
  avatar_emoji text not null default '👾',
  bio text not null default 'Placing pixels on the global wall.',
  pixels_placed integer not null default 0 check (pixels_placed >= 0),
  tasks_completed integer not null default 0 check (tasks_completed >= 0),
  points integer not null default 0 check (points >= 0),
  last_pixel_at timestamptz,
  next_cooldown_at timestamptz,
  last_comment_at timestamptz,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. GLOBAL CANVAS PIXELS (1000 x 1000 = 1,000,000 max occupied slots)
create table if not exists public.global_pixels (
  x smallint not null check (x >= 0 and x < 1000),
  y smallint not null check (y >= 0 and y < 1000),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  owner_username text not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (x, y)
);

create index if not exists idx_global_pixels_updated_at on public.global_pixels(updated_at desc);
create index if not exists idx_global_pixels_owner on public.global_pixels(owner_id);

-- 3. PIXEL PLACEMENT HISTORY (For server-validated Undo/Redo & Live Feed)
create table if not exists public.pixel_history (
  id uuid primary key default gen_random_uuid(),
  x smallint not null check (x >= 0 and x < 1000),
  y smallint not null check (y >= 0 and y < 1000),
  prev_color text,
  prev_owner_id uuid,
  prev_owner_username text,
  new_color text,
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text not null,
  action_type text not null check (action_type in ('place', 'replace', 'erase', 'undo', 'redo')),
  pixel_version bigint not null,
  undone boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_pixel_history_user on public.pixel_history(user_id, created_at desc);
create index if not exists idx_pixel_history_created on public.pixel_history(created_at desc);

-- 4. PIXEL TASKS (Daily & Random Drawing Challenges)
create table if not exists public.tasks (
  id text primary key,
  title text not null,
  description text not null,
  difficulty text not null check (difficulty in ('Easy', 'Medium', 'Hard')),
  category text not null,
  reward_points integer not null default 50,
  grid_size smallint not null default 16,
  is_daily boolean not null default false,
  reference_pixels jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- 5. TASK SUBMISSIONS
create table if not exists public.task_submissions (
  id uuid primary key default gen_random_uuid(),
  task_id text not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text not null,
  grid_size smallint not null default 16,
  pixels jsonb not null,
  accuracy_score smallint not null default 100,
  points_awarded integer not null default 50,
  created_at timestamptz not null default now()
);

-- 6. COMMUNITY ARTWORKS (Explore & Submissions)
create table if not exists public.artworks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '',
  category text not null default 'Pixel Art',
  grid_size smallint not null default 16,
  pixels jsonb not null,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  creator_username text not null,
  creator_avatar text not null default '👾',
  creator_color text not null default '#6B3DFF',
  task_id text references public.tasks(id) on delete set null,
  likes_count integer not null default 0,
  comments_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_artworks_created on public.artworks(created_at desc);
create index if not exists idx_artworks_likes on public.artworks(likes_count desc);

-- 7. ARTWORK LIKES
create table if not exists public.artwork_likes (
  artwork_id uuid not null references public.artworks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (artwork_id, user_id)
);

-- 8. COMMUNITY COMMENTS & MODERATION
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid references public.artworks(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text not null,
  avatar_emoji text not null default '👾',
  avatar_color text not null default '#6B3DFF',
  content text not null check (char_length(content) between 1 and 500),
  reported boolean not null default false,
  report_reason text,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

-- 9. USER ACHIEVEMENTS
create table if not exists public.user_achievements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

-- 10. PLAYER PRESENCE
create table if not exists public.player_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  username text not null,
  avatar_emoji text not null default '👾',
  active_view text not null default 'home',
  last_seen_at timestamptz not null default now()
);

-- ============================================================================
-- SERVER-SIDE VALIDATION FUNCTIONS (PL/pgSQL)
-- Never trust frontend values for cooldowns, capacity, ownership, or points!
-- ============================================================================

create or replace function public.place_global_pixel(
  p_x smallint,
  p_y smallint,
  p_color text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_existing public.global_pixels%rowtype;
  v_occupied_count integer;
  v_is_replacement boolean := false;
  v_new_version bigint := 1;
  v_now timestamptz := now();
  v_next_cooldown timestamptz := v_now + interval '30 seconds';
begin
  if v_user_id is null then
    raise exception 'Authentication required to place pixels.';
  end if;

  if p_x < 0 or p_x >= 1000 or p_y < 0 or p_y >= 1000 then
    raise exception 'Coordinates out of 1000x1000 bounds.';
  end if;

  if p_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Invalid HEX color format.';
  end if;

  select * into v_profile from public.profiles where id = v_user_id for update;
  if not found then
    raise exception 'Player profile not found.';
  end if;

  -- Enforce 30-second server-side cooldown
  if v_profile.next_cooldown_at is not null and v_profile.next_cooldown_at > v_now then
    raise exception 'Cooldown active. Wait % seconds.', ceil(extract(epoch from (v_profile.next_cooldown_at - v_now)));
  end if;

  select * into v_existing from public.global_pixels where x = p_x and y = p_y for update;

  if found then
    v_is_replacement := true;
    v_new_version := v_existing.version + 1;
  else
    select count(*) into v_occupied_count from public.global_pixels;
    if v_occupied_count >= 1000000 then
      raise exception 'Global 1,000,000 pixel capacity reached!';
    end if;
  end if;

  insert into public.global_pixels (x, y, color, owner_id, owner_username, version, updated_at)
  values (p_x, p_y, upper(p_color), v_user_id, v_profile.username, v_new_version, v_now)
  on conflict (x, y) do update set
    color = excluded.color,
    owner_id = excluded.owner_id,
    owner_username = excluded.owner_username,
    version = excluded.version,
    updated_at = excluded.updated_at;

  insert into public.pixel_history (
    x, y, prev_color, prev_owner_id, prev_owner_username,
    new_color, user_id, username, action_type, pixel_version, created_at
  ) values (
    p_x, p_y,
    v_existing.color, v_existing.owner_id, v_existing.owner_username,
    upper(p_color), v_user_id, v_profile.username,
    case when v_is_replacement then 'replace' else 'place' end,
    v_new_version, v_now
  );

  update public.profiles
  set
    pixels_placed = pixels_placed + 1,
    points = points + 10,
    last_pixel_at = v_now,
    next_cooldown_at = v_next_cooldown,
    updated_at = v_now
  where id = v_user_id;

  return jsonb_build_object(
    'ok', true,
    'x', p_x,
    'y', p_y,
    'color', upper(p_color),
    'next_cooldown_at', v_next_cooldown,
    'is_replacement', v_is_replacement
  );
end;
$$;

-- Server-side Undo validation: only allows undoing own placement if not overwritten by another player
create or replace function public.undo_global_pixel()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id uuid := auth.uid();
  v_last_hist public.pixel_history%rowtype;
  v_current_pixel public.global_pixels%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_last_hist
  from public.pixel_history
  where user_id = v_user_id
    and undone = false
    and action_type in ('place', 'replace')
  order by created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'No eligible placement found to undo.';
  end if;

  select * into v_current_pixel
  from public.global_pixels
  where x = v_last_hist.x and y = v_last_hist.y
  for update;

  if not found or v_current_pixel.owner_id <> v_user_id or v_current_pixel.version <> v_last_hist.pixel_version then
    raise exception 'Cannot undo: another player has modified this pixel since your placement.';
  end if;

  if v_last_hist.prev_color is null then
    delete from public.global_pixels where x = v_last_hist.x and y = v_last_hist.y;
  else
    update public.global_pixels
    set
      color = v_last_hist.prev_color,
      owner_id = v_last_hist.prev_owner_id,
      owner_username = v_last_hist.prev_owner_username,
      version = v_current_pixel.version + 1,
      updated_at = now()
    where x = v_last_hist.x and y = v_last_hist.y;
  end if;

  update public.pixel_history set undone = true where id = v_last_hist.id;

  return jsonb_build_object(
    'ok', true,
    'x', v_last_hist.x,
    'y', v_last_hist.y,
    'restored_color', v_last_hist.prev_color
  );
end;
$$;

-- Enable Row Level Security
alter table public.profiles enable row level security;
alter table public.global_pixels enable row level security;
alter table public.pixel_history enable row level security;
alter table public.tasks enable row level security;
alter table public.task_submissions enable row level security;
alter table public.artworks enable row level security;
alter table public.artwork_likes enable row level security;
alter table public.comments enable row level security;
alter table public.user_achievements enable row level security;
alter table public.player_presence enable row level security;

-- Public read access for shared multiplayer state
create policy "Public read profiles" on public.profiles for select using (true);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id);

create policy "Public read global_pixels" on public.global_pixels for select using (true);
create policy "Public read pixel_history" on public.pixel_history for select using (true);
create policy "Public read tasks" on public.tasks for select using (true);
create policy "Public read artworks" on public.artworks for select using (true);
create policy "Public read likes" on public.artwork_likes for select using (true);
create policy "Public read visible comments" on public.comments for select using (hidden = false);
create policy "Public read achievements" on public.user_achievements for select using (true);
create policy "Public read presence" on public.player_presence for select using (true);
