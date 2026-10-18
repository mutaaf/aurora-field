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
}
export type ShapeBuilder = (n: number, random: () => number) => Shape;

export interface Palette {
  point: RGB; hot: string; star: string; signal: RGB; head: RGB; glow: RGB; glow2: RGB;
}

export interface Options {
  container?: Element;
  stage?: Element;
  count?: number | ((viewportWidth: number) => number);
  shapes?: string[];
  initial?: string;
  cycle?: number;
  pin?: number;
  intro?: number;
  stars?: number;
  radius?: (stageWidth: number, stageHeight: number) => number;
  maxDpr?: number;
  fpsFloor?: number;
  interactive?: boolean;
  autoPause?: boolean;
  reducedMotion?: 'auto' | boolean;
  seed?: number | null;
  palette?: Partial<Palette>;
  onShape?: (name: string) => void;
  onStats?: (stats: { fps: number; nodes: number }) => void;
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
  stats(): { fps: number; nodes: number; running: boolean; reduced: boolean; shape: string };
  destroy(): void;
}

export const version: string;
export function create(canvas: HTMLCanvasElement, options?: Options): Field;
export function register(name: string, build: ShapeBuilder): void;
export function build(name: string, n: number, seed?: number): Shape;
export function shapes(): string[];
export const defaults: Required<Omit<Options, 'container' | 'stage' | 'count' | 'shapes' | 'initial' | 'radius' | 'seed' | 'onShape' | 'onStats' | 'onSpinout'>>;

declare const AuroraField: {
  version: typeof version; create: typeof create; register: typeof register;
  build: typeof build; shapes: typeof shapes; defaults: typeof defaults;
};
export default AuroraField;
declare global { interface Window { AuroraField: typeof AuroraField } }
