const VALID_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Validates an image file for type and size constraints.
 * @param {File} file - The File object to validate
 * @returns {{ valid: true } | { valid: false, reason: "type" | "size", message: string }}
 */
export function validateImageFile(file) {
  if (!VALID_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      reason: 'type',
      message: 'File must be a JPEG, PNG, or WebP image.',
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      reason: 'size',
      message: 'File must be 5MB or smaller.',
    };
  }

  return { valid: true };
}
