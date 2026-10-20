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
  flow?: (i: number, t: number, since: number) => Vec3 | null;
  /** Extra spin when the shape arrives. */
  kick?: number;
  /** Point indices that glow while this shape is up (eyes, beacons). */
  bright?: number[];
  /** Turn toward the viewer and hold, with a slow sway, while this shape is up. */
  facing?: boolean;
  /** Per-point tone, 0 = palette.point … 1 = palette.accent (two-tone palettes). Default: shaded top → bottom. */
  tone?: number[] | null;
  /** Per-link tone for `links`. */
  linkTone?: number[];
  /** Draw links brighter and keep place-trading local (line drawings). */
  lineArt?: boolean;
  /** Unit surface normals, one per point: the field lights the shape (key, ambient, rim, sheen) as it turns. */
  normals?: Vec3[];
  /** Per-point brightness 0…1 (a faint skin under crisp seams). Default 1. */
  alpha?: number[];
  /** Per-point surfel width in shape units: WebGL paints a soft lit disc this wide, so a sparse skin reads solid. 0 = a plain point. */
  surfel?: number[];
  /** Named points overlays can follow with field.anchors() (a HUD pointing at the helm's eyes, say). */
  anchors?: Record<string, Vec3>;
  /** A pen draws the shape: order (0…1, one per point) is when each point is drawn, over ms. Undrawn points wait unseen at the pen; the field emits 'traced' when it's done. */
  trace?: { order: number[]; ms?: number; ease?: 'inOut' | 'linear' };
  /** Hold still once in place: no place-trading, no scouts (figures, logos). */
  still?: boolean;
  /** false: keep pairs as signal paths but don't draw them as edges. */
  edges?: boolean;
  /** Surfel opacity (default 0.12), and flat discs that blend into an even surface instead of a soft glow. */
  surfelAlpha?: number;
  surfelFlat?: boolean;
}
export type ShapeBuilder = (n: number, random: () => number) => Shape;
/** A static shape: resampled to whatever count a field uses. */
export type ShapeData = { points: Array<[number, number] | Vec3>; tone?: number[] } | Array<[number, number] | Vec3>;
export type FaceChannel = 'eyeBlinkL' | 'eyeBlinkR' | 'jawOpen' | 'smileL' | 'smileR' | 'pucker' | 'press' | 'mouthL' | 'mouthR' | 'chinRaise' | 'cheekPuff' | 'squintL' | 'squintR' | 'browUp' | 'browDownL' | 'browDownR';
export type PaletteName = 'aurora' | 'mark-iii' | 'ranger' | 'verse' | 'barbenheimer' | 'upside-down' | 'night-city' | 'spice' | 'ember' | 'ice' | 'mono';

export interface Palette {
  point: RGB; hot: string; star: string; signal: RGB; head: RGB; glow: RGB; glow2: RGB;
  /** Far points fade toward this colour, for depth. */
  fog: RGB;
  /** The second tone: shapes paint parts of themselves with it (gold seams on the ranger). Default: point. */
  accent: RGB;
}

export interface LightRig { dir: Vec3; ambient: number; key: number; rim: number; spec: number; shine: number }

export interface Options {
  container?: Element;
  stage?: Element;
  /** Headless canvases (OffscreenCanvas, server canvases): size in CSS px and pixel ratio. */
  width?: number; height?: number; dpr?: number;
  /** Headless: where the shape sits, within width × height. Default: the whole canvas. */
  stageRect?: { x: number; y: number; width: number; height: number };
  /** 'auto' (WebGL, else 2D), 'webgl' or '2d'. */
  renderer?: 'auto' | 'webgl' | '2d';
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
  /** Start from an empty sky: particles are born unseen at the centre and appear as they arrive (or as a pen draws them). */
  blank?: boolean;
  /** 'manual': no animation loop; field.advance(ms) steps it deterministically (tests, golden renders, video export). */
  clock?: 'auto' | 'manual';
  /** Register the built-in crew (crew:<trade>:line | crew:<trade>:lit, crew:all) before building; works inside offload() workers. */
  crew?: boolean;
  /** Light for shapes with normals: true (default), false, or a rig. dir points from the shape toward the light (x right, y down, z away from you). */
  light?: boolean | Partial<LightRig>;
  /** WebGL: paint surfels (soft lit discs) so skins read as solid surfaces. Default true. */
  surfels?: boolean;
  /** A preset name, a palette, or { preset, …overrides }. */
  palette?: PaletteName | (Partial<Palette> & { preset?: PaletteName });
  /** offload() only: static shapes to register inside the worker. */
  shapeData?: Record<string, ShapeData>;
  onShape?: (name: string) => void;
  onStats?: (stats: { fps: number; nodes: number; quality: number }) => void;
  onSpinout?: () => void;
}

