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
  type RefundData = Awaited<ReturnType<typeof api.listRefunds>>;
  const [refundData, setRefundData] = useState<RefundData>({ refunds: [], refundable: [] });
  const loadRefunds = async () => { if (!token) return; try { setRefundData(await api.listRefunds(token)); } catch { setRefundData({ refunds: [], refundable: [] }); } };
  useEffect(() => { void loadRefunds(); }, [token]);
  const startRefund = async (source: RefundData["refundable"][number]) => {
    if (!token) return;
    const reason = window.prompt(`Refund UGX ${source.refundable.toLocaleString()} to ${source.customerName}. Reason (at least 20 characters):`);
    if (!reason) return;
    setError(""); setNotice("");
    try { await api.requestRefund(token, { sourceTransactionId: source.transactionId, amount: source.refundable, reason }); setNotice("Refund requested. A different authorised person must approve it."); await loadRefunds(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "The refund could not be requested."); }
  };
  const decideRefund = async (id: string, approve: boolean) => {
    if (!token) return;
    if (approve && !window.confirm("Approving sends real money to the customer's Mobile Money. Continue?")) return;
    setError(""); setNotice("");
    try { if (approve) setNotice((await api.approveRefund(token, id)).message); else { await api.cancelRefund(token, id); setNotice("Refund cancelled."); } await loadRefunds(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "The refund could not be updated."); }
  };
  type Run = Awaited<ReturnType<typeof api.listProviderReconciliationRuns>>["runs"][number];
  const [runs, setRuns] = useState<Run[]>([]);
  const [runDay, setRunDay] = useState(() => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10));
  const [runExceptions, setRunExceptions] = useState<{ day: string; rows: Array<Record<string, unknown>> } | null>(null);
  const loadRuns = async () => { if (!token) return; try { setRuns((await api.listProviderReconciliationRuns(token)).runs); } catch { setRuns([]); } };
  useEffect(() => { void loadRuns(); }, [token]);
  const runReconciliation = async () => {
    if (!token) return; setError(""); setNotice("");
    try { const r = await api.runProviderReconciliation(token, runDay); setNotice(r.status === "failed" ? `Reconciliation could not complete: ${r.error}` : `Reconciliation for ${runDay}: ${r.status}.`); await loadRuns(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Reconciliation failed."); }
  };
  const openRun = async (run: Run) => { if (!token) return; try { const d = await api.getProviderReconciliationRun(token, run.id); setRunExceptions({ day: String(d.run.day).slice(0, 10), rows: d.run.exceptions }); } catch (e) { setError(e instanceof Error ? e.message : "Could not load the run."); } };
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
  return <AdminLayout activeScreen="admin-reconciliation" onNavigate={onNavigate} title="Reconciliation"><AdminPageHeader title="Financial reconciliation" subtitle="Provider transactions and immutable ledger journals"/><div style={{display:"flex",gap:8,marginBottom:14}}>{["open","awaiting_provider","reconciliation_required","reviewed","matched","all"].map(value=><button key={value} onClick={()=>setStatus(value)}>{value.replaceAll("_"," ")}</button>)}</div>{payouts.length>0&&<AdminCard><h3 style={{marginTop:0}}>Payouts awaiting release</h3><p style={{fontSize:12,color:"#64748B",marginTop:0}}>Approved loans the borrower has accepted. Releasing sends the money; it must be done by someone who did not review or approve the loan.</p>{payouts.map(p=><div key={p.batchId} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderTop:"1px solid #E2E8F0"}}><div style={{flex:1}}><strong>{p.applicantName}</strong><div style={{fontSize:12}}>{formatUGX(p.amount)} · {p.network.toUpperCase()} {p.phone} · {p.legs} transfer{p.legs===1?"":"s"}</div></div><button disabled={releasing!==null} onClick={()=>void release(p)}>{releasing===p.applicationId?"Releasing…":"Release payout"}</button></div>)}</AdminCard>}<AdminCard><h3 style={{marginTop:0}}>Daily MarzPay reconciliation</h3><p style={{fontSize:12,color:"#64748B",marginTop:0}}>Compares every Kuula MarzPay transaction of a day with MarzPay's own records. Runs automatically each morning for the previous day.</p><div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}><input type="date" value={runDay} onChange={e=>setRunDay(e.target.value)}/><button onClick={()=>void runReconciliation()}>Run for this day</button></div>{runs.length===0?<p style={{fontSize:13}}>No runs yet.</p>:runs.slice(0,10).map(run=><button key={run.id} onClick={()=>void openRun(run)} style={{display:"flex",width:"100%",justifyContent:"space-between",padding:"6px 0",border:"none",borderTop:"1px solid #E2E8F0",background:"none",cursor:"pointer",textAlign:"left"}}><span>{String(run.day).slice(0,10)}</span><span>{run.status==="failed"?`failed: ${run.error||""}`:`${run.summary?.matched??0} matched · ${run.exception_count} exception${run.exception_count===1?"":"s"}`}</span><StatusBadge status={run.status}/></button>)}{runExceptions&&<div style={{marginTop:10}}><strong>Exceptions for {runExceptions.day}</strong>{runExceptions.rows.length===0?<p style={{fontSize:13}}>None: every transaction matched.</p>:<ul style={{fontSize:12,paddingLeft:18}}>{runExceptions.rows.map((row,i)=><li key={i}>{String(row.kind).replaceAll("_"," ")}: {String(row.reference ?? (Array.isArray(row.references)?row.references.join(" / "):""))} {row.kuulaStatus?`Kuula ${String(row.kuulaStatus)}`:""} {row.providerStatus?`MarzPay ${String(row.providerStatus)}`:""} {row.amount!=null?formatUGX(Number(row.amount)):""}{row.providerAmount!=null?` (MarzPay ${formatUGX(Number(row.providerAmount))} vs Kuula ${formatUGX(Number(row.kuulaAmount))})`:""}</li>)}</ul>}</div>}</AdminCard>{(refundData.refundable.length>0||refundData.refunds.length>0)&&<AdminCard><h3 style={{marginTop:0}}>Refunds</h3><p style={{fontSize:12,color:"#64748B",marginTop:0}}>Customer money Kuula holds but could not apply to a loan. One person requests a refund; a different person approves and sends it.</p>{refundData.refundable.map(s=><div key={s.transactionId} style={{display:"flex",gap:10,alignItems:"center",padding:"6px 0",borderTop:"1px solid #E2E8F0"}}><div style={{flex:1}}><strong>{s.customerName}</strong><div style={{fontSize:12}}>{formatUGX(s.refundable)} held · {s.reference}</div></div><button onClick={()=>void startRefund(s)}>Request refund</button></div>)}{refundData.refunds.slice(0,20).map(r=><div key={r.id} style={{display:"flex",gap:10,alignItems:"center",padding:"6px 0",borderTop:"1px solid #E2E8F0"}}><div style={{flex:1}}><strong>{r.full_name}</strong><div style={{fontSize:12}}>{formatUGX(r.amount)} to {r.phone} · {r.reason}{r.failure_reason?` · ${r.failure_reason}`:""}</div></div><StatusBadge status={r.status}/>{r.status==="requested"&&<><button onClick={()=>void decideRefund(r.id,true)}>Approve &amp; send</button><button onClick={()=>void decideRefund(r.id,false)}>Cancel</button></>}</div>)}</AdminCard>}{error&&<p role="alert" style={{color:"#B91C1C"}}>{error}</p>}{notice&&<p role="status" style={{color:"#166534"}}>{notice}</p>}{loading?<AdminCard>Loading transactions…</AdminCard>:rows.length===0?<AdminCard>No transactions in this reconciliation state.</AdminCard>:<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}><AdminCard>{rows.map(row=><button key={String(row.id)} onClick={()=>void select(row)} style={{display:"block",width:"100%",textAlign:"left",padding:10,marginBottom:7,border:"1px solid #E2E8F0",borderRadius:9,background:"white"}}><strong>{String(row.reference)}</strong><div>{String(row.type)} · {formatUGX(Number(row.amount||0))}</div><StatusBadge status={String(row.reconciliationStatus||row.status)}/></button>)}</AdminCard><AdminCard>{!selected?"Select a transaction to inspect its journal.":<><h3>{String(selected.reference)}</h3><p>Provider: {String(selected.provider||"Not recorded")}</p><p>Provider status: {String(selected.providerStatus||"Not recorded")}</p><p>Journal: {journal ? "Posted and balanced record available" : "No posted journal"}</p>{selected.providerFee!=null&&<p>MarzPay charge: {formatUGX(Number(selected.providerFee))}</p>}{selected.provider==="marzpay"&&selected.status==="pending"&&<p><button onClick={()=>void verify()}>Check status with MarzPay</button></p>}{selected.reconciliationStatus==="reconciliation_required"&&<><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Required review note" style={{width:"100%",minHeight:80}}/><button onClick={()=>void review()}>Mark reviewed</button></>}</>}</AdminCard></div>}</AdminLayout>;
}
