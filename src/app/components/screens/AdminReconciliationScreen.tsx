import { useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import { useAppContext } from "../../context/AppContext";
import { formatUGX } from "../../lib/export";
import { AdminCard, AdminLayout, AdminPageHeader, StatusBadge } from "../AdminLayout";

interface Props { onNavigate: (screen: string) => void }
type Row = Record<string, unknown>;

export function AdminReconciliationScreen({ onNavigate }: Props) {
  const { state } = useAppContext(); const token = state.session.token;
  const [status, setStatus] = useState("open"); const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null); const [journal, setJournal] = useState<Record<string, unknown> | null>(null);
  const [note, setNote] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const load = async () => { if (!token) return; setLoading(true); try { setRows((await api.getReconciliationQueue(token, status)).transactions); setSelected(null); setError(""); } catch(e) { setError(e instanceof ApiError ? e.message : "Could not load reconciliation data."); } finally { setLoading(false); } };
  useEffect(()=>{ void load(); },[token,status]);
  const select = async (row: Row) => { setSelected(row); setJournal(null); if(token) try { setJournal((await api.getTransactionJournal(token,String(row.id))).journal); } catch(e) { setError(e instanceof Error ? e.message : "Could not load journal."); } };
  const [notice, setNotice] = useState("");
  type Payout = Awaited<ReturnType<typeof api.listPayoutsAwaitingRelease>>["payouts"][number];
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [releasing, setReleasing] = useState<string | null>(null);
  const loadPayouts = async () => { if (!token) return; try { setPayouts((await api.listPayoutsAwaitingRelease(token)).payouts); } catch { setPayouts([]); } };
  useEffect(() => { void loadPayouts(); }, [token]);
  const release = async (payout: Payout) => {
    if (!token || releasing) return;
    if (!window.confirm(`Release UGX ${payout.amount.toLocaleString()} to ${payout.applicantName} (${payout.phone})? This sends real money.`)) return;
    setReleasing(payout.applicationId); setError(""); setNotice("");
    try { const result = await api.releasePayout(token, payout.applicationId); setNotice(result.message); await Promise.all([loadPayouts(), load()]); }
    catch (e) { setError(e instanceof ApiError ? e.message : "The payout could not be released."); }
    finally { setReleasing(null); }
  };
  const verify = async () => {
    if (!token || !selected) return;
    setNotice(""); setError("");
    try {
      const result = await api.verifyReconciliationWithProvider(token, String(selected.id));
      if (result.lookup === "error") setError(`MarzPay could not be checked: ${result.message || "unknown error"}`);
      else if (result.lookup === "not_found") setNotice("MarzPay has no record of this transaction yet. Nothing was changed.");
      else if (result.settlement?.body.settled) setNotice(`MarzPay reports "${result.providerStatus}". The transaction has been settled accordingly.`);
      else setNotice(`MarzPay reports "${result.providerStatus}". ${String(result.settlement?.body.error || "No change was needed.")}`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Verification failed."); }
  };
  const review = async () => { if(!token||!selected||!note.trim()) { setError("Enter a reconciliation review note."); return; } try { await api.reviewReconciliation(token,String(selected.id),note.trim()); setNote(""); await load(); } catch(e) { setError(e instanceof Error ? e.message : "Review could not be saved."); } };
  return <AdminLayout activeScreen="admin-reconciliation" onNavigate={onNavigate} title="Reconciliation"><AdminPageHeader title="Financial reconciliation" subtitle="Provider transactions and immutable ledger journals"/><div style={{display:"flex",gap:8,marginBottom:14}}>{["open","awaiting_provider","reconciliation_required","reviewed","matched","all"].map(value=><button key={value} onClick={()=>setStatus(value)}>{value.replaceAll("_"," ")}</button>)}</div>{payouts.length>0&&<AdminCard><h3 style={{marginTop:0}}>Payouts awaiting release</h3><p style={{fontSize:12,color:"#64748B",marginTop:0}}>Approved loans the borrower has accepted. Releasing sends the money; it must be done by someone who did not review or approve the loan.</p>{payouts.map(p=><div key={p.batchId} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderTop:"1px solid #E2E8F0"}}><div style={{flex:1}}><strong>{p.applicantName}</strong><div style={{fontSize:12}}>{formatUGX(p.amount)} · {p.network.toUpperCase()} {p.phone} · {p.legs} transfer{p.legs===1?"":"s"}</div></div><button disabled={releasing!==null} onClick={()=>void release(p)}>{releasing===p.applicationId?"Releasing…":"Release payout"}</button></div>)}</AdminCard>}{error&&<p role="alert" style={{color:"#B91C1C"}}>{error}</p>}{notice&&<p role="status" style={{color:"#166534"}}>{notice}</p>}{loading?<AdminCard>Loading transactions…</AdminCard>:rows.length===0?<AdminCard>No transactions in this reconciliation state.</AdminCard>:<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}><AdminCard>{rows.map(row=><button key={String(row.id)} onClick={()=>void select(row)} style={{display:"block",width:"100%",textAlign:"left",padding:10,marginBottom:7,border:"1px solid #E2E8F0",borderRadius:9,background:"white"}}><strong>{String(row.reference)}</strong><div>{String(row.type)} · {formatUGX(Number(row.amount||0))}</div><StatusBadge status={String(row.reconciliationStatus||row.status)}/></button>)}</AdminCard><AdminCard>{!selected?"Select a transaction to inspect its journal.":<><h3>{String(selected.reference)}</h3><p>Provider: {String(selected.provider||"Not recorded")}</p><p>Provider status: {String(selected.providerStatus||"Not recorded")}</p><p>Journal: {journal ? "Posted and balanced record available" : "No posted journal"}</p>{selected.providerFee!=null&&<p>MarzPay charge: {formatUGX(Number(selected.providerFee))}</p>}{selected.provider==="marzpay"&&selected.status==="pending"&&<p><button onClick={()=>void verify()}>Check status with MarzPay</button></p>}{selected.reconciliationStatus==="reconciliation_required"&&<><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Required review note" style={{width:"100%",minHeight:80}}/><button onClick={()=>void review()}>Mark reviewed</button></>}</>}</AdminCard></div>}</AdminLayout>;
}