export interface Field {
  readonly version: string;
  readonly shape: string;
  readonly shapes: string[];
  /** arrive: points switch to the new shape in a wave from an anchor or point, nearest first, over ms; the rest hold where they are. */
  setShape(name: string, opts?: { pin?: boolean | number; arrive?: { from: string | Vec3; ms?: number } }): Field;
  /** Manual clock only: step ms forward in fixed frames, then draw. */
  advance(ms: number): Field;
  /** Compile shapes ahead of use, one per idle slice (shapes otherwise compile on first setShape). */
  prepare(names?: string[], done?: () => void): Field;
  /** Add registered shapes to a live field; they compile on first use. */
  add(names: string[]): Field;
  next(): Field;
  play(): Field;
  pause(): Field;
  /** Re-measure; headless fields take a new size. */
  resize(width?: number, height?: number, dpr?: number): Field;
  /** Where a shape-space point is on screen now, in CSS px within the container; z > 0 is behind the centre. */
  project(p: Vec3): { x: number; y: number; z: number };
  /** The current shape's anchors, projected. */
  anchors(): Record<string, { x: number; y: number; z: number }>;
  /** Current orientation (radians), shape radius and centre (CSS px). */
  view(): { yaw: number; pitch: number; roll: number; radius: number; x: number; y: number };
  /** Drive facing shapes from a tracked head; null releases. */
  setPose(p: { yaw: number; pitch: number; roll?: number; eyes?: number | null; face?: Partial<Record<FaceChannel, number>> | null } | null): Field;
  /** Drive a rigged shape's face, channels 0…1 (eased); null relaxes. setPose({ …, face }) does the same. */
  setFace(face: Partial<Record<FaceChannel, number>> | null): Field;
  /** Replay the current shape's trace: the pen draws it again from a blank. */
  trace(): Field;
  /** Send signals along the current shape's pairs, from an anchor name or a shape-space point (default: anywhere). */
  signal(at?: string | Vec3, hops?: number, count?: number): Field;
  /** Change options live (palette, autonomy, cycle, pin, depth, quality, fpsFloor, maxDpr, radius, rotation, interactive, autoPause; headless sizes). */
  set(options: Partial<Options>): Field;
  /** Input without DOM events: workers, game loops, other platforms. */
  pointer(type: 'move' | 'down' | 'up' | 'leave' | 'pulse', x?: number, y?: number): Field;
  on(event: 'shape' | 'settled' | 'traced', fn: (name: string) => void): Field;
  on(event: 'stats', fn: (s: { fps: number; nodes: number; quality: number }) => void): Field;
  on(event: 'spinout' | 'frame', fn: (t?: number) => void): Field;
  off(event: string, fn?: (...a: any[]) => void): Field;
  stats(): { fps: number; nodes: number; running: boolean; reduced: boolean; shape: string; quality: number; scouts: number; settle: number; renderer: "webgl" | "2d"; headless: boolean };
  destroy(): void;
}

