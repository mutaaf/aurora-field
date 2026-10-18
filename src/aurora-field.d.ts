export type Vec3 = [number, number, number];
export type RGB = [number, number, number];

export interface Shape {
  /** One target per particle, in a roughly unit box centred on the origin. */
  points: Vec3[];
  /** Edges that draw faintly and carry travelling signals. Indices into points. */
  pairs?: Array<[number, number]>;
  /** Static segments drawn with the shape (shape space). */
  links?: Array<[Vec3, Vec3]>;
  /** Per-frame target override for animated points; t is seconds. Return null to use points[i]. */
  flow?: (i: number, t: number) => Vec3 | null;
  /** Extra spin when the shape arrives. */
  kick?: number;
  /** Point indices that glow while this shape is up (eyes, beacons). */
  bright?: number[];
  /** Turn toward the viewer and hold, with a slow sway, while this shape is up. */
  facing?: boolean;
}
export type ShapeBuilder = (n: number, random: () => number) => Shape;

export interface Palette {
  point: RGB; hot: string; star: string; signal: RGB; head: RGB; glow: RGB; glow2: RGB;
  /** Far points fade toward this colour, for depth. */
  fog: RGB;
}

export interface Options {
  container?: Element;
  stage?: Element;
  count?: number | ((viewportWidth: number) => number);
  shapes?: string[];
  /** Which shapes auto-cycle (default: all of `shapes`); others are reachable via setShape. */
  rotation?: string[];
  initial?: string;
  cycle?: number;
  pin?: number;
  intro?: number;
  stars?: number;
  radius?: (stageWidth: number, stageHeight: number) => number;
  maxDpr?: number;
  /** Camera distance in shape radii; lower is more dramatic perspective. Default 2.8. */
  depth?: number;
  quality?: 'auto' | 'high' | 'low';
  fpsFloor?: number;
  /** 0…1: breathing, place-trading, scouts, nodes lit by signals. */
  autonomy?: number;
  interactive?: boolean;
  autoPause?: boolean;
  reducedMotion?: 'auto' | boolean;
  seed?: number | null;
  palette?: Partial<Palette>;
  onShape?: (name: string) => void;
  onStats?: (stats: { fps: number; nodes: number; quality: number }) => void;
  onSpinout?: () => void;
}

export interface Field {
  readonly version: string;
  readonly shape: string;
  readonly shapes: string[];
  setShape(name: string, opts?: { pin?: boolean | number }): Field;
  next(): Field;
  play(): Field;
  pause(): Field;
  resize(): Field;
  stats(): { fps: number; nodes: number; running: boolean; reduced: boolean; shape: string; quality: number; scouts: number; settle: number };
  destroy(): void;
}

export const version: string;
export function create(canvas: HTMLCanvasElement, options?: Options): Field;
export function register(name: string, build: ShapeBuilder): void;
export function build(name: string, n: number, seed?: number): Shape;
export function shapes(): string[];
export const defaults: Required<Omit<Options, 'container' | 'stage' | 'count' | 'shapes' | 'rotation' | 'initial' | 'radius' | 'seed' | 'onShape' | 'onStats' | 'onSpinout'>>;

declare const AuroraField: {
  version: typeof version; create: typeof create; register: typeof register;
  build: typeof build; shapes: typeof shapes; defaults: typeof defaults;
};
export default AuroraField;
declare global { interface Window { AuroraField: typeof AuroraField } }
