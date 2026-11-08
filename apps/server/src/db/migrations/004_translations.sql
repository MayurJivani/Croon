-- English translations of synced lyrics, one row per song and language, made once and reused by everyone.
create table lyric_translations (
  song_key text not null,
  lang text not null,
  lines jsonb not null,
  provider text not null,
  created_at timestamptz not null default now(),
  primary key (song_key, lang)
);
