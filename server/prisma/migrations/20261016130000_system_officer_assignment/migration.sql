-- A null assigned_by identifies a system-originated assignment; manual assignment retains its actor.
ALTER TABLE "approval_assignments" ALTER COLUMN "assigned_by" DROP NOT NULL;
