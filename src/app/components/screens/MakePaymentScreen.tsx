import { UiText, uiText } from "../../../i18n/ui-text";
import { ArrowLeft, Lock, Smartphone } from "lucide-react";
import { useState, useEffect } from "react";
import { useAppContext } from "../../context/AppContext";
import { api, type PaymentQuote } from "../../api/client";
import { env } from "../../config/env";
import { setLastPayment } from "../../lib/selection";

interface Props { onNavigate: (s: string) => void; }

function ugx(n: number) { return "UGX " + Math.round(n).toLocaleString("en-UG"); }
function maskPhone(phone: string | null | undefined) {
  if (!phone || phone.length < 7) return "your verified account phone";
  return `${phone.slice(0, 4)}••••${phone.slice(-3)}`;
}

export function MakePaymentScreen({ onNavigate }: Props) {
  const { state } = useAppContext();
  const token = state.session.token;
  const useServer = env.USE_API && !!token;

  const [amount, setAmount] = useState<number | null>(useServer ? null : 100_000);
  const [outstanding, setOutstanding] = useState<number | null>(useServer ? null : 300_000);
  const [collection, setCollection] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(useServer);
  const [dataError, setDataError] = useState("");
  const [payError, setPayError] = useState("");
  const [quote, setQuote] = useState<PaymentQuote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  useEffect(() => {
    setQuote(null); setQuoteError("");
    if (!token || amount == null || !Number.isSafeInteger(amount) || amount <= 0 || outstanding == null || amount > outstanding) return;
    let active = true;
    const timer = window.setTimeout(() => {
      api.quoteRepayment(token, amount).then(result => { if (active) setQuote(result); })
        .catch(error => { if (active) setQuoteError(error instanceof Error ? error.message : "Could not verify payment fees"); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [token, amount, outstanding]);

  useEffect(() => {
    if (!useServer || !token) return;
    let active = true;
    setDataLoading(true);
    setDataError("");
    api.getRepayment(token)
      .then(({ repayment }) => {
        if (!active) return;
        if (!repayment) {
          setOutstanding(null);
          setAmount(null);
          setCollection(null);
          return;
        }
        const total = Number(repayment.total ?? 0);
        const paid = Number(repayment.amount_paid ?? 0);
        const due = Math.max(0, total - paid);
        setOutstanding(due > 0 ? due : null);
        setAmount(due > 0 ? due : null);
        setCollection(repayment.collection?.label ?? null);
      })
      .catch((err) => { if (active) setDataError(err instanceof Error ? err.message : "Could not load your repayment balance."); })
      .finally(() => { if (active) setDataLoading(false); });
    return () => { active = false; };
  }, [useServer, token]);

  const canPay = quote != null && quote.loanCredit === amount && !quoteError && !loading && !dataLoading && !dataError && outstanding != null && amount != null && Number.isFinite(amount) && amount > 0 && amount <= outstanding;

  const pay = async () => {
    if (!canPay || !quote || !token || outstanding == null || amount == null) return;
    const amt = Math.round(amount);

    setLoading(true);
    setPayError("");
    try {

      const res = await api.payRepayment(token, amt, { policyVersion: quote.policyVersion, totalDebit: quote.totalDebit });
      if ("isPending" in res && res.isPending) {
        setLastPayment({
          amount: typeof res.amount === "number" ? res.amount : quote.totalDebit,
          reference: String(res.reference ?? res.uuid ?? "—"),
          method: "Verified Mobile Money",
          status: typeof res.message === "string" && res.message ? res.message : "Pending provider confirmation",
          dateISO: new Date().toISOString(),
        });
        onNavigate("payment-confirm");
      } else {
        setPayError("Kuula did not start a Mobile Money collection. Your balance has not been changed.");
      }
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Could not start the repayment collection. No repayment has been recorded.");
    } finally {
      setLoading(false);
    }
  };

  const quickAmounts = outstanding == null
    ? []
    : Array.from(new Set([
        Math.max(1, Math.round(outstanding / 4)),
        Math.max(1, Math.round(outstanding / 2)),
        outstanding,
      ])).sort((a, b) => a - b);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F8FAF9", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "#0B5E3A" }}>
        <button aria-label={uiText("Back to credit details")} onClick={() => onNavigate("loan-detail")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.16)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}><UiText text={"Make Repayment"} /></span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 130px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ background: "#EEF7F2", borderRadius: 16, padding: "16px", border: "1px solid #C9E2D4" }}>
          {dataLoading ? (
            <p style={{ fontSize: 14, color: "#374151", fontWeight: 600, margin: 0 }}><UiText text={"Loading your current balance…"} /></p>
          ) : dataError ? (
            <p role="alert" style={{ fontSize: 13, color: "#B42318", fontWeight: 700, margin: 0 }}>{dataError}</p>
          ) : outstanding == null ? (
            <p style={{ fontSize: 14, color: "#0B5E3A", fontWeight: 700, margin: 0 }}><UiText text={"You do not have an outstanding repayment."} /></p>
          ) : (
            <>
              <p style={{ fontSize: 12, color: "#4B5F54", fontWeight: 600, margin: 0 }}><UiText text={"Outstanding Balance"} /></p>
              <p style={{ fontSize: 30, fontWeight: 900, color: "#0B5E3A", margin: "4px 0 0" }}>{ugx(outstanding)}</p>
              {collection && <p style={{ fontSize: 11, color: "#52645B", margin: "9px 0 0", fontWeight: 600 }}>{collection}</p>}
            </>
          )}
        </div>

        {outstanding != null && (
          <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#374151", margin: "0 0 12px" }}><UiText text={"Repayment amount"} /></p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {quickAmounts.map((amt) => (
                <button key={amt} onClick={() => setAmount(amt)} style={{ padding: "8px 12px", borderRadius: 10, border: amount === amt ? "1px solid #0B5E3A" : "1px solid #E2E8E4", cursor: "pointer", fontSize: 12, fontWeight: 600, background: amount === amt ? "#EDF8F2" : "#F8FAF9", color: amount === amt ? "#0B5E3A" : "#374151" }}>
                  {amt === outstanding ? `Full · ${ugx(amt)}` : ugx(amt)}
                </button>
              ))}
            </div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}><UiText text={"Custom amount"} /></label>
            <input
              inputMode="numeric"
              type="number"
              min={1}
              max={outstanding}
              step={500}
              value={amount ?? ""}
              onChange={(e) => setAmount(e.target.value === "" ? null : Number(e.target.value))}
              style={{ width: "100%", height: 50, borderRadius: 12, border: "1.5px solid #DCE6E0", padding: "0 16px", fontSize: 18, fontWeight: 800, color: "#0B5E3A", background: "#F8FAF9", outline: "none", boxSizing: "border-box" }}
            />
            {amount != null && (amount <= 0 || amount > outstanding) && <p style={{ fontSize: 11, color: "#B42318", margin: "6px 0 0" }}><UiText text={"Enter a positive amount no greater than the outstanding balance."} /></p>}
          </div>
        )}

        <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: "#EEF7F2", display: "grid", placeItems: "center" }}><Smartphone size={20} color="#0B5E3A" /></div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#1F2937", margin: 0 }}><UiText text={"Verified Mobile Money"} /></p>
              <p style={{ fontSize: 11, color: "#6B7D73", margin: "2px 0 0" }}><UiText text={"Kuula sends the collection prompt only to "} />{maskPhone(state.user?.phone)}.</p>
            </div>
          </div>
        </div>

        {amount != null && outstanding != null && <div style={{ padding: 16, background: "white", borderRadius: 16 }} aria-live="polite">
          <strong>Payment breakdown</strong>
          {quote && quote.loanCredit === amount ? <>
            <p>Applied to loan: {ugx(quote.loanCredit)}</p>
            <p>Mobile-money collection fee: {ugx(quote.customerFee)}</p>
            <p><strong>Total deducted from your phone: {ugx(quote.totalDebit)}</strong></p>
            <p style={{ fontSize: 12 }}>The provider deducts its fee from the total collected. Only {ugx(quote.loanCredit)} reduces your loan. Any confirmed fee saving is held for your refund; a higher provider cost is absorbed by Kuula.</p>
          </> : <p role={quoteError ? "alert" : undefined}>{quoteError || "Calculating provider fees…"}</p>}
        </div>}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", borderRadius: 10, background: "#F0FDF4", border: "1px solid #B7DEC9" }}>
          <Lock size={14} color="#0B5E3A" style={{ marginTop: 1 }} />
          <span style={{ fontSize: 11, lineHeight: 1.5, color: "#37644F" }}><UiText text={"Starting a collection does not mark your repayment paid. Kuula updates your balance only after the payment provider confirms settlement."} /></span>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 16px 36px", background: "white", borderTop: "1px solid #E8EEEA" }}>
        {payError && <p role="alert" style={{ fontSize: 12, color: "#B42318", fontWeight: 600, textAlign: "center", margin: "0 0 8px" }}>{payError}</p>}
        <button onClick={() => { void pay(); }} disabled={!canPay} style={{ width: "100%", height: 52, borderRadius: 14, background: "#0B5E3A", color: "white", fontSize: 16, fontWeight: 700, border: "none", cursor: canPay ? "pointer" : "not-allowed", opacity: canPay ? 1 : 0.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <UiText text={loading ? "Starting Mobile Money prompt…" : quote && quote.loanCredit === amount ? `Pay ${ugx(quote.totalDebit)} including fee` : "Pay"} />
        </button>
      </div>
    </div>
  );
}