export interface ArmourSpec {
  /** Front silhouette: [drawingY, halfWidth] in a 1024-wide drawing, y down (crown ≈ 172, chin ≈ 1120). */
  sil: Array<[number, number]>;
  front?: Array<[number, number]>; back?: Array<[number, number]>;
  lines: Array<{ p?: Array<[number, number]>; edge?: [number, number, number]; w?: number; glow?: boolean; mirror?: boolean; tone?: number }>;
  fills?: Array<{ p: Array<[number, number]>; share: number; mirror?: boolean; glow?: boolean; tone?: number; alpha?: number; cut?: Array<Array<[number, number]>> }>;
  /** A lit skin over the whole shell, in rows round the head; panels tone front regions (a gold faceplate). Eyes and visors stay open. */
  surface?: { share: number; alpha?: number; tone?: number; panels?: Array<{ p: Array<[number, number]>; tone?: number; alpha?: number; mirror?: boolean }> };
  screws?: Array<[number, number]>; ears?: { y: number; z: number; r: number[]; tone?: number };
  plate?: { top?: number; width?: number; lift?: number }; rings?: { count?: number; from?: number; to?: number; tone?: number; alpha?: number };
  budget?: number; scale?: number; kick?: number;
  anchors?: Record<string, [number, number, number] | [number, number, number, 'ear', -1 | 1]>;
  /** Face rig: soft regions that move with setFace channels. */
  rig?: Array<{ ch: FaceChannel | string; box: [number, number, number, number]; soft?: number; ramp?: [number, number]; move?: [number, number, number]; squeeze?: [number, number]; lid?: number; mirror?: FaceChannel | string }>;
  /** Bright points that dim with each side's blink: [leftChannel, rightChannel]. */
  dim?: [string, string];
}
export type OffloadedField = Pick<Field, 'setShape' | 'next' | 'play' | 'pause' | 'setPose' | 'set' | 'pointer' | 'trace' | 'signal' | 'prepare' | 'on' | 'off' | 'destroy'> & { readonly shape: string | null; offloaded: true; worker: Worker; stats(): { fps: number; nodes: number; quality: number } | null;
  /** The latest anchors and view from the worker (~30×/s), for overlays on the main thread. */
  anchors(): Record<string, { x: number; y: number; z: number }>; view(): { yaw: number; pitch: number; roll: number; radius: number; x: number; y: number } | null };

export const version: string;
export function create(canvas: HTMLCanvasElement | OffscreenCanvas, options?: Options): Field;
export function register(name: string, build: ShapeBuilder | ShapeData): void;
/** Run the field in a worker (url: dist/aurora-field.worker.js). null where unsupported. */
export function offload(canvas: HTMLCanvasElement, options: Options, workerUrl: string): OffloadedField | null;
export function serve(scope: { onmessage: any; postMessage(m: any): void }): void;
export const palettes: Record<PaletteName, Partial<Palette>>;
export function armour(spec: ArmourSpec): ShapeBuilder;
export function fromPoints(points: Array<[number, number] | Vec3>, options?: { scale?: number; depth?: number; tone?: number[]; facing?: boolean; kick?: number }): ShapeBuilder;
export function fromSVG(paths: string | string[], options?: { stroke?: number; depth?: number; scale?: number; tone?: number[]; facing?: boolean }): ShapeBuilder;
export interface ImageOptions { threshold?: number; invert?: boolean; alpha?: boolean; edges?: number; depth?: number; scale?: number; tone?: 'luma'; facing?: boolean }
export function fromImage(source: ImageData | { width: number; height: number; data: ArrayLike<number> } | CanvasImageSource, options?: ImageOptions): ShapeBuilder;
export function fromText(text: string, options?: ImageOptions & { font?: string }): ShapeBuilder;
export function parsePath(d: string): Array<{ p: Array<[number, number]>; closed: boolean }>;
export type PoseName = 'stand' | 'tablet' | 'wrench' | 'hammer' | 'phone' | 'keys' | 'inspect' | 'pole' | 'carry' | 'reach' | 'push' | 'spray' | 'tray' | (string & {});
export type PropName = 'hardhat' | 'cap' | 'tablet' | 'wrench' | 'pipe' | 'toolbelt' | 'tester' | 'gauge' | 'hammer' | 'phone' | 'clipboard' | 'keys' | 'remote' | 'yardsign' | 'roller' | 'rake' | 'skimmer' | 'mop' | 'bucket' | 'sprayer' | 'box' | 'windowpane' | 'solarpanel' | 'dolly' | 'chainsaw' | 'trowel' | 'bullfloat' | 'fence' | 'fan' | 'hvacunit' | 'garagedoor' | 'tray' | (string & {});
export type CrewName = 'contractor' | 'plumber' | 'electrician' | 'roofer' | 'manager' | 'realtor' | 'hvac' | 'painter' | 'landscaper' | 'cleaner' | 'pest' | 'pool' | 'restoration' | 'mover' | 'solar' | 'window' | 'garagedoor' | 'arborist' | 'fencer' | 'concrete' | 'host' | (string & {});
/** A point on a figure: absolute, a joint (+ offset), along a bone, or between two joints; x / y / z pin an axis. */
export type PointRef = Vec3 | { j: string; from?: string; t?: number; d?: Vec3; x?: number; y?: number; z?: number } | { mid: [string, string]; d?: Vec3; x?: number; y?: number; z?: number };
export type Prim =
  | { k: 'cyl'; a: PointRef; b: PointRef; r?: number; ra?: number; rb?: number }
  | { k: 'ell'; c: PointRef; r: Vec3; half?: boolean }
  | { k: 'box'; c: PointRef; h: Vec3; tilt?: [number, number, number, number]; along?: { j: string; from: string }; len?: number }
  | { k: 'ring'; c: PointRef; r: [number, number]; ex?: number; ez?: number; band?: number; plane?: Vec3 | { j: string; from: string } };
