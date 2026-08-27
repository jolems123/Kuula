import crypto from "node:crypto";

export type KycVerificationStatus =
  | "verified"
  | "rejected"
  | "unavailable"
  | "not_configured";

export interface KycVerificationResult {
  configured: boolean;
  verified: boolean;
  status: KycVerificationStatus;
  provider: "smile-id" | "none";
  reference?: string;
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
  const baseUrl = process.env.SMILE_ENV?.trim() === "production"
    ? PRODUCTION_URL
    : SANDBOX_URL;
  return { partnerId, apiKey, baseUrl };
}

export function smileIdConfigured(): boolean {
  return readConfig() !== null;
}

export function computeSignature(apiKey: string, partnerId: string, timestamp: string): string {
  return crypto
    .createHmac("sha256", apiKey)
    .update(timestamp)
    .update(partnerId)
    .update("sid_request")
    .digest("base64");
}

export function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] ?? "", last: parts[0] ?? "" };
  return { first: parts[0], last: parts[parts.length - 1] };
}

export interface VerifyNinInput {
  nationalId: string;
  secondaryIdNumber: string;
  fullName: string;
  dob: string;
  userId: string;
}

export async function verifyNinWithSmileId(input: VerifyNinInput): Promise<KycVerificationResult> {
  const config = readConfig();
  if (!config) {
    return {
      configured: false,
      verified: false,
      status: "not_configured",
      provider: "none",
      detail: "Smile ID is not configured",
    };
  }

  const timestamp = new Date().toISOString();
  const signature = computeSignature(config.apiKey, config.partnerId, timestamp);
  const payload = {
    source_sdk: "rest_api",
    source_sdk_version: "2.0.0",
    partner_id: config.partnerId,
    timestamp,
    signature,
    country: "UG",
    id_type: "NATIONAL_ID_NO_PHOTO",
    id_number: input.nationalId,
    secondary_id_number: input.secondaryIdNumber,
    dob: input.dob,
    partner_params: {
      user_id: input.userId,
      job_id: `kyc-${input.userId}-${Date.now()}`,
    },
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const response = await fetch(`${config.baseUrl}/v2/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      return {
        configured: true,
        verified: false,
        status: "unavailable",
        provider: "smile-id",
        detail: `Smile ID returned HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as {
      ResultCode?: string;
      ResultText?: string;
      Actions?: { Verify_ID_Number?: string };
      SmileJobID?: string;
    };
    const action = data.Actions?.Verify_ID_Number?.trim() || "";

    if (action.toLowerCase() === "verified" || data.ResultCode === "1020") {
      return {
        configured: true,
        verified: true,
        status: "verified",
        provider: "smile-id",
        reference: data.SmileJobID,
        detail: data.ResultText || action,
      };
    }

    if (action) {
      return {
        configured: true,
        verified: false,
        status: "rejected",
        provider: "smile-id",
        reference: data.SmileJobID,
        detail: data.ResultText || action,
      };
    }

    return {
      configured: true,
      verified: false,
      status: "unavailable",
      provider: "smile-id",
      reference: data.SmileJobID,
      detail: data.ResultText || `Smile ID response did not contain a verification decision (${data.ResultCode || "no result code"})`,
    };
  } catch (error) {
    return {
      configured: true,
      verified: false,
      status: "unavailable",
      provider: "smile-id",
      detail: error instanceof Error ? error.message : "Smile ID request failed",
    };
  }
}
