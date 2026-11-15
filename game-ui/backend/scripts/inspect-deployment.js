// Read-only schema inspection. Never prints connection strings or patient data.
const { connectDatabase } = require("./database");
async function main() {
  const db = connectDatabase();
  try {
    const columns = await db.prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'therapists' ORDER BY ordinal_position`;
    const ledger = await db.prisma.$queryRaw`SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present`;
    const migrations = ledger[0].present ? await db.prisma.$queryRaw`SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back FROM _prisma_migrations ORDER BY started_at` : [];
    const accounts = columns.length ? await db.prisma.$queryRaw`SELECT role::text, COUNT(*)::int AS count FROM therapists GROUP BY role` : [];
    console.log(JSON.stringify({ therapistColumns: columns.map(row => row.column_name), migrationLedger: ledger[0].present, migrations, accounts }, null, 2));
  } finally { await db.close(); }
}
main().catch(err => { console.error(err.code || err.name, "Schema inspection failed."); process.exitCode = 1; });
