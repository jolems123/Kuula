import { ArrowLeft, Lock, Smartphone } from "lucide-react";
import { useState, useEffect } from "react";
import { useAppContext } from "../../context/AppContext";
import { api } from "../../api/client";
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

  const canPay = !loading && !dataLoading && !dataError && outstanding != null && amount != null && Number.isFinite(amount) && amount > 0 && amount <= outstanding;

  const pay = async () => {
    if (!canPay || !token || outstanding == null || amount == null) return;
    const amt = Math.round(amount);
    const out = outstanding;
    setLoading(true);
    setPayError("");
    try {
      const isPartial = amt < out;
      const res = await api.payRepayment(token, isPartial ? amt : undefined);
      if ("isPending" in res && res.isPending) {
        setLastPayment({
          amount: typeof res.amount === "number" ? res.amount : amt,
          reference: String(res.reference ?? res.uuid ?? "—"),
          method: "Verified Mobile Money",
          status: "Pending provider confirmation",
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
        <button aria-label="Back to credit details" onClick={() => onNavigate("loan-detail")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.16)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>Make Repayment</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 130px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ background: "#EEF7F2", borderRadius: 16, padding: "16px", border: "1px solid #C9E2D4" }}>
          {dataLoading ? (
            <p style={{ fontSize: 14, color: "#374151", fontWeight: 600, margin: 0 }}>Loading your current balance…</p>
          ) : dataError ? (
            <p role="alert" style={{ fontSize: 13, color: "#B42318", fontWeight: 700, margin: 0 }}>{dataError}</p>
          ) : outstanding == null ? (
            <p style={{ fontSize: 14, color: "#0B5E3A", fontWeight: 700, margin: 0 }}>You do not have an outstanding repayment.</p>
          ) : (
            <>
              <p style={{ fontSize: 12, color: "#4B5F54", fontWeight: 600, margin: 0 }}>Outstanding Balance</p>
              <p style={{ fontSize: 30, fontWeight: 900, color: "#0B5E3A", margin: "4px 0 0" }}>{ugx(outstanding)}</p>
              {collection && <p style={{ fontSize: 11, color: "#52645B", margin: "9px 0 0", fontWeight: 600 }}>{collection}</p>}
            </>
          )}
        </div>

        {outstanding != null && (
          <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#374151", margin: "0 0 12px" }}>Repayment amount</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {quickAmounts.map((amt) => (
                <button key={amt} onClick={() => setAmount(amt)} style={{ padding: "8px 12px", borderRadius: 10, border: amount === amt ? "1px solid #0B5E3A" : "1px solid #E2E8E4", cursor: "pointer", fontSize: 12, fontWeight: 600, background: amount === amt ? "#EDF8F2" : "#F8FAF9", color: amount === amt ? "#0B5E3A" : "#374151" }}>
                  {amt === outstanding ? `Full · ${ugx(amt)}` : ugx(amt)}
                </button>
              ))}
            </div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Custom amount</label>
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
            {amount != null && (amount <= 0 || amount > outstanding) && <p style={{ fontSize: 11, color: "#B42318", margin: "6px 0 0" }}>Enter a positive amount no greater than the outstanding balance.</p>}
          </div>
        )}

        <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: "#EEF7F2", display: "grid", placeItems: "center" }}><Smartphone size={20} color="#0B5E3A" /></div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#1F2937", margin: 0 }}>Verified Mobile Money</p>
              <p style={{ fontSize: 11, color: "#6B7D73", margin: "2px 0 0" }}>Kuula sends the collection prompt only to {maskPhone(state.user?.phone)}.</p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", borderRadius: 10, background: "#F0FDF4", border: "1px solid #B7DEC9" }}>
          <Lock size={14} color="#0B5E3A" style={{ marginTop: 1 }} />
          <span style={{ fontSize: 11, lineHeight: 1.5, color: "#37644F" }}>Starting a collection does not mark your repayment paid. Kuula updates your balance only after the payment provider confirms settlement.</span>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 16px 36px", background: "white", borderTop: "1px solid #E8EEEA" }}>
        {payError && <p role="alert" style={{ fontSize: 12, color: "#B42318", fontWeight: 600, textAlign: "center", margin: "0 0 8px" }}>{payError}</p>}
        <button onClick={() => { void pay(); }} disabled={!canPay} style={{ width: "100%", height: 52, borderRadius: 14, background: "#0B5E3A", color: "white", fontSize: 16, fontWeight: 700, border: "none", cursor: canPay ? "pointer" : "not-allowed", opacity: canPay ? 1 : 0.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          {loading ? "Starting Mobile Money prompt…" : amount != null ? `Pay ${ugx(amount)}` : "Pay"}
        </button>
      </div>
    </div>
  );
}
