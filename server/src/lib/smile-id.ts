import crypto from "node:crypto";

/**
 * Smile ID Document Verification (v3).
 *
 * Customers prove their identity with the PHOTO of their national ID: the
 * hosted Smile ID web flow captures the document, a selfie, and a liveness
 * sequence; Smile ID authenticates the document, OCRs the printed NIN/name/
 * birth date, and matches the document portrait against the live selfie.
 *
 * The flow is asynchronous:
 *   1. The server mints a short-lived v3 token (POST /v3/token) bound to the
 *      customer, the job id, and our webhook callback URL. The long-lived API
 *      key never leaves the server.
 *   2. The browser runs the hosted capture with that token.
 *   3. Smile ID POSTs the verdict to our webhook; `routes/kyc.ts` settles the
 *      KycSubmission from it.
 */

export type DocumentVerificationStatus = "clear" | "attention" | "block" | "error";

interface SmileConfig {
  partnerId: string;
  apiKey: string;
  baseUrl: string;
  environment: "sandbox" | "production";
  callbackUrl: string;
  privacyPolicyUrl: string;
}

const SANDBOX_URL = "https://testapi.smileidentity.com";
const PRODUCTION_URL = "https://api.smileidentity.com";
const DEFAULT_PRIVACY_URL = "https://kuulapp.com/privacy";

function readConfig(): SmileConfig | null {
  const partnerId = process.env.SMILE_PARTNER_ID?.trim() || process.env.SMILE_IDENTITY_PARTNER_ID?.trim() || "";
  const apiKey = process.env.SMILE_API_KEY?.trim() || process.env.SMILE_IDENTITY_AUTH_TOKEN?.trim() || "";
  if (!partnerId || !apiKey) return null;
  const environment = process.env.SMILE_ENV?.trim() === "production" ? "production" : "sandbox";
  const baseUrl = environment === "production" ? PRODUCTION_URL : SANDBOX_URL;

  const publicBase = (process.env.PUBLIC_API_BASE_URL?.trim() || process.env.PUBLIC_API_URL?.trim() || "").replace(/\/+$/, "");
  const callbackUrl = process.env.SMILE_CALLBACK_URL?.trim()
    || (publicBase ? `${publicBase}/api/kyc/smile-webhook` : "");

  return {
    partnerId,
    apiKey,
    baseUrl,
    environment,
    callbackUrl,
    privacyPolicyUrl: process.env.SMILE_PRIVACY_POLICY_URL?.trim() || DEFAULT_PRIVACY_URL,
  };
}

export function smileIdConfigured(): boolean {
  const config = readConfig();
  return Boolean(config && config.callbackUrl);
}

/** HMAC-SHA256 request signature, shared by legacy calls and webhook checks. */
export function computeSignature(apiKey: string, partnerId: string, timestamp: string): string {
  return crypto
    .createHmac("sha256", apiKey)
    .update(timestamp)
    .update(partnerId)
    .update("sid_request")
    .digest("base64");
}

/**
 * Verify a Smile ID webhook: Response-Signature is Base64(HMAC-SHA256(apiKey,
 * Response-Timestamp + partnerId + "sid_request")).
 */
export function verifyWebhookSignature(timestamp: string, signature: string): boolean {
  const config = readConfig();
  if (!config || !timestamp || !signature) return false;
  const expected = Buffer.from(computeSignature(config.apiKey, config.partnerId, timestamp), "utf8");
  const supplied = Buffer.from(signature, "utf8");
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

export function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] ?? "", last: parts[0] ?? "" };
  // Smile ID's `given_names` is every name before the surname, not just the first.
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

export interface MintTokenInput {
  userId: string;
  jobId: string;
  fullName: string;
  phone: string;
  nationalId: string;
}

export interface MintedToken {
  token: string;
  environment: "sandbox" | "production";
  callbackUrl: string;
  partnerId: string;
  privacyPolicyUrl: string;
  /** The same details bound into the token, so the hosted flow can skip its details form. */
  userDetails: { given_names: string; last_name: string; phone_number: string };
}

