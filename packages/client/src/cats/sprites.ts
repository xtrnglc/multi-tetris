import type { CatName, Pose } from './types';

/** 16 rows of 16 characters; '.' is transparent, every other letter is a palette colour. */
export type Grid = readonly string[];
export type Palette = Readonly<Record<string, string>>;

export const SPRITE_SIZE = 16;

const EMPTY = '................';

function variant(base: Grid, rows: Record<number, string>): Grid {
  return base.map((row, i) => rows[i] ?? row);
}

function padTop(count: number, rows: Grid): Grid {
  return [...Array<string>(count).fill(EMPTY), ...rows];
}

// Letters: O outline, B body, W chest/paws, E eyes, N nose/mouth, P inner ear,
// S tabby stripes, F face mask and ear tips.

const SIT: Grid = [
  '...O......O.....',
  '..OFO....OFO....',
  '..OPBOOOOBPO....',
  '..OBSBSBSBBO....',
  '.OBBBSBSBBBBO...',
  '.OBFEBBBBEFBO...',
  '.OBBFFNNFFBBO...',
  '.OBBBWWWWBBBO...',
  '..OBBWWWWBBO....',
  '..OBBBWWBBBO....',
  '.OSBBBWWBBBSO...',
  '.OBSBBWWBBSBO.O.',
  '.OSBBBBBBBBSOOBO',
  '.OBBBBBBBBBBOBO.',
  '.OWWBBBBBBWWBO..',
  '..OOOOOOOOOOO...',
];
const EYES_SHUT = '.OBFOBBBBOFBO...';
const SIT_BLINK = variant(SIT, { 5: EYES_SHUT });
const YAWN = variant(SIT, { 5: EYES_SHUT, 7: '.OBBBNNNNBBBO...' });
const FLINCH = variant(padTop(3, ['.OFOBSBSBSOFO...', ...SIT.slice(4)]), { 5: EYES_SHUT });
const PEEK = padTop(7, SIT.slice(0, 9));

/** Side view, facing right. */
const SIDE: Grid = [
  EMPTY,
  EMPTY,
  EMPTY,
  '..........O...O.',
  'O........OFO.OFO',
  'OBO......OBBBBBO',
  '.OBO.....OBSBEBO',
  '..OBOOOOOOBBBBFN',
  '..OBBSBBSBBBBFFO',
  '..OBBSBBSBBWWOO.',
  '..OBBBBBBBBWWO..',
  '..OBBBBBBBBBWO..',
  '...OBBOOOOBBO...',
  '...OBO....OBO...',
  '...OWO....OWO...',
  '...OO.....OO....',
];
const WALK_APART = variant(SIDE, {
  13: '..OBO......OBO..',
  14: '..OWO......OWO..',
  15: '..OO........OO..',
});
const WALK_TOGETHER = variant(SIDE, {
  13: '....OBO..OBO....',
  14: '....OWO..OWO....',
  15: '....OO...OO.....',
});
const CROUCH = padTop(5, [...SIDE.slice(3, 13), '...OWWOOOOWWO...']);
const CROUCH_WIGGLE = variant(CROUCH, { 6: '.O.......OFO.OFO' });
const POUNCE: Grid = [...SIDE.slice(0, 12), '..OBBBBBBBBBBO..', '.OWO........OWO.', EMPTY, EMPTY];
const STRETCH = variant(SIDE, {
  13: '...OBO.....OBBO.',
  14: '...OWO......OWWO',
  15: '...OO........OO.',
});
const STRETCH_TAIL = variant(STRETCH, { 3: 'O.........O...O.', 4: 'OO.......OFO.OFO' });

/** Curled loaf, head on the right. */
const SLEEP = padTop(8, [
  '.....OOOOO.O.O..',
  '....OBBSBBOFOFO.',
  '...OBBBSBBBBBBBO',
  '..OBBBSBBBBFOFFO',
  '..OBBSBBBBBBFNO.',
  '.OBBBBBBBBBBBBO.',
  '.OSWWBBBBBBWWBO.',
  '..OOOOOOOOOOOO..',
]);
const SLEEP_BREATH = variant(SLEEP, { 8: '....OOOOOO.O.O..', 9: '...OBBSBBBOFOFO.' });
const EAR_TWITCH = variant(SLEEP, { 8: '.....OOOOO.O....', 9: '....OBBSBBOFOOO.' });
const ONE_EYE = variant(SLEEP, { 11: '..OBBBSBBBBFEFFO' });
const ALERT = padTop(5, [
  '...........O.O..',
  '..........OFOFO.',
  '..........OBBBO.',
  '.....OOOOOOEBEO.',
  '....OBBSBBOFNFO.',
  '...OBBBSBBBOWO..',
  '..OBBBSBBBBBWO..',
  '..OBBSBBBBBBBBO.',
  ...SLEEP.slice(13),
]);

export const SPRITES: Record<Pose, readonly Grid[]> = {
  sit: [SIT, SIT, SIT, SIT, SIT_BLINK],
  walk: [SIDE, WALK_APART, SIDE, WALK_TOGETHER],
  run: [WALK_APART, WALK_TOGETHER],
  crouch: [CROUCH, CROUCH_WIGGLE],
  pounce: [POUNCE],
  flinch: [FLINCH],
  peek: [PEEK],
  sleep: [SLEEP, SLEEP_BREATH],
  alert: [ALERT],
  stretch: [STRETCH, STRETCH_TAIL],
  yawn: [YAWN],
  earTwitch: [EAR_TWITCH],
  oneEye: [ONE_EYE],
};

export const PALETTES: Record<CatName, Palette> = {
  misa: {
    O: '#2a2d33',
    B: '#a3a9b0',
    W: '#f4f4f2',
    E: '#7cc46a',
    N: '#e79aa4',
    P: '#e79aa4',
    S: '#5f656d',
    F: '#a3a9b0',
  },
  max: {
    O: '#24272c',
    B: '#6e757d',
    W: '#fafafa',
    E: '#e2c043',
    N: '#e79aa4',
    P: '#e79aa4',
    S: '#6e757d',
    F: '#6e757d',
  },
  raye: {
    O: '#4a3f35',
    B: '#ead8b8',
    W: '#f7ecd8',
    E: '#6fa8dc',
    N: '#c98b8b',
    P: '#8d8780',
    S: '#ead8b8',
    F: '#8d8780',
  },
};

/** On-screen pixels per sprite pixel. Misa is the small one. */
export const SCALE: Record<CatName, number> = { misa: 2, max: 3, raye: 3 };
