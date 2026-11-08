-- A video someone flagged as the wrong song. Kept (not deleted) so auto-find never attaches it again.
alter table song_sources add column rejected boolean not null default false;
