// The few anidoodle core types the vendored host and input fold refer to.
export type P = [number, number];
export type Ctx = CanvasRenderingContext2D;
export type Layer = { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: Ctx };
export type Env = { W: number; H: number; scale: number; canvas(w: number, h: number): Layer; cache: Map<string, unknown> };
// input.ts exports loopFilm for the film tools; DigiWP never calls it.
export type Film = { meta: Record<string, unknown>; assets: Record<string, unknown>; [k: string]: unknown };