/** A prop as data: which joint carries it, and its primitives. */
export interface PropDef { owner: string; prims: Prim[]; name?: string }
/** One term of an action: turn a joint's subtree about another joint. */
export interface ActionTerm { pivot: string; joint: string; axis: Vec3; amp: number; rate?: number; wave?: 'sin' | 'pulse' | 'swing' | 'burst' | 'hold'; gate?: number; phase?: number }
export interface FigureSpec {
  /** A named pose, or joint positions (pelvis, chest, neck, head, shL/elL/haL, shR/elR/haR, hipL/knL/anL/toL, hipR/knR/anR/toR) in a ~1.8-tall box, y down, facing −z. */
  pose?: PoseName | Record<string, Vec3>;
  /** Turn the whole figure about the vertical (radians), e.g. three-quarters to a desk. */
  yaw?: number;
  /** The idle action: a name (defaults to the pose's own) or terms as data. */
  action?: string | ActionTerm[];
  props?: Array<PropName | PropDef>;
  /** ms the pen takes to draw the line figure. Default 1800. */
  trace?: number;
}
/** One person, two builders: line (a stick figure a pen traces) and lit (the same person as a lit, solid mannequin). Shared pose, idle loop and anchors (head, chest, hand, prop, feet). */
export function figure(spec?: FigureSpec | CrewName): { line: ShapeBuilder; lit: ShapeBuilder; anchors: Record<string, Vec3> };
/** Several shapes in one, each placed and scaled: [builder, [x, y, z], scale]. Anchors are prefixed by part index ('0.chest'). */
export function group(parts: Array<[ShapeBuilder, Vec3, number]>): ShapeBuilder;
/** Register crew:<trade>:line and crew:<trade>:lit for every trade (or just the ones named), and crew:all. Idempotent. */
export function registerCrew(only?: CrewName | CrewName[]): CrewName[];
/** A lit lineup of trades as one shape. */
export function crewGroup(trades: CrewName[]): ShapeBuilder;
export function trades(): CrewName[];
export interface Plugin { poses?: Record<string, Record<string, Vec3>>; props?: Record<string, PropDef>; actions?: Record<string, ActionTerm[]>; trades?: Record<string, FigureSpec>; palettes?: Record<string, Partial<Palette>>; shapes?: Record<string, ShapeBuilder | ShapeData>; beats?: Record<string, unknown> }
/** Add vocabulary and shapes without touching the engine. Chainable. */
export function use(plugin: Plugin): typeof AuroraField;
export function vocab(): { poses: string[]; props: string[]; actions: string[]; trades: string[]; agents: string[]; palettes: string[]; joints: string[] };
/** Register builder:typing|prompting:line|lit and, given jobs, builder:agents:<job+job…>; returns that name. */
export function registerBuilder(jobs?: AgentJob[]): string | null;
export function agents(): AgentJob[];

