import crypto from "node:crypto";
import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";

const router = Router();
const types = new Set(["note","contact","assignment","promise_to_pay","promise_update"]);
const promiseStatuses = new Set(["kept","broken","cancelled"]);
export const collectionRoles=new Set(["collections","credit_manager","manager","administrator","admin","super_admin"]);
router.use(authenticateToken, (req, _res, next) => collectionRoles.has(req.user!.role) ? next() : next(new AppError("Insufficient permissions",403)));

router.get("/", async (_req: Request, res: Response) => {
  const accounts = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT r.id AS repayment_id,r.loan_id,r.user_id,r.total,r.amount_paid,r.due_date,r.status,u.full_name,u.phone,
    COALESCE(EXTRACT(DAY FROM CURRENT_TIMESTAMP-r.due_date),0)::int AS days_past_due,
    (SELECT ca.assigned_to FROM collection_activities ca WHERE ca.repayment_id=r.id AND ca.assigned_to IS NOT NULL ORDER BY ca.created_at DESC LIMIT 1) AS assigned_to
    FROM repayments r JOIN users u ON u.id=r.user_id WHERE r.status='overdue' OR (r.amount_paid<r.total AND r.due_date<CURRENT_TIMESTAMP) ORDER BY r.due_date`);
  const activities = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT ca.*,u.full_name AS actor_name FROM collection_activities ca JOIN users u ON u.id=ca.actor_id WHERE ca.repayment_id IN (SELECT id FROM repayments WHERE status='overdue' OR (amount_paid<total AND due_date<CURRENT_TIMESTAMP)) ORDER BY ca.created_at DESC`);
  res.json({ accounts: accounts.map((row) => ({ ...row, total:Number(row.total), amount_paid:Number(row.amount_paid) })), activities: activities.map((row) => ({ ...row, promise_amount:row.promise_amount==null?null:Number(row.promise_amount) })) });
});

router.post("/:repaymentId/activities", async (req: Request, res: Response) => {
  const repaymentId=String(req.params.repaymentId), type=String(req.body.activityType||""), note=String(req.body.note||"").trim();
  if(!types.has(type)) throw new AppError("Invalid collection activity type",400);
  if(!note || note.length>2000) throw new AppError("A note of up to 2000 characters is required",400);
  const repayment=await prisma.repayment.findUnique({where:{id:repaymentId},select:{id:true,userId:true,total:true,amountPaid:true,dueDate:true}});
  if(!repayment || repayment.amountPaid>=repayment.total || repayment.dueDate>=new Date()) throw new AppError("Repayment is not overdue",409);
  let promiseAmount: bigint | null = null;
  if(req.body.promiseAmount!=null){try{promiseAmount=BigInt(req.body.promiseAmount);}catch{throw new AppError("Promise amount must be a whole number",400);}}
  const promiseDate=req.body.promiseDate?new Date(req.body.promiseDate):null;
  if(type==="promise_to_pay" && (!promiseAmount || promiseAmount<=0 || !promiseDate || Number.isNaN(promiseDate.getTime()) || promiseDate<=new Date())) throw new AppError("A future promise date and positive amount are required",422);
  const promiseStatus=type==="promise_to_pay"?"pending":type==="promise_update"?String(req.body.promiseStatus||""):null;
  if(type==="promise_update"&&!promiseStatuses.has(promiseStatus!)) throw new AppError("Promise status must be kept, broken, or cancelled",422);
  if(promiseAmount && promiseAmount>repayment.total-repayment.amountPaid) throw new AppError("Promise amount exceeds the outstanding balance",422);
  const assignedTo=req.body.assignedTo?String(req.body.assignedTo):null;
  if(assignedTo){const assignee=await prisma.user.findFirst({where:{id:assignedTo,deletedAt:null},select:{role:true}});if(!assignee||!collectionRoles.has(assignee.role))throw new AppError("Assignee must be active collections staff",422);}
  const id=crypto.randomUUID();
  const rows=await prisma.$queryRaw<any[]>(Prisma.sql`INSERT INTO collection_activities(id,repayment_id,actor_id,assigned_to,activity_type,note,promise_amount,promise_date,promise_status) VALUES(${id}::uuid,${repaymentId}::uuid,${req.user!.userId}::uuid,${assignedTo}::uuid,${type},${note},${promiseAmount},${promiseDate},${promiseStatus}) RETURNING *`);
  await prisma.auditEvent.create({data:{actorId:req.user!.userId,subjectUserId:repayment.userId,action:"collections.activity_created",resourceType:"repayment",resourceId:repaymentId,metadata:{activityId:id,type}}});
  res.status(201).json({activity:{...rows[0],promise_amount:rows[0].promise_amount==null?null:Number(rows[0].promise_amount)}});
});
export default router;
