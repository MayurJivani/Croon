// Next-singer announcement: the stage lights sweep in and settle on whoever is up.
import { motion, useReducedMotion } from 'motion/react';
import type { Participant, SongMeta } from '../../../../packages/core/src/protocol.ts';
import { Avatar } from './ui.tsx';
import { MODES, type ModeId } from '../../../../packages/core/src/modes.ts';

export function Spotlight({ singers, song, mode, big }: { singers: Participant[]; song: SongMeta; mode: ModeId; big?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div className={`spotlight${big ? ' big' : ''}`}>
      {!reduce && <motion.div className="beam" initial={{ rotate: -38, opacity: 0 }} animate={{ rotate: [-38, 30, -12, 0], opacity: [0, 0.9, 0.9, 1] }} transition={{ duration: 2.2, ease: 'easeInOut' }} />}
      <div className="spot-singers">
        {singers.map((p, i) => (
          <motion.div key={p.pid} className="spot-singer" initial={{ scale: 0.4, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ delay: reduce ? 0 : 1.6 + i * 0.2, type: 'spring', stiffness: 260, damping: 16 }}>
            <Avatar a={p.avatar} size={big ? 140 : 72} ring />
            <span className="spot-name">{p.name}</span>
          </motion.div>
        ))}
        {!singers.length && <p className="spot-name">Everyone</p>}
      </div>
      <motion.div className="spot-song" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduce ? 0 : 2.2 }}>
        <b>{song.title}</b>
        <span>{song.artist}{mode !== 'solo' ? ` · ${MODES[mode].name}` : ''}</span>
      </motion.div>
    </div>
  );
}
