import multer from 'multer';

// In-memory buffer, handed to storage.service.save() which writes it to
// disk (or, post S3-migration, to a bucket) - route handlers never touch
// the filesystem directly.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});
