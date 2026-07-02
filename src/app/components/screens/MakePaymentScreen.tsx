import { ArrowLeft, Lock } from "lucide-react";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAppContext } from "../../context/AppContext";
import { api } from "../../api/client";
import { env } from "../../config/env";
import { setLastPayment } from "../../lib/selection";

interface Props { onNavigate: (s: string) => void; }

function ugx(n: number) { return "UGX " + n.toLocaleString(); }

const METHODS = [
  { id: "mtn", label: "MTN MoMo", logo: "🟡", number: "+256 770 123 456" },
  { id: "airtel", label: "Airtel Money", logo: "🔴", number: "+256 752 987 654" },
  { id: "bank", label: "Stanbic Bank", logo: "🏦", number: "Acc: ****4532" },
];

export function MakePaymentScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const { state } = useAppContext();
  const token = state.session.token;
  const useServer = env.USE_API && !!token;

  const [method, setMethod] = useState("mtn");
  // Real money: never seed placeholder figures. In server mode the amounts stay
  // null until getRepayment returns the borrower's real balance; only the
  // offline demo build keeps illustrative defaults.
  const [amount, setAmount] = useState<number | null>(useServer ? null : 92083);
  const [outstanding, setOutstanding] = useState<number | null>(useServer ? null : 276249);
  const [collection, setCollection] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(useServer);
  const [dataError, setDataError] = useState(false);
  const [payError, setPayError] = useState(false);

  useEffect(() => {
    if (!useServer || !token) return;
    let active = true;
    setDataLoading(true);
    setDataError(false);
    api.getRepayment(token)
      .then(({ repayment }) => {
        if (!active) return;
        if (!repayment) {
          // No outstanding repayment — nothing to pay (not an error).
          setOutstanding(null);
          setAmount(null);
          return;
        }
        const total = Number(repayment.total ?? 0);
        const paid = Number(repayment.amountPaid ?? 0);
        const due = Math.max(0, total - paid);
        setOutstanding(due);
        setAmount(due);
        setCollection(repayment.collection?.label ?? null);
      })
      .catch(() => { if (active) setDataError(true); })
      .finally(() => { if (active) setDataLoading(false); });
    return () => { active = false; };
  }, [useServer, token]);

  const minDue = outstanding != null ? Math.round(outstanding / 3) : 0;
  // amount must not exceed the real balance, so the button label (which shows
  // the entered amount) always matches what is actually charged.
  const canPay = !loading && !dataLoading && !dataError && outstanding != null && amount != null && amount > 0 && amount <= outstanding;

  const pay = async () => {
    if (loading) return; // guard against double-submit on real money
    if (useServer && token) {
      // Never send a collection when the balance failed to load or is missing —
      // that would be charging against fabricated numbers.
      if (dataError || outstanding == null || amount == null || amount <= 0 || amount > outstanding) return;
      const amt = amount;
      const out = outstanding;
      setLoading(true);
      setPayError(false);
      try {
        const isPartial = amt < out;
        const res = await api.payRepayment(token, isPartial ? amt : undefined);
        setLoading(false);
        // Only advance to the "approve on your phone" screen when a collection
        // prompt was actually sent. status "none"/"failed" means nothing was
        // requested, so we must surface a visible failure rather than stay silent.
        if ("isPending" in res && res.isPending) {
          setLastPayment({
            amount: typeof res.amount === "number" ? res.amount : (isPartial ? amt : out),
            reference: String(res.reference ?? res.uuid ?? "—"),
            method: METHODS.find((m) => m.id === method)?.label ?? method,
            status: "Pending approval",
            dateISO: new Date().toISOString(),
          });
          onNavigate("payment-confirm");
        } else {
          setPayError(true);
        }
        return;
      } catch {
        setLoading(false);
        setPayError(true);
        return;
      }
    }
    // Offline demo path only.
    if (amount == null) return;
    const amt = amount;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setLastPayment({
        amount: amt,
        reference: "KUL" + Math.floor(Math.random() * 900000 + 100000),
        method: METHODS.find((m) => m.id === method)?.label ?? method,
        status: "Pending approval",
        dateISO: new Date().toISOString(),
      });
      onNavigate("payment-confirm");
    }, 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F9FAFB", paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 14px", background: "linear-gradient(135deg, #0D5C3A, #0A4A2E)" }}>
        <button onClick={() => onNavigate("loan-detail")} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} color="white" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>{t("makePayment.title")}</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 130px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Outstanding summary */}
        <div style={{ background: "linear-gradient(135deg, #ECF5F0, #D2E9DD)", borderRadius: 16, padding: "16px", border: "1px solid #B6DCC8" }}>
          {dataLoading ? (
            <p style={{ fontSize: 14, color: "#157A4E", fontWeight: 600, margin: 0 }}>{t("common.loading")}…</p>
          ) : dataError ? (
            <p style={{ fontSize: 14, color: "#EF4444", fontWeight: 700, margin: 0 }}>{t("makePayment.loadError")}</p>
          ) : outstanding == null ? (
            <p style={{ fontSize: 14, color: "#0A4A2E", fontWeight: 700, margin: 0 }}>{t("makePayment.noActiveLoan")}</p>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontSize: 12, color: "#157A4E", fontWeight: 600, margin: 0 }}>{t("makePayment.outstandingBalance")}</p>
                  <p style={{ fontSize: 28, fontWeight: 900, color: "#0A4A2E", margin: "4px 0 0" }}>{ugx(outstanding)}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 11, color: "#157A4E", margin: 0 }}>{t("makePayment.minDue")}</p>
                  <p style={{ fontSize: 16, fontWeight: 800, color: "#EF4444", margin: "2px 0 0" }}>{ugx(minDue)}</p>
                </div>
              </div>
              {collection && (
                <p style={{ fontSize: 11, color: "#0D5C3A", margin: "10px 0 0", fontWeight: 600 }}>
                  {t("makePayment.autoCollection", { name: collection })}
                </p>
              )}
            </>
          )}
        </div>

        {/* Amount selector — only when there is a real balance to pay */}
        {outstanding != null && (
          <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 12 }}>{t("makePayment.paymentAmount")}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {[minDue, outstanding, Math.round(outstanding / 2)].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setAmount(amt)}
                  style={{
                    padding: "8px 12px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                    background: amount === amt ? "#0D5C3A" : "#F3F4F6",
                    color: amount === amt ? "white" : "#374151",
                  }}
                >
                  {amt === minDue ? `${t("makePayment.minDue")} · ${ugx(amt)}` : amt === outstanding ? `${t("makePayment.fullAmount")} · ${ugx(amt)}` : `${t("makePayment.half")} · ${ugx(amt)}`}
                </button>
              ))}
            </div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>{t("makePayment.customAmount")}</label>
            <input
              type="number"
              value={amount ?? ""}
              onChange={(e) => setAmount(e.target.value === "" ? null : Number(e.target.value))}
              style={{ width: "100%", height: 50, borderRadius: 12, border: "1.5px solid #E5E7EB", padding: "0 16px", fontSize: 18, fontWeight: 800, color: "#0D5C3A", background: "#F9FAFB", outline: "none", boxSizing: "border-box" }}
            />
          </div>
        )}

        {/* Payment method */}
        <div style={{ background: "white", borderRadius: 16, padding: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 12 }}>{t("makePayment.payWith")}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {METHODS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, border: `2px solid ${method === m.id ? "#0D5C3A" : "#E5E7EB"}`, background: method === m.id ? "#ECF5F0" : "#F9FAFB", cursor: "pointer", textAlign: "left" }}
              >
                <span style={{ fontSize: 24 }}>{m.logo}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#1F2937", margin: 0 }}>{m.label}</p>
                  <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{m.number}</p>
                </div>
                <div style={{ width: 18, height: 18, borderRadius: 9, border: `2px solid ${method === m.id ? "#0D5C3A" : "#D1D5DB"}`, background: method === m.id ? "#0D5C3A" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {method === m.id && <div style={{ width: 7, height: 7, borderRadius: 4, background: "white" }} />}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, background: "#F0FDF4", border: "1px solid #A7F3D0" }}>
          <Lock size={14} color="#10B981" />
          <span style={{ fontSize: 11, color: "#065F46" }}>{t("makePayment.secured")}</span>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 16px 36px", background: "white", borderTop: "1px solid #F3F4F6" }}>
        {payError && (
          <p style={{ fontSize: 12, color: "#EF4444", fontWeight: 600, textAlign: "center", margin: "0 0 8px" }}>{t("makePayment.paymentFailed")}</p>
        )}
        <button
          onClick={pay}
          disabled={!canPay}
          style={{ width: "100%", height: 52, borderRadius: 14, background: "linear-gradient(135deg, #0D5C3A, #0A4A2E)", color: "white", fontSize: 16, fontWeight: 700, border: "none", cursor: canPay ? "pointer" : "not-allowed", opacity: canPay ? 1 : 0.5, boxShadow: "0 4px 16px rgba(13,92,58,0.3)", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
        >
          {loading
            ? <><div style={{ width: 20, height: 20, border: "2.5px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />{t("common.processing")}</>
            : amount != null ? `${t("makePayment.payButton")} ${ugx(amount)}` : t("makePayment.payButton")}
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
