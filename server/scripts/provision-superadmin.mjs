/**
 * One-off production provisioning for the Kuula Super Admin.
 *
 * The Super Admin signs in with email and password and adds other staff from
 * Staff Management. New staff choose a password and await independent approval.
 * This script creates (or repairs) the protected root account.
 *
 * Usage:
 *   DATABASE_URL=... SUPERADMIN_PASSWORD="..." node scripts/provision-superadmin.mjs
 *
 * Optional overrides:
 *   SUPERADMIN_PHONE   (default +256709295211)
 *   SUPERADMIN_EMAIL   (default superadmin@kuulapp.com)
 *   SUPERADMIN_NAME    (default "Kuula Super Admin")
 *
 * The password is (re)set on every run so a locked-out Super Admin can be
 * recovered deliberately. Never commit the password; pass it via the env.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const phone = String(process.env.SUPERADMIN_PHONE || "+256709295211").trim();
const email = String(process.env.SUPERADMIN_EMAIL || "superadmin@kuulapp.com").trim().toLowerCase();
const fullName = String(process.env.SUPERADMIN_NAME || "Kuula Super Admin").trim();
const password = String(process.env.SUPERADMIN_PASSWORD || "");

if (!/^\+2567\d{8}$/.test(phone)) {
  console.error("SUPERADMIN_PHONE must be a Uganda number in +2567XXXXXXXX form");
  process.exit(1);
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("SUPERADMIN_EMAIL must be a valid email address");
  process.exit(1);
}
if (password.length < 12 || password.length > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
  console.error("SUPERADMIN_PASSWORD must be 12–72 characters with letters and numbers");
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const passwordHash = await bcrypt.hash(password, 12);

  const byEmail = await prisma.user.findUnique({ where: { email } });
  const byPhone = await prisma.user.findUnique({ where: { phone } });

  if (byPhone && byEmail && byPhone.id !== byEmail.id) {
    console.error(`Phone ${phone} and email ${email} belong to different accounts; resolve manually.`);
    process.exit(1);
  }

  const existing = byEmail || byPhone;
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        fullName,
        phone,
        email,
        role: "super_admin",
        phoneVerified: true,
        verified: true,
        deletedAt: null,
        passwordHash,
        authVersion: { increment: 1 },
      },
    });
    // A password reset must revoke every outstanding session.
    await prisma.authSession.updateMany({
      where: { userId: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    console.log(`Super Admin updated: ${email} / ${phone} (id ${existing.id})`);
  } else {
    const created = await prisma.user.create({
      data: {
        fullName,
        phone,
        email,
        role: "super_admin",
        phoneVerified: true,
        verified: true,
        passwordHash,
      },
    });
    console.log(`Super Admin created: ${email} / ${phone} (id ${created.id})`);
  }
} finally {
  await prisma.$disconnect();
}
