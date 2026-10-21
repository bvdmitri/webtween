/**
 * Why webtween could not do what it was asked, as a code an application can act on.
 *
 * @remarks `model-unavailable`: the model could not be fetched. `model-invalid`: the bytes are not
 * a model with webtween's inputs and output (docs/MODEL.md). `runtime-unavailable`: onnxruntime-web
 * could not load (its WebAssembly files are missing, say). `frame-size`: a frame is not the size
 * the interpolator was made for.
 */
export type WebtweenErrorCode =
  'model-unavailable' | 'model-invalid' | 'runtime-unavailable' | 'frame-size';

/** A failure with its {@link WebtweenErrorCode}. */
export class WebtweenError extends Error {
  public override readonly name = 'WebtweenError';
  public readonly code: WebtweenErrorCode;

  public constructor(code: WebtweenErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
  }
}

/** `error` as a {@link WebtweenError} of `code`, unless it already is one. */
export function asWebtweenError(code: WebtweenErrorCode, error: unknown): WebtweenError {
  if (error instanceof WebtweenError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new WebtweenError(code, message, { cause: error });
}
