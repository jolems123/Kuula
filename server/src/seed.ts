import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create admin user
  const adminEmail = process.env.ADMIN_EMAIL || "admin@kuula.ug";
  const adminPassword = process.env.ADMIN_PASSWORD || "Admin@123456";

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existingAdmin) {
    console.log(`Admin user already exists: ${adminEmail}`);
  } else {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await prisma.user.create({
      data: {
        fullName: "Kuula Admin",
        email: adminEmail,
        passwordHash,
        role: "admin",
        phoneVerified: true,
        verified: true,
      },
    });
    console.log(`Created admin user: ${adminEmail}`);
  }

  // Create a demo user for testing
  const demoPhone = process.env.DEMO_PHONE || "+256700000000";
  const demoPassword = process.env.DEMO_PASSWORD || "12345678";

  const existingDemo = await prisma.user.findUnique({ where: { phone: demoPhone } });
  if (existingDemo) {
    console.log(`Demo user already exists: ${demoPhone}`);
  } else {
    const passwordHash = await bcrypt.hash(demoPassword, 12);
    await prisma.user.create({
      data: {
        fullName: "Demo User",
        phone: demoPhone,
        email: "demo@kuula.ug",
        passwordHash,
        role: "user",
        nationalId: "CM1234567890",
        district: "Kampala",
        occupation: "Software Engineer",
        phoneVerified: true,
        kycVerified: true,
        savingsAccount: { create: { balance: 500000 } },
        wallet: { create: { balance: 100000 } },
      },
    });
    console.log(`Created demo user: ${demoPhone} / ${demoPassword}`);
  }

  console.log("Seeding complete.");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