/**
 * Mint a short-lived v3 token for one document-verification session. The
 * customer's PII and the callback URL are bound into the token server-side so
 * the browser cannot alter them.
 */
export async function mintDocumentVerificationToken(input: MintTokenInput): Promise<MintedToken> {
  const config = readConfig();
  if (!config) throw new Error("Smile ID is not configured");
  if (!config.callbackUrl) throw new Error("A public API base URL is required for the Smile ID callback");

  const { first, last } = splitName(input.fullName);
  const form = new FormData();
  // The v3 token endpoint currently accepts `document_verification`.
  form.set("product", "document_verification");
  form.set("user_id", input.userId);
  // `kuula_reference` is our own correlation key: Smile ID generates its own
  // job_id/user_id and may report those under the same names on the webhook.
  form.set("partner_params", JSON.stringify({ kuula_reference: input.jobId, job_id: input.jobId, user_id: input.userId, job_type: "6" }));
  // The sandbox only answers for Smile ID's published test identities, matched
  // on names + email, and echoes the submitted ID number back as the result.
  // Kuula customers have no email, so derive the test address from the name.
  const sandboxOnly = config.environment === "sandbox"
    ? {
      email: `${first.split(" ")[0]}.${last}@example.com`.toLowerCase(),
      id_number: input.nationalId,
    }
    : {};
  form.set("payload", JSON.stringify({
    country: "UG",
    given_names: first,
    last_name: last,
    phone_number: input.phone,
    ...sandboxOnly,
    callback_url: config.callbackUrl,
    consent: {
      granted: true,
      granted_at: new Date().toISOString(),
      notice_language: "EN",
      notice_privacy_policy_url: config.privacyPolicyUrl,
    },
  }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${config.baseUrl}/v3/token`, {
      method: "POST",
      headers: {
        "smileid-partner-id": config.partnerId,
        "smileid-api-key": config.apiKey,
      },
      body: form,
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => ({}))) as { token?: string; message?: string };
    if (!response.ok || !data.token) {
      throw new Error(data.message || `Smile ID token request failed (HTTP ${response.status})`);
    }
    return {
      token: data.token,
      environment: config.environment,
      callbackUrl: config.callbackUrl,
      partnerId: config.partnerId,
      privacyPolicyUrl: config.privacyPolicyUrl,
      userDetails: { given_names: first, last_name: last, phone_number: input.phone },
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Shape of the document-verification webhook payload we consume. */
export interface DocumentVerificationWebhook {
  status?: DocumentVerificationStatus;
  ResultCode?: string;
  ResultText?: string;
  SmileJobID?: string;
  message?: string;
  reason?: string | null;
  product?: string;
  completed_at?: string;
  job_id?: string;
  user_id?: string;
  partner_params?: { kuula_reference?: string; job_id?: string; user_id?: string };
  PartnerParams?: { job_id?: string; user_id?: string; job_type?: string | number };
  id_fields?: {
    full_name?: string | null;
    id_number?: string | null;
    date_of_birth?: string | null;
    id_type?: string | null;
    expiration_date?: string | null;
  } | null;
  image_links?: {
    selfie_image?: string;
    id_card_image?: string;
    id_card_back_image?: string;
  } | null;
  kyc_receipt?: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The Kuula user a webhook is about, when Smile ID reports the user id we bound
 * into the token. Used to settle a verdict whose job reference was replaced by
 * Smile ID's own generated id.
 */
export function webhookKuulaUserId(payload: DocumentVerificationWebhook): string {
  const candidates = [payload.partner_params?.user_id, payload.user_id, payload.PartnerParams?.user_id];
  return candidates.find((value): value is string => typeof value === "string" && UUID_PATTERN.test(value)) ?? "";
}

export function normalizeDocumentVerificationWebhook(payload: DocumentVerificationWebhook) {
  const jobId = payload.partner_params?.kuula_reference || payload.partner_params?.job_id || payload.PartnerParams?.job_id || "";
  const status = payload.status
    || (payload.ResultCode === "0810" ? "clear" : payload.ResultCode ? "block" : "error");
  return {
    jobId,
    status,
    message: payload.message || payload.ResultText || payload.reason || `Verification ${status}`,
  } as const;
}
