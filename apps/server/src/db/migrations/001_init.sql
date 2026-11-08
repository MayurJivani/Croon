create table users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  display_name text not null,
  avatar jsonb not null,
  password_hash text not null,
  recovery_hash text not null,
  created_at timestamptz not null default now()
);
create unique index users_username_lower on users (lower(username));

-- Token digests only: a leaked table hands over no live sessions.
create table sessions (
  id text primary key,
  user_id uuid references users on delete cascade,
  expires_at timestamptz not null
);
create index sessions_expires on sessions (expires_at);

-- Karaoke videos attached to catalogue songs, each verified through YouTube oEmbed when added.
create table song_sources (
  song_key text not null,
  video_id text not null,
  video_title text not null,
  channel text not null,
  label text not null check (label in ('karaoke', 'instrumental', 'original')),
  added_by uuid references users on delete set null,
  created_at timestamptz not null default now(),
  primary key (song_key, video_id)
);

-- LRCLIB lookups, including misses (synced null) so a miss is not re-fetched on every play.
create table lyrics_cache (
  song_key text primary key,
  synced text,
  plain text,
  word_timed boolean not null default false,
  lrclib_id integer,
  fetched_at timestamptz not null default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  owner_id uuid not null references users on delete cascade,
  name text not null,
  description text not null default '',
  rules jsonb not null,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index events_owner on events (owner_id, created_at desc);

-- Score summaries only. Microphone audio is never sent or stored.
create table performances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users on delete cascade,
  guest_name text,
  song_key text not null,
  mode text not null,
  room_code text,
  event_id uuid references events on delete set null,
  kind text not null check (kind in ('full', 'lite')),
  total integer not null,
  pitch integer,
  timing integer not null,
  stability integer not null,
  completion integer not null,
  consistency integer not null,
  seconds integer not null,
  partner_id uuid references users on delete set null,
  created_at timestamptz not null default now()
);
create index performances_song on performances (song_key, total desc);
create index performances_user on performances (user_id, created_at desc);
create index performances_created on performances (created_at);
create index performances_event on performances (event_id, total desc);

-- Every play, scored or not, for trending and popularity.
create table plays (
  song_key text not null,
  played_at timestamptz not null default now()
);
create index plays_at on plays (played_at);

create table favorites (
  user_id uuid not null references users on delete cascade,
  song_key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, song_key)
);

create table playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create table playlist_songs (
  playlist_id uuid not null references playlists on delete cascade,
  song_key text not null,
  position integer not null,
  primary key (playlist_id, song_key)
);

create table follows (
  follower uuid not null references users on delete cascade,
  followee uuid not null references users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);
