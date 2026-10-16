/** Statement selections are session-only and are not stored in localStorage. */
export type StatementKind = "mobile_money" | "bank";
export interface SelectedStatement { kind: StatementKind; file: File; periodMonths: number }
let chosen: SelectedStatement[] = [];
export function getSelectedStatements(){return chosen;}
export function setSelectedStatements(next: SelectedStatement[]){chosen=next;}
export function clearSelectedStatements(){chosen=[];}
export async function statementDataUrl(file:File):Promise<string>{
  return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>typeof r.result==="string"?resolve(r.result):reject(new Error("Cannot read file"));r.onerror=()=>reject(new Error("Cannot read statement"));r.readAsDataURL(file);});
}
export function validateStatement(file:File){
 const allowed=["application/pdf","text/csv","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
 const ext=file.name.toLowerCase().split(".").pop();
 if(!allowed.includes(file.type)||!["pdf","csv","xlsx"].includes(ext||""))throw new Error("Upload PDF, CSV or XLSX statements only.");
 if(file.size>5*1024*1024||file.size===0)throw new Error("Each statement must be between 1 byte and 5 MB.");
}
