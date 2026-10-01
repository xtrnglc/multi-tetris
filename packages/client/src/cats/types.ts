export type CatName = 'misa' | 'max' | 'raye';

export type Pose =
  | 'sit'
  | 'walk'
  | 'run'
  | 'crouch'
  | 'pounce'
  | 'flinch'
  | 'peek'
  | 'sleep'
  | 'alert'
  | 'stretch'
  | 'yawn'
  | 'earTwitch'
  | 'oneEye';

/** Returns a number in [0, 1); Math.random in the app, fixed in tests. */
export type Rng = () => number;

export interface Bubble {
  text: string;
  /** Changes whenever a new bubble pops, so the renderer can tell repeats apart. */
  id: number;
}

/** What the renderer needs to draw one cat this frame. */
export interface CatView {
  pose: Pose;
  /** Time spent in the current pose, in ms; the renderer turns it into a frame. */
  poseMs: number;
  /** Position along the cat's perch in px (each cat defines its own origin). */
  x: number;
  /** Vertical offset in px; negative is up (jumps). */
  y: number;
  /** 1 = facing right (as drawn), -1 = mirrored. */
  facing: 1 | -1;
  visible: boolean;
  bubble: Bubble | null;
}
