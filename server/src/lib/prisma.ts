import { PrismaClient } from "@prisma/client";
import { databaseUrlWithPoolDefaults } from "./database-url.js";

if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = databaseUrlWithPoolDefaults(process.env.DATABASE_URL);
}

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
});

export default prisma;
