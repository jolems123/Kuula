/**
 * Airtel Money Open API client (openapi.airtel.africa).
 *
 * Real-world flow:
 *   1. POST /auth/oauth2/token  → Bearer token (1h TTL)
 *   2. POST /standard/v1/disburse  → loan payout
 *   3. POST /standard/v1/collections  → repayment collection
 *
 * Same simulation fallback as MTN when credentials are absent.
 *
 * Refs: https://developers.airtel.africa/
 */
import { config } from "../config.js";
import { ApiError } from "../lib/errors.js";
import { MtnClient, mtn } from "./mtn.js";
import { randomInt } from "node:crypto";

const RETRY_DELAYS = [250, 750, 1500];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface ProviderResult {
  simulated: boolean;
  status: string;
  transaction_id: string;
}

function makeRef(prefix: string): string {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${prefix}-${d}-${randomInt(100000, 1000000)}`;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

export class AirtelClient {
  private cachedToken: CachedToken | null = null;

  constructor(private cfg = config.airtel) {}

  get configured(): boolean {
    return Boolean(this.cfg.clientId && this.cfg.clientSecret);
  }

  private async fetchToken(): Promise<string> {
    if (!this.configured) throw new ApiError(502, "Airtel Money not configured");
    const res = await fetch(`${this.cfg.baseUrl}/auth/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret, grant_type: "client_credentials" }),
    });
    if (!res.ok) throw new ApiError(502, `Airtel token failed (${res.status})`);
    const data = await res.json() as { access_token: string; expires_in: number };
    return data.access_token;
  }

  private async token(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60_000) {
      return this.cachedToken.token;
    }
    const token = await this.fetchToken();
    this.cachedToken = { token, expiresAt: Date.now() + 55 * 60 * 1000 };
    return token;
  }

  async disburse(phoneNumber: string, amount: number, reference: string): Promise<ProviderResult> {
    if (!this.configured) {
      return { simulated: true, status: "success", transaction_id: makeRef("AIRTEL") };
    }
    return this.call("/standard/v1/disburse", {
      payee: { msisdn: phoneNumber.replace(/\D/g, "") },
      amount: { amount: String(amount), currency: "UGX" },
      external_id: reference,
      reference: `Kuula loan ${reference}`,
    }, "AIRTEL");
  }

  async collect(phoneNumber: string, amount: number, transactionId: string): Promise<ProviderResult> {
    if (!this.configured) {
      return { simulated: true, status: "success", transaction_id: makeRef("AIRTEL") };
    }
    return this.call("/standard/v1/collections", {
      subscriber: { msisdn: phoneNumber.replace(/\D/g, "") },
      transaction: { amount: String(amount), currency: "UGX", id: transactionId },
      reference: `Kuula repayment ${transactionId}`,
    }, "AIRTEL");
  }

  private async call(path: string, body: unknown, refPrefix: string): Promise<ProviderResult> {
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      try {
        const token = await this.token();
        const res = await fetch(`${this.cfg.baseUrl}${path}`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "X-Country": "UG",
            "X-Currency": "UGX",
          },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({})) as { status?: { success?: boolean; code?: string; message?: string }; data?: { id?: string } };
        if (!res.ok) throw new Error(data.status?.message || `Airtel ${path} failed (${res.status})`);
        return { simulated: false, status: "success", transaction_id: data.data?.id ?? makeRef(refPrefix) };
      } catch (err) {
        lastErr = err as Error;
        if (attempt < RETRY_DELAYS.length - 1) await sleep(RETRY_DELAYS[attempt]);
      }
    }
    throw new ApiError(502, `Airtel Money unreachable: ${lastErr?.message ?? "unknown"}`);
  }
}

export const airtel = new AirtelClient();

/** Pick the provider for a disbursement_method value. */
export function providerFor(method: string): MtnClient | AirtelClient {
  if (method === "airtel_money") return airtel;
  return mtn; // mtn_momo and bank fall back to MTN rails for the demo
}