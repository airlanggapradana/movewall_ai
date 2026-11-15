const { connectDatabase } = require("./database");
const { processNotifications, createResendTransport } = require("../lib/notifications");
async function main() {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new Error("RESEND_API_KEY dan EMAIL_FROM wajib diatur di backend.");
  const db = connectDatabase();
  try {
    await processNotifications({ prisma: db.prisma, transport: createResendTransport({ apiKey: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM }) });
  } finally { await db.close(); }
}
main().catch(err => { console.error(err.message); process.exitCode = 1; });
