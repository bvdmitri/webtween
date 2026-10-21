declare const unit: unique symbol;

/**
 * A number tagged with its unit at the type level only.
 *
 * @remarks The tag has no runtime cost: a branded value is the number itself. It exists so that a
 * media clock in microseconds cannot be passed where seconds are expected without an explicit
 * conversion below.
 */
export type Quantity<Unit extends string> = number & { readonly [unit]: Unit };

/** A duration or a time in seconds. */
export type Seconds = Quantity<'seconds'>;
/** A time in microseconds, as WebCodecs keeps frame timestamps. */
export type Microseconds = Quantity<'microseconds'>;

const MICROSECONDS_PER_SECOND = 1_000_000;

function finite<Unit extends string>(value: number, name: Unit): Quantity<Unit> {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite, got ${value}`);
  return value as Quantity<Unit>;
}

/**
 * A number tagged with its unit: `seconds` and `microseconds` throw a `RangeError` for a value
 * that is not finite, so a unit never carries `NaN` or an infinity.
 */
export const seconds = (value: number): Seconds => finite(value, 'seconds');
export const microseconds = (value: number): Microseconds => finite(value, 'microseconds');

/** Microseconds to seconds. */
export const microsecondsToSeconds = (value: Microseconds): Seconds =>
  seconds(value / MICROSECONDS_PER_SECOND);

/** Seconds to whole microseconds, rounded to the nearest. */
export const secondsToMicroseconds = (value: Seconds): Microseconds =>
  microseconds(Math.round(value * MICROSECONDS_PER_SECOND));
