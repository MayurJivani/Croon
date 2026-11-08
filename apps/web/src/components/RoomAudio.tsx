// The speakers of a room. Mounted only on the device that owns playback (the stage screen, or the
// host's own device when no stage is connected). It loads the current track, follows the server
// timeline, and tells the room when it has buffered and when the track ends.
import { useEffect, useMemo, useState } from 'react';
import type { RoomView } from '../../../../packages/core/src/protocol.ts';
import { useEngine, useFollow } from '../lib/playback.ts';
import { roomToken, type Reply } from '../lib/room.ts';
import { HouseEngine, type Engine } from '../audio/engines.ts';

type Props = {
  view: RoomView;
  serverNow: () => number;
  emit: (ev: string, d?: unknown) => Promise<Reply>;
  stage: boolean;
  volume?: number;
  guide?: boolean;
  onEngine?: (e: Engine | null) => void;
  className?: string;
};

export function RoomAudio({ view, serverNow, emit, stage, volume = 1, guide = true, onEngine, className }: Props) {
  const c = view.current;
  const song = c && (view.phase === 'announce' || view.phase === 'playing') ? c.song : null;
  const [videoEl, setVideoEl] = useState<HTMLDivElement | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const src = song?.sources[0];

  // A guest's file lives in the room; fetch it with this device's seat token.
  useEffect(() => {
    setFileUrl(null);
    if (src?.kind !== 'file') return;
    let live = true;
    fetch(`/api/rooms/${view.code}/files/${src.fileId}`, { headers: { 'x-room-token': roomToken(view.code, stage) ?? '' } })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('The file could not be fetched from the room.'))))
      .then((b) => live && setFileUrl(URL.createObjectURL(b)))
      .catch((e) => live && setErr(e.message));
    return () => {
      live = false;
    };
  }, [src?.kind === 'file' ? src.fileId : null, view.code, stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const { engine, duration, error } = useEngine(song, { videoEl, fileUrl, enabled: !!song });
  useEffect(() => onEngine?.(engine), [engine, onEngine]);
  useEffect(() => engine?.setVolume(volume), [engine, volume]);
  useEffect(() => {
    if (engine instanceof HouseEngine) engine.setGuide(guide);
  }, [engine, guide]);

  // Tell the room this device is ready, with the real length of the track.
  const entryId = c?.entryId;
  useEffect(() => {
    if (engine && entryId && view.phase === 'announce') void emit('stageReady', { entryId, duration: duration || undefined });
  }, [engine, entryId, view.phase, duration, emit]);
  useEffect(() => {
    if (!engine || !entryId) return;
    engine.onEnded = () => void emit('stageEnded', { entryId });
  }, [engine, entryId, emit]);

  const timeline = useMemo(() => (view.phase === 'playing' ? c?.timeline ?? null : null), [view.phase, c?.timeline]);
  useFollow(engine, timeline, serverNow, view.phase === 'playing');
  useEffect(() => {
    if (view.phase !== 'playing' && engine?.playing()) engine.pause();
  }, [view.phase, engine]);

  return (
    <>
      {src?.kind === 'youtube' && <div className={`video-wrap ${className ?? ''}`} ref={setVideoEl} />}
      {(error || err) && <p className="toast toast-error" role="alert">{error ?? err}</p>}
    </>
  );
}
