import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

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
  const demoPhone = required("DEMO_PHONE");
  const demoPassword = required("DEMO_PASSWORD");

  if (adminPassword.length < 12 || /Admin@123456/i.test(adminPassword)) {
    throw new Error("ADMIN_PASSWORD must be a unique password of at least 12 characters");
  }
  if (demoPassword.length < 8) {
    throw new Error("DEMO_PASSWORD must contain at least 8 characters");
  }

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existingAdmin) {
    console.log(`Admin user already exists: ${adminEmail}`);
  } else {
    await prisma.user.create({
      data: {
        fullName: "Kuula Admin",
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 12),
        role: "admin",
        phoneVerified: true,
        verified: true,
      },
    });
    console.log(`Created admin user: ${adminEmail}`);
  }

  const existingDemo = await prisma.user.findUnique({ where: { phone: demoPhone } });
  if (existingDemo) {
    console.log(`Demo user already exists: ${demoPhone}`);
  } else {
    await prisma.user.create({
      data: {
        fullName: "Demo User",
        phone: demoPhone,
        email: "demo@kuula.test",
        passwordHash: await bcrypt.hash(demoPassword, 12),
        role: "user",
        nationalId: "CM8602410E8EWE",
        district: "Kampala",
        occupation: "Software Engineer",
        phoneVerified: true,
        kycVerified: true,
        savingsAccount: { create: { balance: 0 } },
        wallet: { create: { balance: 0 } },
      },
    });
    console.log(`Created demo user: ${demoPhone}`);
  }

  console.log("Seeding complete.");
}

main()
  .catch((error) => {
    console.error("Seed error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
