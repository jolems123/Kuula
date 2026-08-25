import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppContext } from "../../context/AppContext";
import { localQuote } from "../../lib/pricing";
import { setLoanDraft } from "../../lib/selection";

interface Props { onNavigate: (screen: string) => void; }
function formatUGX(n: number) { return "UGX " + Math.round(n).toLocaleString("en-UG"); }
const MIN_AMOUNT = 50_000;
const PRODUCT_MAX_AMOUNT = 2_000_000;
const METHODS = [{ id: "MTN MoMo", label: "MTN MoMo" }, { id: "Airtel Money", label: "Airtel Money" }];
const EMPLOYMENT = ["Employed", "Self-employed", "Business owner", "Farmer", "Casual worker", "Other"];
const DURATIONS = ["Less than 6 months", "6–12 months", "1–2 years", "2+ years"];
const INCOME_SOURCES = ["Salary", "Business", "Farming", "Commission", "Casual work", "Remittances", "Other"];

export function LoanApplyScreen({ onNavigate }: Props) {
  const { t } = useTranslation(); const { state } = useAppContext();
  const TERMS = [90, 120, 180];
  const PURPOSES = ["Business", "School Fees", "Medical", "Farming", "Home Repair", "Other"];
  const [amount, setAmount] = useState(MIN_AMOUNT); const [term, setTerm] = useState(90); const [purpose, setPurpose] = useState("Business"); const [method, setMethod] = useState("MTN MoMo");
  const [employmentStatus, setEmploymentStatus] = useState(""); const [occupationOrBusiness, setOccupationOrBusiness] = useState(""); const [employerOrBusinessName, setEmployerOrBusinessName] = useState(""); const [workDuration, setWorkDuration] = useState(""); const [incomeSource, setIncomeSource] = useState(""); const [repaymentSource, setRepaymentSource] = useState("");
  const [income, setIncome] = useState(0); const [expenses, setExpenses] = useState(0); const [existingDebt, setExistingDebt] = useState(0); const [error, setError] = useState("");
  const availableCredit = Math.max(0, state.loan?.availableCredit ?? 0); const maxEligibleAmount = Math.min(PRODUCT_MAX_AMOUNT, availableCredit); const canApply = maxEligibleAmount >= MIN_AMOUNT; const rangeMax = Math.max(MIN_AMOUNT, maxEligibleAmount);
  useEffect(() => { if (!canApply) setAmount(MIN_AMOUNT); else setAmount((v) => Math.min(Math.max(v, MIN_AMOUNT), maxEligibleAmount)); }, [canApply, maxEligibleAmount]);
  const quote = localQuote(amount, term, 0);
  const continueToReview = () => {
    setError("");
    if (!canApply) return setError("No Growth Line is currently available. Complete the required Credit Pass steps first.");
    if (amount < MIN_AMOUNT || amount > maxEligibleAmount) return setError("Choose an amount within your current Growth Line.");
    if (!employmentStatus || !occupationOrBusiness.trim() || !workDuration || !incomeSource || !repaymentSource.trim()) return setError("Complete your employment, income source and repayment source details.");
    if ((employmentStatus === "Employed" || employmentStatus === "Business owner") && !employerOrBusinessName.trim()) return setError("Enter your employer or business name.");
    if (!Number.isFinite(income) || income <= 0) return setError("Enter your average monthly income.");
    if (!Number.isFinite(expenses) || expenses < 0 || !Number.isFinite(existingDebt) || existingDebt < 0) return setError("Expenses and debt payments must be valid non-negative amounts.");
    if (expenses + existingDebt >= income) return setError("Your expenses and existing debt leave no disposable monthly income for new credit.");
    setLoanDraft({ amount, termDays: term, purpose, channel: method, employmentStatus, occupationOrBusiness: occupationOrBusiness.trim(), employerOrBusinessName: employerOrBusinessName.trim(), workDuration, incomeSource, repaymentSource: repaymentSource.trim(), declaredMonthlyIncome: Math.round(income), declaredMonthlyExpenses: Math.round(expenses), existingDebtPayment: Math.round(existingDebt) });
    onNavigate("loan-review");
  };
  const field = (label: string, value: string, setter: (v:string)=>void, placeholder: string) => <label style={{display:"block"}}><span style={{fontSize:12,fontWeight:700,color:"#425149"}}>{label}</span><input value={value} onChange={e=>setter(e.target.value)} placeholder={placeholder} maxLength={120} style={{width:"100%",height:46,marginTop:6,border:"1px solid #D8E2DC",borderRadius:12,padding:"0 12px",outline:"none"}} /></label>;
  const select = (label:string,value:string,setter:(v:string)=>void,options:string[]) => <label style={{display:"block"}}><span style={{fontSize:12,fontWeight:700,color:"#425149"}}>{label}</span><select value={value} onChange={e=>setter(e.target.value)} style={{width:"100%",height:46,marginTop:6,border:"1px solid #D8E2DC",borderRadius:12,padding:"0 10px",background:"white"}}><option value="">Select</option>{options.map(o=><option key={o}>{o}</option>)}</select></label>;
  const money = (label:string,value:number,setter:(v:number)=>void) => <label><span style={{display:"block",fontSize:12,fontWeight:700,color:"#425149",marginBottom:6}}>{label}</span><div style={{display:"flex",alignItems:"center",border:"1px solid #D8E2DC",borderRadius:12,padding:"0 12px"}}><span style={{fontSize:12}}>UGX</span><input type="number" min={0} step={50000} value={value} onChange={e=>setter(Number(e.target.value))} style={{flex:1,height:46,border:0,outline:"none",paddingLeft:10}} /></div></label>;
  return <div className="flex flex-col h-full" style={{background:"#F7FAF8"}}>
    <div className="flex items-center px-4 pt-4 pb-4" style={{background:"linear-gradient(135deg, #0B5E3A, #087148)"}}><button onClick={()=>onNavigate("home")} aria-label="Go back" style={{width:36,height:36,borderRadius:10,border:0,background:"rgba(255,255,255,.18)"}}><ArrowLeft size={18} color="white" /></button><span style={{fontSize:17,fontWeight:700,color:"white",marginLeft:12}}>{t("loanApply.title")}</span></div>
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{paddingBottom:120}}>
      {!canApply && <div className="p-4 rounded-2xl" style={{background:"#FFF9E5",border:"1px solid #F2D77B"}}><strong>No Growth Line available yet</strong><p style={{fontSize:11.5}}>Complete identity verification and required credit evidence before applying.</p></div>}
      <div className="p-5 rounded-2xl" style={{background:"white",opacity:canApply?1:.6}}><label style={{fontSize:12,fontWeight:700}}>LOAN AMOUNT</label><div><span>UGX </span><input disabled={!canApply} type="number" value={amount} onChange={e=>setAmount(Number(e.target.value))} style={{fontSize:30,fontWeight:800,color:"#0B5E3A",border:0,width:"75%"}} /></div><input disabled={!canApply} type="range" min={MIN_AMOUNT} max={rangeMax} step={50000} value={amount} onChange={e=>setAmount(Number(e.target.value))} style={{width:"100%"}}/><small>{formatUGX(MIN_AMOUNT)} – {canApply?formatUGX(maxEligibleAmount):"Not available"}</small></div>
      <div className="p-4 rounded-2xl" style={{background:"white"}}><strong>REPAYMENT TERM</strong><div className="flex gap-2 flex-wrap mt-3">{TERMS.map(d=><button key={d} onClick={()=>setTerm(d)} style={{padding:"8px 14px",borderRadius:10,border:"1px solid #DDE5E0",background:term===d?"#0B5E3A":"white",color:term===d?"white":"#374151"}}>{d} days</button>)}</div></div>
      <div className="p-4 rounded-2xl" style={{background:"white"}}><strong>LOAN PURPOSE</strong><div className="flex gap-2 flex-wrap mt-3">{PURPOSES.map(p=><button key={p} onClick={()=>setPurpose(p)} style={{padding:"7px 12px",borderRadius:20,border:"1px solid #DDE5E0",background:purpose===p?"#EDF8F2":"white"}}>{p}</button>)}</div></div>
      <div className="p-4 rounded-2xl" style={{background:"white"}}><p style={{fontWeight:800,marginTop:0}}>Employment & livelihood</p><p style={{fontSize:11,color:"#68766F"}}>Tell us how you earn income. Kuula uses this with verified credit evidence to assess affordability.</p><div style={{display:"grid",gap:14}}>{select("Employment / livelihood status",employmentStatus,setEmploymentStatus,EMPLOYMENT)}{field("Occupation / business activity",occupationOrBusiness,setOccupationOrBusiness,"e.g. teacher, trader, farmer")}{field("Employer / business name",employerOrBusinessName,setEmployerOrBusinessName,"Enter name, if applicable")}{select("Time in current work / business",workDuration,setWorkDuration,DURATIONS)}{select("Primary income source",incomeSource,setIncomeSource,INCOME_SOURCES)}{field("Primary repayment source",repaymentSource,setRepaymentSource,"e.g. salary or business proceeds")}</div></div>
      <div className="p-4 rounded-2xl" style={{background:"white"}}><p style={{fontWeight:800,marginTop:0}}>Affordability information</p><div style={{display:"grid",gap:14}}>{money("Average monthly income",income,setIncome)}{money("Monthly living & business expenses",expenses,setExpenses)}{money("Existing monthly debt repayments",existingDebt,setExistingDebt)}</div></div>
      <div className="p-4 rounded-2xl" style={{background:"white"}}><strong>DISBURSEMENT METHOD</strong><p style={{fontSize:11,color:"#68766F"}}>Cash credit is sent only to your verified account phone.</p>{METHODS.map(m=><button key={m.id} onClick={()=>setMethod(m.id)} style={{width:"100%",padding:12,marginTop:8,borderRadius:12,border:"1px solid #DDE5E0",background:method===m.id?"#EDF8F2":"white",textAlign:"left"}}>{m.label}</button>)}</div>
      <div className="p-4 rounded-2xl" style={{background:"#FFF9E5",border:"1px solid #F2D77B"}}><div>Principal <strong>{formatUGX(amount)}</strong></div><div>Interest ({quote.aprPercent}% APR, simple) <strong>{formatUGX(quote.interest)}</strong></div><div><strong>Total repayment {formatUGX(quote.total)}</strong></div></div>
    </div>
    <div className="absolute bottom-0 left-0 right-0 px-4 pb-8 pt-3" style={{background:"white",borderTop:"1px solid #E8EEEA"}}>{error&&<p style={{fontSize:11.5,color:"#B91C1C",textAlign:"center"}}>{error}</p>}<button disabled={!canApply} onClick={continueToReview} className="kuula-primary" style={{width:"100%",height:52,opacity:canApply?1:.55}}>Review Application</button></div>
  </div>;
}
