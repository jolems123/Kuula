/** Optional files stay in memory until the application has been submitted. */
export type StatementKind = "mobile_money" | "bank";
export interface SelectedStatement { kind: StatementKind; file: File; periodMonths: number }
let chosen: SelectedStatement[] = [];
export function getSelectedStatements(){return chosen;}
export function setSelectedStatements(next: SelectedStatement[]){chosen=next;}
export function clearSelectedStatements(){chosen=[];}
const MIME:Record<string,string>={pdf:"application/pdf",csv:"text/csv",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"};
export function validateStatement(file:File){
 const ext=file.name.toLowerCase().split(".").pop()||"";
 if(!MIME[ext])throw new Error("Only PDF, CSV or XLSX statements are supported.");
 if(file.size>5*1024*1024||file.size===0)throw new Error("Each statement must be 5MB or smaller.");
}
export async function statementDataUrl(file:File):Promise<string>{
 validateStatement(file);
 const extension=file.name.toLowerCase().split(".").pop()||"";
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>typeof reader.result==="string"
    ? resolve(reader.result.replace(/^data:[^;,]*;base64,/, `data:${MIME[extension]};base64,`))
    : reject(new Error("Cannot read statement"));
  reader.onerror=()=>reject(new Error("Cannot read statement"));
  reader.readAsDataURL(file);
 });
}
