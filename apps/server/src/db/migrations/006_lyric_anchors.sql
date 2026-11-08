-- Sync points replace the single offset: [lyric time, video time] pairs (packages/core/src/lyrics.ts).
-- An existing offset becomes one point at the start, which means exactly the same thing.
alter table song_sources add column lyric_anchors jsonb;
update song_sources set lyric_anchors = jsonb_build_array(jsonb_build_array(0, lyric_offset)) where lyric_offset is not null;
alter table song_sources drop column lyric_offset;