export type Anchor = 'head' | 'chest' | 'hand' | 'prop' | 'feet';
export interface Caption { who?: string; did: string; metric?: { to: number; from?: number; prefix?: string; suffix?: string; ms?: number } }
export interface TradeBeat { trade: CrewName | FigureSpec; draw?: { ms?: number }; moment?: { text: string; at?: Anchor; ms?: number }; ai?: { ms?: number; text?: string }; fill?: { from?: Anchor; ms?: number }; caption?: Caption; hold?: number }
/** with builder: true, the builder sits at his desk front and centre of the lineup */
export interface CrewBeat { crew: CrewName[] | true; builder?: boolean; caption?: Caption; hold?: number }
export type AgentJob = 'answer' | 'estimate' | 'review' | 'schedule' | 'followup' | 'analyze' | (string & {});
/** The person behind the agents: typing (drawn by the pen, then lit, with code typing on his screen), prompting (a prompt types itself, an agent leaves the screen), agents (his agents at work, threads from his screen). */
export interface BuilderBeat { builder: 'typing' | 'prompting' | 'agents'; prompt?: { text: string; code?: boolean; ms?: number }; agents?: AgentJob[]; caption?: Caption; hold?: number }
/** A story as data: trades drawn, the moment it went wrong, the AI, the fill, the outcome; then the crew. */
export interface Storyboard { version: 1; loop?: boolean; palette?: PaletteName | Partial<Palette>; light?: Partial<LightRig>; beats: Array<TradeBeat | CrewBeat | BuilderBeat> }
export interface StageOptions extends Pick<Options, 'container' | 'stage' | 'count' | 'radius' | 'depth' | 'interactive' | 'quality' | 'renderer' | 'reducedMotion' | 'clock' | 'maxDpr' | 'seed' | 'stars' | 'palette' | 'light'> {
  /** No DOM overlay: listen to 'phase', 'caption' and 'overlay' events and draw your own. */
  headless?: boolean;
  /** false: don't inject the default HUD styles (.af-hud, .af-caption, .af-moment, .af-orb). */
  styles?: boolean;
  /** Extra text rules for validate(), e.g. house style; return a message to refuse. */
  text?: (value: string, path: string) => string | null | undefined;
}
export interface StageBeatEvent { index: number; beat: TradeBeat | CrewBeat | BuilderBeat }
export interface StagePhaseEvent { index: number; phase: 'draw' | 'moment' | 'ai' | 'fill' | 'caption' | 'crew' | 'hold' | 'typing' | 'prompting' | 'agents'; text?: string }
export interface Stage {
  readonly field: Field; readonly storyboard: Storyboard; readonly index: number; readonly phase: string;
  /** Swap in a storyboard at the next beat; returns the validation (an invalid board is refused, the old one plays on). */
  load(board: Storyboard): { ok: boolean; errors: string[] };
  goto(beat: number): Stage;
  /** Show a trade now and hold it; null lets the story carry on. */
  focus(trade: string | null): Stage;
  advance(ms: number): Stage;
  play(): Stage; pause(): Stage;
  on(event: 'beat', fn: (e: StageBeatEvent) => void): Stage;
  on(event: 'phase', fn: (e: StagePhaseEvent) => void): Stage;
  on(event: 'caption', fn: (c: Caption) => void): Stage;
  on(event: 'overlay', fn: (e: { el: string; on: boolean }) => void): Stage;
  on(event: 'prompt', fn: (e: { text: string }) => void): Stage;
  on(event: 'chips', fn: (labels: string[]) => void): Stage;
  on(event: 'load' | 'loop', fn: (a?: unknown) => void): Stage;
  off(event: string, fn?: (...a: any[]) => void): Stage;
  destroy(): void;
}
export function stage(canvas: HTMLCanvasElement | OffscreenCanvas, storyboard: Storyboard, options?: StageOptions): Stage;
export function validate(storyboard: unknown, options?: Pick<StageOptions, 'text'>): { ok: boolean; errors: string[] };
/** JSON Schema for a storyboard with today's vocabulary as enums; strict: OpenAI structured-outputs shape. */
export function schema(options?: { strict?: boolean }): Record<string, unknown>;
export const crew: CrewName[];
export const poses: PoseName[];
export function build(name: string, n: number, seed?: number): Shape;
export function shapes(): string[];
export const defaults: Required<Omit<Options, 'container' | 'stage' | 'count' | 'shapes' | 'rotation' | 'initial' | 'radius' | 'seed' | 'onShape' | 'onStats' | 'onSpinout'>> & { lightRig: LightRig };

declare const AuroraField: {
  version: typeof version; create: typeof create; register: typeof register;
  build: typeof build; shapes: typeof shapes; defaults: typeof defaults; palettes: typeof palettes;
  armour: typeof armour; offload: typeof offload; serve: typeof serve; fromPoints: typeof fromPoints; fromSVG: typeof fromSVG;
  fromImage: typeof fromImage; fromText: typeof fromText; parsePath: typeof parsePath;
  figure: typeof figure; group: typeof group; registerCrew: typeof registerCrew; crew: typeof crew; poses: typeof poses;
  use: typeof use; vocab: typeof vocab; crewGroup: typeof crewGroup; trades: typeof trades; stage: typeof stage; validate: typeof validate; schema: typeof schema; registerBuilder: typeof registerBuilder; agents: typeof agents;
};
export default AuroraField;
declare global { interface Window { AuroraField: typeof AuroraField } }
