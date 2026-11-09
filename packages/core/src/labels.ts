// Display constants shared by server and browser, kept free of zod so the browser bundle stays small.

export const SOURCE_LABEL = {
  house: 'House band arrangement',
  karaoke: 'Karaoke video',
  instrumental: 'Instrumental video',
  original: 'Original recording (vocals included)',
  file: 'Your file',
} as const;

export type RoomSettings = {
  scoring: boolean;
  maxPerPerson: number;
  guestsCanQueue: boolean;
  skipRatio: number;
  autoAdvance: boolean;
  /** Lyrics drawn on the stage beside a karaoke video (they can never cover the video). */
  stageLyricsWithVideo: boolean;
  /** Where the track plays: only the stage (or the host's device without one), or on every phone in step with it. */
  audioOut: 'stage' | 'all';
  /** The host sings like everyone else, or the host's device is only the screen and the controls. */
  hostRole: 'singer' | 'screen';
};

export const DEFAULT_SETTINGS: RoomSettings = { scoring: true, maxPerPerson: 3, guestsCanQueue: true, skipRatio: 0.6, autoAdvance: false, stageLyricsWithVideo: true, audioOut: 'stage', hostRole: 'singer' };

/** Avatar glyphs are names of drawn icons (the web maps them to its icon set), never emoji. */
export const AVATAR_GLYPHS = ['mic', 'music', 'star', 'heart', 'moon', 'sun', 'zap', 'flame', 'crown', 'guitar', 'drum', 'headphones'] as const;
export const AVATAR_COLORS = ['#ff4f2e', '#ffc23d', '#2ec4b6', '#b388eb', '#ff8fab', '#7bd389', '#4cc9f0', '#f2e8dc'];
