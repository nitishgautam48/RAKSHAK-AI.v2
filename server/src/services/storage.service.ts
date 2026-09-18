import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

// Local-disk implementation of the storage abstraction. Every method takes
// and returns a *storage key* (a relative path), never an absolute path or
// URL, so swapping this module for an S3-backed one (putObject/getObject/
// deleteObject against a bucket, same key semantics) is the entire
// migration - no caller changes.
export interface StorageProvider {
  save(buffer: Buffer, opts: { subdir: string; filename: string }): Promise<string>;
  read(storageKey: string): Promise<Buffer>;
  remove(storageKey: string): Promise<void>;
  absolutePath(storageKey: string): string;
}

class LocalStorageProvider implements StorageProvider {
  private root = path.resolve(env.storageRoot);

  async save(buffer: Buffer, opts: { subdir: string; filename: string }): Promise<string> {
    const dir = path.join(this.root, opts.subdir);
    await fs.mkdir(dir, { recursive: true });
    const safeName = `${crypto.randomUUID()}-${opts.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const storageKey = path.posix.join(opts.subdir, safeName);
    await fs.writeFile(path.join(this.root, storageKey), buffer);
    return storageKey;
  }

  async read(storageKey: string): Promise<Buffer> {
    return fs.readFile(path.join(this.root, storageKey));
  }

  async remove(storageKey: string): Promise<void> {
    await fs.rm(path.join(this.root, storageKey), { force: true });
  }

  absolutePath(storageKey: string): string {
    return path.join(this.root, storageKey);
  }
}

export const storage: StorageProvider = new LocalStorageProvider();
