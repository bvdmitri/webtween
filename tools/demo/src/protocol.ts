// The messages between the demo page and its worker.

/** What the page asks for: a clip, how much to slow it, and optionally which seconds. */
export interface SlowRequest {
  readonly file: File;
  readonly factor: number;
  readonly range?: { readonly start: number; readonly end: number };
  readonly backend: 'auto' | 'wasm';
}

/** How far the worker is, and how fast it goes. */
export interface SlowProgress {
  readonly type: 'progress';
  readonly backend: string;
  readonly sourceFrames: number;
  readonly totalFrames: number;
  readonly outputFrames: number;
  readonly generatedFrames: number;
  readonly generateMs: number;
  readonly elapsedMs: number;
}

/** The finished MP4, or why there is none. */
export type SlowResult =
  | SlowProgress
  | { readonly type: 'done'; readonly mp4: ArrayBuffer; readonly elapsedMs: number }
  | { readonly type: 'error'; readonly message: string };
