-- Songs added beyond the bundled catalogue: imported from Deezer metadata by signed-in users.
create table extra_songs (
  deezer_id text primary key,
  data jsonb not null,
  added_by uuid references users on delete set null,
  created_at timestamptz not null default now()
);
