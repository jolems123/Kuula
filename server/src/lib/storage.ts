/**
 * KYC document storage.
 *
 * Persists the actual ID images that the client captures (not just filenames).
 * The default implementation writes to the local filesystem under
 * `KYC_STORAGE_DIR` (default `uploads/kyc`, relative to the server's working
 * directory) — kept out of the web root and git-ignored. The `saveKycImage`
 * seam is intentionally storage-agnostic so it can be swapped for object
 * storage (S3 / Supabase Storage) without touching the route.
 *
 * Sensitive data note: these are national ID images. Do not serve them
 * publicly; retrieval should be through an authenticated admin path.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB per side

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface ParsedDataUrl {
  mime: string;
  buffer: Buffer;
}

/**
 * Parses a `data:<mime>;base64,<payload>` URL into a validated buffer.
 * Throws on unsupported mime, malformed input, or oversize payloads.
 * Pure and deterministic — safe to unit test.
 */
export function parseDataUrl(dataUrl: string): ParsedDataUrl {
  const match = /^data:([a-z0-9/+.-]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) throw new Error("Invalid image data (expected a base64 data URL)");

  const mime = match[1].toLowerCase();
  if (!MIME_EXT[mime]) throw new Error("Only JPG, PNG, or WEBP images are allowed");

  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0) throw new Error("Image data is empty");
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error("Image is too large (max 5MB)");

  return { mime, buffer };
}

function storageRoot(): string {
  return path.resolve(process.env.KYC_STORAGE_DIR || "uploads/kyc");
}

/**
 * Stores one ID image and returns an opaque storage key (relative path).
 * `side` is "front" | "back"; `userId` scopes the file to the owner.
 */
export async function saveKycImage(params: {
  userId: string;
  side: "front" | "back";
  dataUrl: string;
}): Promise<{ key: string; bytes: number }> {
  const { mime, buffer } = parseDataUrl(params.dataUrl);
  const ext = MIME_EXT[mime];
  const dir = path.join(storageRoot(), params.userId);
  await fs.mkdir(dir, { recursive: true });

  const fileName = `${params.side}-${crypto.randomUUID()}.${ext}`;
  const absPath = path.join(dir, fileName);
  await fs.writeFile(absPath, buffer, { mode: 0o600 });

  // Return a stable, root-relative key rather than an absolute path.
  return { key: path.posix.join(params.userId, fileName), bytes: buffer.length };
}
