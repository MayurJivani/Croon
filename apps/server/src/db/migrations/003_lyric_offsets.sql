-- Seconds to shift LRCLIB's lyrics (timed to the original recording) so they land on this video's
-- edit. Set once by whoever syncs a song; every later play and room starts from it.
alter table song_sources add column lyric_offset real;
