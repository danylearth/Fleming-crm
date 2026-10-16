// Private storage for Rentro uploads: a Supabase Storage bucket in staging and production, a local folder
// in development and tests. Files are never public; customers get short-lived signed links after a scope
// check, and staff read them through the API.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { supabaseAdmin, supabaseConfigured } from './rentro-supabase';

export type StorageBackend = 'local' | 'supabase';
export interface StoredFile { backend: StorageBackend; key: string }

const bucket = () => process.env.RENTRO_STORAGE_BUCKET || 'rentro-private';
const localRoot = () => path.join(process.env.UPLOADS_PATH || path.join(__dirname, '../uploads'), 'rentro');

export function storageBackend(): StorageBackend {
  if (process.env.NODE_ENV === 'production') {
    if (!supabaseConfigured()) throw new Error('Rentro uploads need Supabase Storage in production');
    return 'supabase';
  }
  // Development and tests can keep files on disk even while using a Supabase project for sign-in.
  if (process.env.RENTRO_STORAGE === 'local' || !supabaseConfigured()) return 'local';
  return 'supabase';
}

/** Accepted upload types, identified by content rather than the name the browser sent. */
const SIGNATURES: { ext: string; mime: string; test: (b: Buffer) => boolean }[] = [
  { ext: 'pdf', mime: 'application/pdf', test: b => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { ext: 'jpg', mime: 'image/jpeg', test: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', mime: 'image/png', test: b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
];

export function detectFileType(data: Buffer) {
  return data.length ? SIGNATURES.find(s => s.test(data)) || null : null;
}

export const sha256 = (data: Buffer) => crypto.createHash('sha256').update(data).digest('hex');

/** Keys are random and never derived from what the customer typed. */
export function newStorageKey(folder: string, ext: string) {
  if (!/^[a-z0-9/_-]+$/.test(folder)) throw new Error('Invalid storage folder');
  return `${folder}/${crypto.randomUUID()}.${ext}`;
}

function localPath(key: string) {
  const full = path.resolve(localRoot(), key);
  if (!full.startsWith(path.resolve(localRoot()) + path.sep)) throw new Error('Invalid storage key');
  return full;
}

export async function putPrivateFile(key: string, data: Buffer, mime: string): Promise<StoredFile> {
  const backend = storageBackend();
  if (backend === 'supabase') {
    const { error } = await supabaseAdmin().storage.from(bucket()).upload(key, data, { contentType: mime, upsert: false });
    if (error) throw new Error(`Upload failed: ${error.message}`);
  } else {
    const file = localPath(key);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, data, { flag: 'wx' });
  }
  return { backend, key };
}

export async function deletePrivateFile(file: StoredFile) {
  if (file.backend === 'supabase') await supabaseAdmin().storage.from(bucket()).remove([file.key]);
  else await fs.promises.unlink(localPath(file.key)).catch(() => {});
}

export async function readPrivateFile(file: StoredFile): Promise<Buffer> {
  if (file.backend === 'supabase') {
    const { data, error } = await supabaseAdmin().storage.from(bucket()).download(file.key);
    if (error || !data) throw new Error('File not found');
    return Buffer.from(await data.arrayBuffer());
  }
  return fs.promises.readFile(localPath(file.key));
}

/** A link that works for `seconds`; null for local storage, which the API streams instead. */
export async function signedFileUrl(file: StoredFile, seconds = 60): Promise<string | null> {
  if (file.backend !== 'supabase') return null;
  const { data, error } = await supabaseAdmin().storage.from(bucket()).createSignedUrl(file.key, seconds);
  if (error || !data?.signedUrl) throw new Error('Could not create a download link');
  return data.signedUrl;
}
