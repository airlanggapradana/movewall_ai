// Promotes exactly one explicitly named, existing account. No public API,
// default password, automatic account creation, or implicit owner selection.
const { connectDatabase } = require("./database");
async function bootstrapAdmin(prisma, username) {
  if (typeof username !== "string" || !username.trim()) throw new Error("Gunakan --username <akun-pemilik-yang-disepakati>.");
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73151015)`;
    if (await tx.therapist.count({ where: { role: "ADMIN" } })) throw new Error("Admin sudah tersedia. Bootstrap hanya untuk admin pertama.");
    const account = await tx.therapist.findUnique({ where: { username: username.trim() } });
    if (!account || !account.isActive) throw new Error("Akun tidak ditemukan atau dinonaktifkan.");
    // Do not turn a clinician with existing patients into a nonclinical admin.
    const patients = await tx.patient.count({ where: { therapistId: account.id } });
    if (patients) throw new Error("Gunakan akun admin khusus yang tidak menangani pasien.");
    const admin = await tx.therapist.update({ where: { id: account.id }, data: {
      role: "ADMIN", applicationStatus: "APPROVED", applicationVersion: { increment: 1 }, reviewedAt: new Date(),
    }, select: { id: true, username: true, role: true } });
    await tx.applicationDecision.create({ data: {
      therapistId: admin.id, actorId: admin.id, version: account.applicationVersion + 1, fromStatus: account.applicationStatus, toStatus: "APPROVED",
      reason: "Admin pertama ditetapkan oleh pengelola melalui perintah bootstrap lokal.",
    } });
    return admin;
  }, { timeout: 15000 });
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--username") {
    console.error("Gunakan: npm run admin:bootstrap -- --username <akun-pemilik-yang-disepakati>"); process.exitCode = 1;
  } else {
    const db = connectDatabase();
    bootstrapAdmin(db.prisma, args[1]).then(admin => console.log(`Admin ditetapkan: ${admin.username} (ID ${admin.id}).`))
      .catch(err => { console.error(err.message); process.exitCode = 1; }).finally(() => db.close());
  }
}
module.exports = { bootstrapAdmin };
