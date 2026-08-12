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

async function seedCreditNetworkCatalog() {
  await prisma.market.upsert({
    where: { code: "UG" },
    update: { countryName: "Uganda", currency: "UGX", dialingCode: "+256", defaultLocale: "en", status: "active" },
    create: {
      code: "UG",
      countryName: "Uganda",
      currency: "UGX",
      dialingCode: "+256",
      defaultLocale: "en",
      status: "active",
      config: { languages: ["en", "lg", "sw"], moneyRails: ["mtn_momo", "airtel_money"] },
    },
  });

  for (const product of [
    { code: "UG_BUSINESS_GROWTH", name: "Kuula Business", category: "business", purposeType: "working_capital", description: "Working capital for stock, equipment and productive business needs.", minAmount: 50_000, maxAmount: 2_000_000, minTermDays: 90, maxTermDays: 365, disbursementMode: "customer_or_verified_supplier", partnerRequired: false, metadata: { icon: "store", label: "Grow my business" } },
    { code: "UG_HEALTH_TIBAPAY", name: "TibaPay Health Finance", category: "health", purposeType: "medical_bill", description: "Restricted-purpose healthcare financing paid to an approved provider.", minAmount: 20_000, maxAmount: 2_000_000, minTermDays: 90, maxTermDays: 365, disbursementMode: "direct_payee", partnerRequired: true, metadata: { icon: "heart-pulse", label: "Pay for healthcare", partnerBrand: "TibaPay" } },
    { code: "UG_AGRI_SILIFI", name: "SiliFi Farm Finance", category: "agriculture", purposeType: "farm_inputs", description: "Restricted-purpose input finance paid directly to an approved agro-dealer.", minAmount: 20_000, maxAmount: 5_000_000, minTermDays: 90, maxTermDays: 365, disbursementMode: "direct_payee", partnerRequired: true, metadata: { icon: "sprout", label: "Finance farm inputs", partnerBrand: "SiliFi" } },
    { code: "UG_EDUCATION", name: "Kuula Education", category: "education", purposeType: "school_fees", description: "Education financing designed to settle approved school obligations.", minAmount: 50_000, maxAmount: 2_000_000, minTermDays: 90, maxTermDays: 365, disbursementMode: "direct_payee", partnerRequired: true, metadata: { icon: "graduation-cap", label: "Pay school fees" } },
    { code: "UG_ESSENTIALS", name: "Kuula Essentials", category: "essentials", purposeType: "essential_purchase", description: "Purpose-linked finance for essential household and productive purchases.", minAmount: 20_000, maxAmount: 1_000_000, minTermDays: 90, maxTermDays: 365, disbursementMode: "direct_payee", partnerRequired: true, metadata: { icon: "home", label: "Finance an essential need" } },
  ]) {
    await prisma.creditProduct.upsert({
      where: { code: product.code },
      update: { ...product, minAmount: BigInt(product.minAmount), maxAmount: BigInt(product.maxAmount), marketCode: "UG", status: "active" },
      create: { ...product, minAmount: BigInt(product.minAmount), maxAmount: BigInt(product.maxAmount), marketCode: "UG", status: "active" },
    });
  }

  for (const partner of [
    { code: "TIBAPAY_UG", name: "TibaPay", partnerType: "health_network", settlementMode: "direct_payee", metadata: { productCodes: ["UG_HEALTH_TIBAPAY"], statusLabel: "Healthcare network onboarding" } },
    { code: "SILIFI_UG", name: "SiliFi", partnerType: "agriculture_network", settlementMode: "direct_payee", metadata: { productCodes: ["UG_AGRI_SILIFI"], statusLabel: "Agro-dealer network onboarding" } },
  ]) {
    await prisma.partner.upsert({
      where: { code: partner.code },
      update: { ...partner, marketCode: "UG", status: "active" },
      create: { ...partner, marketCode: "UG", status: "active" },
    });
  }
}

async function main() {
  console.log("Seeding database...");

  const adminEmail = required("ADMIN_EMAIL").toLowerCase();
  const adminPassword = required("ADMIN_PASSWORD");
  const demoPhone = normalizeUgandaMobileMoneyPhone(required("DEMO_PHONE"));
  const demoPassword = required("DEMO_PASSWORD");
  const isProduction = process.env.NODE_ENV === "production";

  if (adminPassword.length < 12 || /Admin@123456/i.test(adminPassword)) throw new Error("ADMIN_PASSWORD must be a unique password of at least 12 characters");
  if (demoPassword.length < 8) throw new Error("DEMO_PASSWORD must contain at least 8 characters");
  if (isProduction) throw new Error("The development/CI seed must not be run in production. Provision staff and customers through controlled production onboarding.");

  await seedCreditNetworkCatalog();

  let admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    admin = await prisma.user.create({ data: { fullName: "Kuula Admin", email: adminEmail, passwordHash: await bcrypt.hash(adminPassword, 12), role: "admin", phoneVerified: true, verified: true } });
    console.log(`Created isolated admin user: ${adminEmail}`);
  } else console.log(`Admin user already exists: ${adminEmail}`);

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
        wallet: { create: { balance: 0 } },
      },
    });
    console.log(`Created isolated demo user: ${demoPhone}`);
  } else console.log(`Demo user already exists: ${demoPhone}`);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 86_400_000);
  await prisma.creditEvidence.upsert({
    where: { provider_externalReference: { provider: "isolated-seed", externalReference: `momo-${demo.id}` } },
    update: { status: "verified", revokedAt: null, observedAt: now, expiresAt, momoMonths: 12, momoTxnCount: 150, verifiedBy: admin.id },
    create: { userId: demo.id, sourceType: "mobile_money", provider: "isolated-seed", externalReference: `momo-${demo.id}`, momoMonths: 12, momoTxnCount: 150, observedAt: now, expiresAt, verifiedBy: admin.id },
  });
  await prisma.creditEvidence.upsert({
    where: { provider_externalReference: { provider: "isolated-seed", externalReference: `crb-${demo.id}` } },
    update: { status: "verified", revokedAt: null, observedAt: now, expiresAt, crbStatus: "clean", verifiedBy: admin.id },
    create: { userId: demo.id, sourceType: "crb", provider: "isolated-seed", externalReference: `crb-${demo.id}`, crbStatus: "clean", observedAt: now, expiresAt, verifiedBy: admin.id },
  });

  await prisma.growthLine.upsert({
    where: { userId: demo.id },
    update: { marketCode: "UG", totalLimit: BigInt(2_000_000), availableLimit: BigInt(2_000_000), status: "available", reviewedAt: now, expiresAt, rationale: { source: "isolated-seed", note: "Development-only Growth Line" } },
    create: { userId: demo.id, marketCode: "UG", totalLimit: BigInt(2_000_000), availableLimit: BigInt(2_000_000), status: "available", reviewedAt: now, expiresAt, rationale: { source: "isolated-seed", note: "Development-only Growth Line" } },
  });

  console.log("Seeding complete. Seed records are for isolated development/test use only.");
}

main()
  .catch((error) => { console.error("Seed error:", error); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
