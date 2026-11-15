const { connectDatabase } = require("./database");
const { processNotifications } = require("../lib/notifications");
const { createEmailTransport } = require("../lib/email-transport");
async function main() {
  const transport = createEmailTransport();
  const db = connectDatabase();
  try {
    await processNotifications({ prisma: db.prisma, transport });
  } finally { await db.close(); }
}
main().catch(err => { console.error(err.message); process.exitCode = 1; });
