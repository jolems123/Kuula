import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { parseDataUrl } from "./storage.js";

const SIGNED_URL_SECONDS = 60;

export interface StoredFieldEvidence {
  key: string;
  bytes: number;
  mime: string;
}

export type FieldEvidenceAccess =
  | { kind: "buffer"; buffer: Buffer; mime: string }
  | { kind: "url"; url: string; expiresInSeconds: number };

function provider(): "local" | "s3" {
  const configured = (process.env.KYC_STORAGE_PROVIDER || "").trim().toLowerCase();
  if (configured === "s3") return "s3";
  if (process.env.NODE_ENV === "production") throw new Error("Private S3 storage is required for field evidence in production");
  return "local";
}

function bucket(): string {
  const value = process.env.KYC_S3_BUCKET?.trim();
  if (!value) throw new Error("KYC_S3_BUCKET is required for field evidence storage");
  return value;
}

function client(): S3Client {
  const region = process.env.KYC_S3_REGION?.trim();
  if (!region) throw new Error("KYC_S3_REGION is required for field evidence storage");
  const accessKeyId = process.env.KYC_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.KYC_S3_SECRET_ACCESS_KEY?.trim();
  return new S3Client({
    region,
    endpoint: process.env.KYC_S3_ENDPOINT?.trim() || undefined,
    forcePathStyle: process.env.KYC_S3_FORCE_PATH_STYLE === "true",
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
  });
}

function safe(value: string): string {
  return value.replace(/[^a-z0-9-]/gi, "");
}

function localRoot(): string {
  return path.resolve(process.env.KYC_STORAGE_DIR || "uploads/kyc", "credit-evidence");
}

function localPath(key: string): string {
  const root = localRoot();
  const absolute = path.resolve(root, key.replace(/^credit-evidence\//, ""));
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) throw new Error("Invalid evidence key");
  return absolute;
}

export async function saveFieldEvidence(input: {
  applicationId: string;
  evaluationId: string;
  evidenceType: string;
  dataUrl: string;
}): Promise<StoredFieldEvidence> {
  const parsed = parseDataUrl(input.dataUrl);
  const application = safe(input.applicationId);
  const evaluation = safe(input.evaluationId);
  const label = safe(input.evidenceType) || "evidence";
  if (!application || !evaluation) throw new Error("Invalid evidence identifiers");
  const key = `credit-evidence/${application}/${evaluation}/${Date.now()}-${crypto.randomUUID()}-${label}.${parsed.extension}`;

  if (provider() === "s3") {
    const kmsKeyId = process.env.KYC_S3_KMS_KEY_ID?.trim();
    await client().send(new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: parsed.buffer,
      ContentType: parsed.mime,
      ContentLength: parsed.buffer.length,
      ServerSideEncryption: kmsKeyId ? "aws:kms" : "AES256",
      SSEKMSKeyId: kmsKeyId || undefined,
      Metadata: {
        "kuula-data-class": "credit-field-evidence",
        "kuula-application-id": input.applicationId,
        "kuula-evidence-type": label,
      },
    }));
  } else {
    const absolute = localPath(key);
    await fs.mkdir(path.dirname(absolute), { recursive: true, mode: 0o700 });
    await fs.writeFile(absolute, parsed.buffer, { mode: 0o600 });
  }

  return { key, bytes: parsed.buffer.length, mime: parsed.mime };
}

export async function accessFieldEvidence(key: string, mime: string): Promise<FieldEvidenceAccess> {
  if (provider() === "s3") {
    const command = new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentType: mime,
      ResponseContentDisposition: "inline",
    });
    return { kind: "url", url: await getSignedUrl(client(), command, { expiresIn: SIGNED_URL_SECONDS }), expiresInSeconds: SIGNED_URL_SECONDS };
  }
  return { kind: "buffer", buffer: await fs.readFile(localPath(key)), mime };
}
