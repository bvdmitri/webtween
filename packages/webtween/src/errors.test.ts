import { describe, expect, it } from 'vitest';

import { asWebtweenError, WebtweenError } from './errors';

describe('WebtweenError', () => {
  it('carries a code and keeps the error it stands for as its cause', () => {
    const cause = new Error('404');
    const error = asWebtweenError('model-unavailable', cause);
    expect(error).toBeInstanceOf(WebtweenError);
    expect(error).toMatchObject({
      name: 'WebtweenError',
      code: 'model-unavailable',
      message: '404',
    });
    expect(error.cause).toBe(cause);
  });

  it('passes a WebtweenError through and wraps anything else thrown', () => {
    const original = new WebtweenError('frame-size', 'too big');
    expect(asWebtweenError('model-invalid', original)).toBe(original);
    expect(asWebtweenError('model-invalid', 'text').message).toBe('text');
  });
});
