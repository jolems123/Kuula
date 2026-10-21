import type { BusinessProfile } from "../api/types";
export const spendingCategories = { stock: "Stock and inventory", equipment: "Equipment and tools", operations: "Operating expenses", expansion: "Business expansion", other: "Other business needs" };
type Item = NonNullable<BusinessProfile["expenditureItems"]>[number];
export function expenditureError(items: Item[], funds: BusinessProfile["useOfFunds"]): string {
  if (!items.length) return "";
  if (items.length > 30 || items.some(item => !Object.prototype.hasOwnProperty.call(spendingCategories, item.category) || !item.description.trim() || item.description.trim().length > 120 || !Number.isSafeInteger(item.amount) || item.amount <= 0)) return "Give each expenditure item a description and a positive whole UGX amount.";
  return (Object.keys(funds) as Item["category"][]).some(category => items.filter(item => item.category === category).reduce((sum, item) => sum + item.amount, 0) !== funds[category]) ? "Expenditure details must match every spending category total. Complete the breakdown or remove all items to continue without details." : "";
}
export function ExpenditureDetails({ items, funds, onChange }: { items: Item[]; funds: BusinessProfile["useOfFunds"]; onChange: (items: Item[]) => void }) {
  const update = (index: number, patch: Partial<Item>) => onChange(items.map((item, i) => i === index ? { ...item, ...patch } : item));
  const error = expenditureError(items, funds);
  return <details className="kuula-expenditure" open={items.length ? true : undefined}>
    <summary>Add expenditure details (optional)</summary>
    <p>Your selected purposes can cover several business needs. If you add items, detail the full allocation in every funded category. No receipts or quotations are required here.</p>
    {items.map((item, index) => <fieldset key={index} className="kuula-statement-card" style={{ marginTop: 16 }}>
      <legend>Expenditure item {index + 1}</legend>
      <label>Spending category<select className="kx-input" value={item.category} onChange={event => update(index, { category: event.target.value as Item["category"] })}>{Object.entries(spendingCategories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label style={{ display: "block", marginTop: 12 }}>Item description<input className="kx-input" maxLength={120} value={item.description} placeholder="For example, 10 bags of rice" onChange={event => update(index, { description: event.target.value })} /></label>
      <label style={{ display: "block", marginTop: 12 }}>Amount (UGX)<input className="kx-input" type="number" min={1} step={1} inputMode="numeric" value={item.amount || ""} onChange={event => update(index, { amount: Number(event.target.value) })} /></label>
      <button type="button" className="kuula-statement-remove" style={{ marginTop: 12 }} onClick={() => onChange(items.filter((_, i) => i !== index))}>Remove item {index + 1}</button>
    </fieldset>)}
    <button type="button" className="kx-map-toggle" style={{ marginTop: 16 }} disabled={items.length >= 30} onClick={() => onChange([...items, { category: "stock", description: "", amount: 0 }])}>Add expenditure item</button>
    {error && <p role="status" style={{ color: "#a13a3a" }}>{error}</p>}
  </details>;
}
export function ExpenditureSummary({ business }: { business?: Partial<BusinessProfile> | null }) {
  if (!business?.useOfFunds) return null;
  return <section className="kuula-expenditure"><h3>Planned expenditure</h3>
    {Object.entries(spendingCategories).map(([key, label]) => <p key={key}>{label}: UGX {Number(business.useOfFunds?.[key as Item["category"]] ?? 0).toLocaleString("en-UG")}</p>)}
    {business.expenditureItems?.length ? <ul>{business.expenditureItems.map((item, index) => <li key={index}>{spendingCategories[item.category]} · {item.description} · UGX {item.amount.toLocaleString("en-UG")}</li>)}</ul> : <p>No optional itemized details supplied.</p>}
  </section>;
}
