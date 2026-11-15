require("dotenv").config();
const { Pool } = require("pg");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { normalizeDatabaseUrl } = require("../lib/database-url");
function connectDatabase() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL wajib diatur.");
  const pool = new Pool({ connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL) });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return { prisma, async close() { await prisma.$disconnect(); await pool.end(); } };
}
module.exports = { connectDatabase };
