import { useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import { useAppContext } from "../../context/AppContext";
import { formatUGX } from "../../lib/export";
import { AdminCard, AdminLayout, AdminPageHeader, StatusBadge } from "../AdminLayout";

interface Props { onNavigate: (screen: string) => void }
type Row = Record<string, unknown>;

export function AdminReconciliationScreen({ onNavigate }: Props) {
  const { state } = useAppContext(); const token = state.session.token;
  const [status, setStatus] = useState("reconciliation_required"); const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null); const [journal, setJournal] = useState<Record<string, unknown> | null>(null);
  const [note, setNote] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const load = async () => { if (!token) return; setLoading(true); try { setRows((await api.getReconciliationQueue(token, status)).transactions); setSelected(null); setError(""); } catch(e) { setError(e instanceof ApiError ? e.message : "Could not load reconciliation data."); } finally { setLoading(false); } };
  useEffect(()=>{ void load(); },[token,status]);
  const select = async (row: Row) => { setSelected(row); setJournal(null); if(token) try { setJournal((await api.getTransactionJournal(token,String(row.id))).journal); } catch(e) { setError(e instanceof Error ? e.message : "Could not load journal."); } };
  const review = async () => { if(!token||!selected||!note.trim()) { setError("Enter a reconciliation review note."); return; } try { await api.reviewReconciliation(token,String(selected.id),note.trim()); setNote(""); await load(); } catch(e) { setError(e instanceof Error ? e.message : "Review could not be saved."); } };
  return <AdminLayout activeScreen="admin-reconciliation" onNavigate={onNavigate} title="Reconciliation"><AdminPageHeader title="Financial reconciliation" subtitle="Provider transactions and immutable ledger journals"/><div style={{display:"flex",gap:8,marginBottom:14}}>{["reconciliation_required","reviewed","matched","all"].map(value=><button key={value} onClick={()=>setStatus(value)}>{value.replaceAll("_"," ")}</button>)}</div>{error&&<p role="alert" style={{color:"#B91C1C"}}>{error}</p>}{loading?<AdminCard>Loading transactions…</AdminCard>:rows.length===0?<AdminCard>No transactions in this reconciliation state.</AdminCard>:<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}><AdminCard>{rows.map(row=><button key={String(row.id)} onClick={()=>void select(row)} style={{display:"block",width:"100%",textAlign:"left",padding:10,marginBottom:7,border:"1px solid #E2E8F0",borderRadius:9,background:"white"}}><strong>{String(row.reference)}</strong><div>{String(row.type)} · {formatUGX(Number(row.amount||0))}</div><StatusBadge status={String(row.reconciliationStatus||row.status)}/></button>)}</AdminCard><AdminCard>{!selected?"Select a transaction to inspect its journal.":<><h3>{String(selected.reference)}</h3><p>Provider: {String(selected.provider||"Not recorded")}</p><p>Provider status: {String(selected.providerStatus||"Not recorded")}</p><p>Journal: {journal ? "Posted and balanced record available" : "No posted journal"}</p>{selected.reconciliationStatus==="reconciliation_required"&&<><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Required review note" style={{width:"100%",minHeight:80}}/><button onClick={()=>void review()}>Mark reviewed</button></>}</>}</AdminCard></div>}</AdminLayout>;
}
