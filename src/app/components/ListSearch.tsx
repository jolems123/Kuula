import { Search, X } from "lucide-react";
export function ListSearch({value,onChange,placeholder="Search records...",label="Search records"}:{value:string;onChange:(value:string)=>void;placeholder?:string;label?:string}) {
 return <div className="kuula-list-search"><Search size={18} aria-hidden="true"/><input aria-label={label} type="search" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>{value && <button type="button" onClick={()=>onChange("")} aria-label="Clear search"><X size={17}/></button>}</div>;
}
