import crypto from "node:crypto";
import {Router} from "express";
import {Prisma} from "@prisma/client";
import prisma from "../lib/prisma.js";
import {authenticateToken, hasPermission} from "../middleware/auth.js";
import {AppError} from "../middleware/error-handler.js";
import {saveFinancialStatement,accessFieldEvidence,deleteFieldEvidence} from "../lib/field-evidence-storage.js";
import {writeAuditEvent} from "../lib/audit.js";
const router=Router();
const uuid=/^[a-f0-9-]{36}$/i;
const mimes:Record<string,string>={pdf:"application/pdf",csv:"text/csv",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"};
async function authorized(id:string,userId:string,role:string){
 if(!uuid.test(id))throw new AppError("Invalid application",400);
 const app=await prisma.loanApplication.findUnique({where:{id},select:{id:true,applicantId:true,status:true}});
 if(!app)throw new AppError("Application not found",404);
 if(app.applicantId!==userId){
   if(!hasPermission(role as Parameters<typeof hasPermission>[0],"loan.review"))throw new AppError("Application not found",404);
   const assigned=await prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM approval_assignments WHERE application_id=${id}::uuid AND assignee_id=${userId}::uuid LIMIT 1`);
   if(!assigned.length && !["admin","administrator","super_admin"].includes(role))throw new AppError("Application not found",404);
 }
 return app;
}
router.post("/applications/:id/financial-statements",authenticateToken,async(req,res)=>{
 const id=String(req.params.id),uid=req.user!.userId;
 const app=await authorized(id,uid,req.user!.role);
 if(app.applicantId!==uid)throw new AppError("Only applicant can attach a statement",403);
 if(!["pending","resubmitted"].includes(app.status))throw new AppError("Application is no longer accepting documents",409);
 const body=req.body;
 if(!body || typeof body!=="object" || Array.isArray(body) || typeof body.kind!=="string" || typeof body.periodMonths!=="number" || typeof body.filename!=="string" || typeof body.dataUrl!=="string")throw new AppError("Statement details are invalid",400);
 const kind=body.kind,months=body.periodMonths,filename=body.filename.trim();
 if(!filename || filename.length>120 || /[\\/\x00-\x1f\x7f]/.test(filename))throw new AppError("Invalid statement filename",400);
 const data=body.dataUrl;
 const match=/^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
 const ext=filename.toLowerCase().split(".").pop()||"";
 if(!["bank","mobile_money"].includes(kind)||![3,6,12].includes(months)||!mimes[ext]||!match||match[1]!==mimes[ext])throw new AppError("Invalid statement type or period",400);
 if(match[2].length>7_000_000)throw new AppError("Statement exceeds 5MB",413);
 const buffer=Buffer.from(match[2],"base64");
 if(buffer.toString("base64")!==match[2])throw new AppError("Invalid statement encoding",400);
 if(buffer.length<1||buffer.length>5*1024*1024)throw new AppError("Statement exceeds 5MB",413);
 if(ext==="pdf" && !buffer.subarray(0,5).equals(Buffer.from("%PDF-")))throw new AppError("Invalid PDF signature",400);
 if(ext==="xlsx" && !buffer.subarray(0,2).equals(Buffer.from("PK")))throw new AppError("Invalid XLSX signature",400);
 if(ext==="csv" && buffer.includes(0))throw new AppError("Invalid CSV",400);
 const previous=await prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM loan_financial_statements WHERE application_id=${id}::uuid AND kind=${kind} LIMIT 1`);
 if(previous.length)throw new AppError("Statement already uploaded for this category",409);
 const saved=await saveFinancialStatement(id,kind,match[1],buffer);
 try{
 await prisma.$executeRaw(Prisma.sql`INSERT INTO loan_financial_statements(id,application_id,uploaded_by,kind,period_months,filename,storage_key,mime,bytes,sha256)
 VALUES(${crypto.randomUUID()}::uuid,${id}::uuid,${uid}::uuid,${kind},${months},${filename},${saved.key},${saved.mime},${saved.bytes},${crypto.createHash("sha256").update(buffer).digest("hex")})`);
 }catch(err){await deleteFieldEvidence(saved.key).catch(()=>{});throw err;}
 await writeAuditEvent({actorId:uid,subjectUserId:uid,action:"loan.financial_statement_uploaded",resourceType:"loan_application",resourceId:id,metadata:{kind,periodMonths:months}});
 res.status(201).json({ok:true,kind});
});
router.get("/applications/:id/financial-statements",authenticateToken,async(req,res)=>{
 const id=String(req.params.id);await authorized(id,req.user!.userId,req.user!.role);
 const rows=await prisma.$queryRaw<Array<{id:string;kind:string;period_months:number;filename:string;bytes:number;uploaded_at:Date}>>(Prisma.sql`SELECT id,kind,period_months,filename,bytes,uploaded_at FROM loan_financial_statements WHERE application_id=${id}::uuid ORDER BY uploaded_at`);
 res.json({statements:rows.map(x=>({id:x.id,kind:x.kind,periodMonths:x.period_months,filename:x.filename,bytes:x.bytes,uploadedAt:x.uploaded_at}))});
});
router.get("/applications/:id/financial-statements/:statementId",authenticateToken,async(req,res)=>{
 const id=String(req.params.id),sid=String(req.params.statementId);
 await authorized(id,req.user!.userId,req.user!.role);
 if(!uuid.test(sid))throw new AppError("Invalid statement",400);
 const rows=await prisma.$queryRaw<Array<{storage_key:string;mime:string}>>(Prisma.sql`SELECT storage_key,mime FROM loan_financial_statements WHERE application_id=${id}::uuid AND id=${sid}::uuid LIMIT 1`);
 if(!rows.length)throw new AppError("Statement not found",404);
 const file=await accessFieldEvidence(rows[0].storage_key,rows[0].mime);
 res.set("Cache-Control","private, no-store").set("X-Content-Type-Options","nosniff");
 if(file.kind==="url")res.json({url:file.url,expiresInSeconds:file.expiresInSeconds});
 else res.type(rows[0].mime).set("Content-Disposition","attachment").send(file.buffer);
});
export default router;
