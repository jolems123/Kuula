import "dotenv/config";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma, PrismaClient } from "@prisma/client";
import { normalizeUgandaMobileMoneyPhone } from "./lib/marzpay.js";

const prisma = new PrismaClient();

async function upsertStaff(input: { fullName: string; email: string; phone: string; role: "officer" | "manager"; password: string }) {
  const phone = normalizeUgandaMobileMoneyPhone(input.phone);
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  const passwordHash = await bcrypt.hash(input.password, 12);
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { fullName: input.fullName, phone: existing.phone || phone, role: input.role, phoneVerified: true, verified: true, passwordHash },
    });
  }
  return prisma.user.create({
    data: { fullName: input.fullName, email: input.email, phone, role: input.role, phoneVerified: true, verified: true, passwordHash },
  });
}

async function ensureProviderLimit(network: "mtn" | "airtel", beneficiaryType: "partner" | "customer") {
  const changed = await prisma.$executeRaw(Prisma.sql`
    UPDATE payment_provider_limits
       SET min_amount=500, max_single_amount=5000000, max_daily_amount=10000000,
           source_note='LOCAL DEVELOPMENT ONLY - simulated provider ceiling', updated_at=CURRENT_TIMESTAMP
     WHERE market_code='UG' AND provider='marzpay' AND network=${network}
       AND beneficiary_type=${beneficiaryType} AND enabled=true AND effective_to IS NULL
  `);
  if (changed === 0) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO payment_provider_limits (
        id, market_code, provider, network, beneficiary_type, min_amount,
        max_single_amount, max_daily_amount, enabled, source_note
      ) VALUES (
        ${crypto.randomUUID()}::uuid, 'UG', 'marzpay', ${network}, ${beneficiaryType}, 500,
        5000000, 10000000, true, 'LOCAL DEVELOPMENT ONLY - simulated provider ceiling'
      )
    `);
  }
}

async function ensureDestination(network: "mtn" | "airtel", reference: string, accountTier: string) {
  const phone = normalizeUgandaMobileMoneyPhone(reference);
  const changed = await prisma.$executeRaw(Prisma.sql`
    UPDATE payment_destination_profiles
       SET account_tier=${accountTier}, max_single_amount=2000000, max_daily_amount=5000000,
           status='verified', expires_at=CURRENT_TIMESTAMP + interval '30 days',
           source_note='LOCAL DEVELOPMENT ONLY - fake verified partner destination', updated_at=CURRENT_TIMESTAMP
     WHERE market_code='UG' AND provider='marzpay' AND network=${network}
       AND beneficiary_type='partner' AND beneficiary_reference=${phone} AND status='verified'
  `);
  if (changed === 0) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO payment_destination_profiles (
        id, market_code, provider, network, beneficiary_type, beneficiary_reference,
        account_tier, max_single_amount, max_daily_amount, status, expires_at, source_note
      ) VALUES (
        ${crypto.randomUUID()}::uuid, 'UG', 'marzpay', ${network}, 'partner', ${phone},
        ${accountTier}, 2000000, 5000000, 'verified', CURRENT_TIMESTAMP + interval '30 days',
        'LOCAL DEVELOPMENT ONLY - fake verified partner destination'
      )
    `);
  }
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Local seed must never run in production");

  await upsertStaff({
    fullName: "Local Field Officer",
    email: "officer-local@kuula.test",
    phone: "+256700000002",
    role: "officer",
    password: "LocalOfficerPassword2026!",
  });
  await upsertStaff({
    fullName: "Local Senior Reviewer",
    email: "manager-local@kuula.test",
    phone: "+256700000003",
    role: "manager",
    password: "LocalManagerPassword2026!",
  });

  await Promise.all([
    ensureProviderLimit("mtn", "partner"),
    ensureProviderLimit("airtel", "partner"),
    ensureProviderLimit("mtn", "customer"),
    ensureProviderLimit("airtel", "customer"),
  ]);
  await ensureDestination("mtn", "+256700000010", "TibaPay local demo payee");
  await ensureDestination("airtel", "+256700000011", "SiliFi local demo payee");

  console.log("Local workflow seed complete: officer, manager, provider limits and fake partner destinations ready.");
}

main()
  .catch((error) => { console.error(error); process.exit(1); })
  .finally(async () => prisma.$disconnect());
