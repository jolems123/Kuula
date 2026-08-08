import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { normalizeUgandaMobileMoneyPhone } from "./lib/marzpay.js";

const prisma = new PrismaClient();

function required(name: string): string {
  const value = process.env[name]?.trim() || "";
  if (!value) throw new Error(`${name} must be set before running the seed`);
  return value;
}

async function main() {
  console.log("Seeding database...");

  const adminEmail = required("ADMIN_EMAIL").toLowerCase();
  const adminPassword = required("ADMIN_PASSWORD");
  const demoPhone = normalizeUgandaMobileMoneyPhone(required("DEMO_PHONE"));
  const demoPassword = required("DEMO_PASSWORD");
  const isProduction = process.env.NODE_ENV === "production";

  if (adminPassword.length < 12 || /Admin@123456/i.test(adminPassword)) {
    throw new Error("ADMIN_PASSWORD must be a unique password of at least 12 characters");
  }
  if (demoPassword.length < 8) throw new Error("DEMO_PASSWORD must contain at least 8 characters");
  if (isProduction) {
    throw new Error("The development/CI seed must not be run in production. Provision staff and customers through controlled production onboarding.");
  }

  let admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        fullName: "Kuula Admin",
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 12),
        role: "admin",
        phoneVerified: true,
        verified: true,
      },
    });
    console.log(`Created isolated admin user: ${adminEmail}`);
  } else {
    console.log(`Admin user already exists: ${adminEmail}`);
  }

  let demo = await prisma.user.findUnique({ where: { phone: demoPhone } });
  if (!demo) {
    demo = await prisma.user.create({
      data: {
        fullName: "Demo User",
        phone: demoPhone,
        email: "demo@kuula.test",
        passwordHash: await bcrypt.hash(demoPassword, 12),
        role: "user",
        nationalId: "CM8602410E8EWE",
        dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
        district: "Kampala",
        occupation: "Software Engineer",
        phoneVerified: true,
        kycVerified: true,
        verified: true,
        savingsAccount: { create: { balance: 0 } },
        wallet: { create: { balance: 0 } },
      },
    });
    console.log(`Created isolated demo user: ${demoPhone}`);
  } else {
    console.log(`Demo user already exists: ${demoPhone}`);
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 86_400_000);
  await prisma.creditEvidence.upsert({
    where: { provider_externalReference: { provider: "isolated-seed", externalReference: `momo-${demo.id}` } },
    update: {
      status: "verified",
      revokedAt: null,
      observedAt: now,
      expiresAt,
      momoMonths: 12,
      momoTxnCount: 150,
      verifiedBy: admin.id,
    },
    create: {
      userId: demo.id,
      sourceType: "mobile_money",
      provider: "isolated-seed",
      externalReference: `momo-${demo.id}`,
      momoMonths: 12,
      momoTxnCount: 150,
      observedAt: now,
      expiresAt,
      verifiedBy: admin.id,
    },
  });
  await prisma.creditEvidence.upsert({
    where: { provider_externalReference: { provider: "isolated-seed", externalReference: `crb-${demo.id}` } },
    update: {
      status: "verified",
      revokedAt: null,
      observedAt: now,
      expiresAt,
      crbStatus: "clean",
      verifiedBy: admin.id,
    },
    create: {
      userId: demo.id,
      sourceType: "crb",
      provider: "isolated-seed",
      externalReference: `crb-${demo.id}`,
      crbStatus: "clean",
      observedAt: now,
      expiresAt,
      verifiedBy: admin.id,
    },
  });

  console.log("Seeding complete. Seed records are for isolated development/test use only.");
}

main()
  .catch((error) => {
    console.error("Seed error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
