import { describe, it, expect } from 'vitest';
import { validateImageFile } from './fileValidator.js';

describe('validateImageFile', () => {
  function createMockFile(type, size) {
    return { type, size };
  }

  it('accepts a valid JPEG file under 5MB', () => {
    const file = createMockFile('image/jpeg', 1024 * 1024); // 1MB
    expect(validateImageFile(file)).toEqual({ valid: true });
  });

  it('accepts a valid PNG file under 5MB', () => {
    const file = createMockFile('image/png', 2 * 1024 * 1024); // 2MB
    expect(validateImageFile(file)).toEqual({ valid: true });
  });

  it('accepts a valid WebP file under 5MB', () => {
    const file = createMockFile('image/webp', 3 * 1024 * 1024); // 3MB
    expect(validateImageFile(file)).toEqual({ valid: true });
  });

  it('accepts a file exactly at 5MB', () => {
    const file = createMockFile('image/jpeg', 5 * 1024 * 1024); // exactly 5MB
    expect(validateImageFile(file)).toEqual({ valid: true });
  });

  it('rejects an unsupported MIME type', () => {
    const file = createMockFile('image/gif', 1024);
    const result = validateImageFile(file);
    expect(result).toEqual({
      valid: false,
      reason: 'type',
      message: 'File must be a JPEG, PNG, or WebP image.',
    });
  });

  it('rejects a non-image MIME type', () => {
    const file = createMockFile('application/pdf', 1024);
    const result = validateImageFile(file);
    expect(result).toEqual({
      valid: false,
      reason: 'type',
      message: 'File must be a JPEG, PNG, or WebP image.',
    });
  });

  it('rejects a file exceeding 5MB', () => {
    const file = createMockFile('image/jpeg', 5 * 1024 * 1024 + 1); // 5MB + 1 byte
    const result = validateImageFile(file);
    expect(result).toEqual({
      valid: false,
      reason: 'size',
      message: 'File must be 5MB or smaller.',
    });
  });

  it('checks type before size (invalid type takes priority)', () => {
    const file = createMockFile('image/gif', 10 * 1024 * 1024); // invalid type AND too large
    const result = validateImageFile(file);
    expect(result.reason).toBe('type');
  });
});
