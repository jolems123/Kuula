/**
 * Smile ID — Enhanced KYC / ID-number verification for Uganda NIN.
 *
 * This verifies a National ID *number* against the government registry (NIRA)
 * using the applicant's name and DOB. It does NOT require the ID photos to be
 * uploaded to storage, which is why it fits our current KYC flow (we only pass
 * the NIN + name + DOB to the backend).
 *
 * Wiring is gated behind environment configuration. When the SMILE_* secrets
 * are absent, verification is skipped and the caller falls back to manual
 * review (status "pending") — the flow never blocks or throws on a provider
 * outage (fail-safe).
 *
 * Required env to enable:
 *   SMILE_PARTNER_ID   Smile ID partner id
 *   SMILE_API_KEY      Smile ID API key (from the portal)
 *   SMILE_ENV          "sandbox" (default) or "production"
 *
 * Docs: https://docs.usesmileid.com/products/for-individuals-kyc/identity-lookup
 */
import crypto from "node:crypto";

export type KycVerificationStatus = "verified" | "rejected" | "pending";

export interface KycVerificationResult {
  /** Whether Smile ID is configured and was actually called. */
  configured: boolean;
  /** True only when the provider positively matched the identity. */
  verified: boolean;
  status: KycVerificationStatus;
  provider: "smile-id" | "none";
  /** Provider job reference for audit/support, when available. */
  reference?: string;
  /** Human-readable detail (result text or error) for logs. */
  detail?: string;
}

interface SmileConfig {
  partnerId: string;
  apiKey: string;
  baseUrl: string;
}

const SANDBOX_URL = "https://testapi.smileidentity.com";
const PRODUCTION_URL = "https://api.smileidentity.com";

function readConfig(): SmileConfig | null {
  const partnerId = process.env.SMILE_PARTNER_ID?.trim();
  const apiKey = process.env.SMILE_API_KEY?.trim();
  if (!partnerId || !apiKey) return null;
  const baseUrl = process.env.SMILE_ENV?.trim() === "production" ? PRODUCTION_URL : SANDBOX_URL;
  return { partnerId, apiKey, baseUrl };
}

/**
 * Smile ID v2 request signature:
 *   base64( HMAC-SHA256( timestamp + partner_id + "sid_request", api_key ) )
 * Exported for unit testing (pure and deterministic given its inputs).
 */
export function computeSignature(apiKey: string, partnerId: string, timestamp: string): string {
  return crypto
    .createHmac("sha256", apiKey)
    .update(timestamp)
    .update(partnerId)
    .update("sid_request")
    .digest("base64");
}

/** Splits a full legal name into first / last for the provider payload. */
export function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] ?? "", last: parts[0] ?? "" };
  return { first: parts[0], last: parts[parts.length - 1] };
}

export interface VerifyNinInput {
  nationalId: string;
  fullName: string;
  dob: string; // YYYY-MM-DD
  userId: string;
}

const NOT_CONFIGURED: KycVerificationResult = {
  configured: false,
  verified: false,
  status: "pending",
  provider: "none",
};

/**
 * Attempts to verify a Uganda NIN with Smile ID. Never throws — on missing
 * config, network failure, or a non-OK response it resolves to a "pending"
 * result so the KYC submission still records for manual review.
 */
export async function verifyNinWithSmileId(input: VerifyNinInput): Promise<KycVerificationResult> {
  const config = readConfig();
  if (!config) return NOT_CONFIGURED;

  const timestamp = new Date().toISOString();
  const signature = computeSignature(config.apiKey, config.partnerId, timestamp);
  const { first, last } = splitName(input.fullName);

  const payload = {
    partner_id: config.partnerId,
    timestamp,
    signature,
    country: "UG",
    id_type: "NATIONAL_ID",
    id_number: input.nationalId,
    first_name: first,
    last_name: last,
    dob: input.dob,
    partner_params: {
      user_id: input.userId,
      job_id: `kyc-${input.userId}-${Date.now()}`,
      job_type: 5, // Enhanced KYC (ID lookup)
    },
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(`${config.baseUrl}/v1/id_verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      return {
        configured: true,
        verified: false,
        status: "pending",
        provider: "smile-id",
        detail: `Smile ID returned HTTP ${res.status}`,
      };
    }

    const data = (await res.json()) as {
      ResultCode?: string;
      ResultText?: string;
      Actions?: { Verify_ID_Number?: string };
      SmileJobID?: string;
    };

    const verified = data.Actions?.Verify_ID_Number === "Verified";
    return {
      configured: true,
      verified,
      status: verified ? "verified" : "pending",
      provider: "smile-id",
      reference: data.SmileJobID,
      detail: data.ResultText,
    };
  } catch (err) {
    return {
      configured: true,
      verified: false,
      status: "pending",
      provider: "smile-id",
      detail: err instanceof Error ? err.message : "Smile ID request failed",
    };
  }
}
