/**
 * Stored shape of an admin upload: /uploads/YYYY/MM/<hex>.<ext> (see saveUpload).
 * Kept in its own dependency-free module so client components can import it; src/lib/uploads.ts re-exports it.
 */
export const UPLOAD_PATH_RE = /^\/uploads\/\d{4}\/(0[1-9]|1[0-2])\/[0-9a-f]+\.(jpg|png|webp|gif)$/i
