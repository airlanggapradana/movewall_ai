/* Real PostgreSQL + HTTP + optional browser integration. Never uses .env URLs.
 * TEST_DATABASE_URL must point to a disposable local cluster; this test creates
 * and drops only its own randomly named database. RUN_BROWSER=1 adds Chrome QA.
 */
const assert = require("node:assert/strict");
const { readFileSync, readdirSync, mkdtempSync } = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { once } = require("node:events");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

async function main() {
  const rawUrl = process.env.TEST_DATABASE_URL;
  if (!rawUrl) throw new Error("Set TEST_DATABASE_URL to a disposable local PostgreSQL cluster.");
  const url = new URL(rawUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.username !== "movewall_test" || url.port !== "55432") {
    throw new Error("Tests require a dedicated loopback cluster on port 55432 with user movewall_test.");
  }
  const database = `movewall_registration_test_${randomUUID().replaceAll("-", "")}`;
  const control = new Pool({ connectionString: rawUrl });
  let pool, app, server, frontend, browser, databaseCreated = false;
  const password = "test-registration-password-2026";
  try {
    await control.query(`CREATE DATABASE "${database}"`);
    databaseCreated = true;
    url.pathname = `/${database}`;
    pool = new Pool({ connectionString: url.toString() });
    const root = path.resolve(__dirname, "../prisma/migrations");
    const migrations = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    const hash = await bcrypt.hash(password, 10);
    for (const migration of migrations) {
      if (migration.endsWith("admin_approval")) {
        await pool.query(`INSERT INTO therapists (name, username, password, email, "isActive", "updatedAt") VALUES
          ('Legacy active', 'legacy-active', $1, 'legacy@example.test', true, NOW()),
          ('Legacy disabled', 'legacy-disabled', $1, 'disabled@example.test', false, NOW())`, [hash]);
        await pool.query(`INSERT INTO subscriptions ("therapistId", status, "updatedAt") SELECT id, 'ACTIVE', NOW() FROM therapists WHERE username = 'legacy-active'`);
      }
      await pool.query(readFileSync(path.join(root, migration, "migration.sql"), "utf8"));
    }
    const legacy = (await pool.query(`SELECT username, "applicationStatus", "isActive" FROM therapists ORDER BY id`)).rows;
    assert.deepEqual(legacy.map(row => [row.applicationStatus, row.isActive]), [["APPROVED", true], ["SUSPENDED", false]]);
    assert.equal((await pool.query("SELECT status FROM subscriptions")).rows[0].status, "ACTIVE");
    console.log("PASS migrations preserve existing access and subscription data");

    process.env.DATABASE_URL = url.toString();
    process.env.JWT_SECRET = "local-e2e-secret-never-used-for-production";
    process.env.NOTIFICATION_WORKER_ENABLED = "false";
    process.env.RESEND_API_KEY = ""; process.env.EMAIL_FROM = "";
    process.env.ALLOW_DEV_SEED = "false"; process.env.MIDTRANS_IS_PRODUCTION = "false";
    app = require("../server");
    const prisma = app.locals.prisma;
    const adminCandidate = await prisma.therapist.create({ data: { name: "Test admin", username: "test-admin", email: "admin@example.test", password: hash } });
    const { bootstrapAdmin } = require("../scripts/bootstrap-admin");
    await bootstrapAdmin(prisma, adminCandidate.username);
    await assert.rejects(bootstrapAdmin(prisma, adminCandidate.username), /Admin sudah/);
    server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const origin = `http://127.0.0.1:${server.address().port}`;
    async function request(endpoint, { token, method = "GET", body } = {}) {
      const response = await fetch(`${origin}/api${endpoint}`, { method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, data: await response.json() };
    }
    async function login(username) {
      const response = await request("/auth/login", { method: "POST", body: { username, password } });
      assert.equal(response.status, 200); assert.equal(response.data.therapist.password, undefined); return response.data;
    }
    const adminSession = await login("test-admin"); assert.equal(adminSession.redirect, "admin.html");
    const invalidLogin = await request("/auth/login", { method: "POST", body: { username: "test-admin", password: "incorrect-password" } });
    assert.equal(invalidLogin.status, 401); assert.equal(invalidLogin.data.token, undefined);
    const profile = { name: "Rina <uji>", username: "rina-e2e", email: "rina@example.test", clinicName: "Klinik Rina", specialization: "Fisioterapi Bahu", password };
    const registered = await request("/auth/register", { method: "POST", body: { ...profile, role: "ADMIN", isActive: false, applicationStatus: "APPROVED", reviewedById: adminCandidate.id } });
    assert.equal(registered.status, 201); assert.equal(registered.data.therapist.role, "THERAPIST"); assert.equal(registered.data.therapist.applicationStatus, "PENDING");
    assert.equal(registered.data.therapist.password, undefined);
    const userId = registered.data.therapist.id;
    const patient = await prisma.patient.create({ data: { name: "Test Patient", age: 30, medicalRecordNo: `E2E-${randomUUID()}`, therapistId: userId, homeAccessCode: "E2E-HOME-CODE" } });
    const userSession = await login(profile.username); assert.equal(userSession.redirect, "application.html");
    const token = userSession.token;
    assert.equal((await request("/auth/register", { method: "POST", body: profile })).status, 409);
    assert.equal((await request("/auth/register", { method: "POST", body: { ...profile, email: "" } })).status, 400);
    assert.equal((await request("/admin/applications", { token })).status, 403);
    assert.equal((await request("/admin/applications", {})).status, 401);
    assert.equal((await request("/admin/applications", { token: adminSession.token })).status, 200);
    for (const endpoint of ["/admin/dashboard", "/admin/activity", "/admin/notifications"]) {
      assert.equal((await request(endpoint, { token })).status, 403, endpoint);
      assert.equal((await request(endpoint)).status, 401, endpoint);
      assert.equal((await request(endpoint, { token: adminSession.token })).status, 200, endpoint);
    }
    const dashboard = await request("/admin/dashboard", { token: adminSession.token });
    assert.equal(dashboard.data.counts.PENDING, 1); assert.equal(dashboard.data.total, 3);
    assert.equal(dashboard.data.verificationHours, null);
    assert.equal(dashboard.data.approvedMonthly, 0);
    assert.deepEqual(dashboard.data.specializations, ["Fisioterapi Bahu"]);
    for (const filter of ["?month=2026-13", "?specialization[x]=bad", "?q[x]=bad"]) assert.equal((await request(`/admin/applications${filter}`, { token: adminSession.token })).status, 400);
    assert.equal((await request("/admin/dashboard?month=2026-13", { token: adminSession.token })).status, 400);
    const filtered = await request("/admin/applications?specialization=Fisioterapi%20Bahu&status=PENDING&q=Rina", { token: adminSession.token });
    assert.equal(filtered.data.total, 1); assert.equal(filtered.data.applications[0].id, userId);
    assert.equal(filtered.data.counts.PENDING, 1); assert.equal(filtered.data.counts.APPROVED, 0);
    assert.equal((await request("/admin/applications?specialization=Nonexistent", { token: adminSession.token })).data.total, 0);
    const own = await request(`/auth/application?id=${adminCandidate.id}`, { token }); assert.equal(own.data.application.id, userId);
    assert.equal((await request("/admin/applications/invalid", { token: adminSession.token })).status, 400);
    console.log("PASS registration, limited login, bootstrap and admin/owner isolation");

    async function clinicalBlocked() {
      for (const [endpoint, method] of [["/patients", "GET"], ["/assessments", "GET"], ["/dashboard/stats", "GET"], ["/assessment", "POST"], ["/subscription/status", "GET"], ["/subscription/create-transaction", "POST"]]) {
        const result = await request(endpoint, { token, method, ...(method === "POST" ? { body: {} } : {}) });
        assert.equal(result.status, 403, endpoint); assert.equal(result.data.requiresApproval, true, endpoint);
      }
      assert.equal((await request("/home-session/E2E-HOME-CODE")).status, 403);
      assert.equal((await request("/home-session/E2E-HOME-CODE/assessment", { method: "POST", body: { missionId: 1 } })).status, 403);
    }
    await clinicalBlocked();
    async function decide(action, reason = "Alasan uji yang terlihat oleh pendaftar") {
      const account = await prisma.therapist.findUnique({ where: { id: userId } });
      const result = await request(`/admin/applications/${userId}/decision`, { token: adminSession.token, method: "POST", body: {
        action, reason, expectedVersion: account.applicationVersion, checklist: { identity: true, clinic: true, profession: true },
      } }); assert.equal(result.status, 200, JSON.stringify(result.data)); return result.data.application;
    }
    await decide("REJECT"); await clinicalBlocked(); await decide("REOPEN");
    await decide("REQUEST_REVISION"); await clinicalBlocked();
    const revision = await request("/auth/application", { token });
    const resubmitted = await request("/auth/application", { token, method: "PUT", body: { ...profile, clinicName: "Klinik Diperbaiki", expectedVersion: revision.data.application.applicationVersion, role: "ADMIN" } });
    assert.equal(resubmitted.status, 200); assert.equal(resubmitted.data.application.applicationStatus, "PENDING");
    const currentVersion = resubmitted.data.application.applicationVersion;
    const reviews = await Promise.all(["APPROVE", "REJECT"].map(action => request(`/admin/applications/${userId}/decision`, { token: adminSession.token, method: "POST", body: {
      action, expectedVersion: currentVersion, reason: "Concurrent decision", checklist: { identity: true, clinic: true, profession: true },
    } })));
    assert.deepEqual(reviews.map(row => row.status).sort(), [200, 409]);
    let current = await prisma.therapist.findUnique({ where: { id: userId } });
    if (current.applicationStatus === "REJECTED") { await clinicalBlocked(); await decide("REOPEN"); await decide("APPROVE"); }
    assert.equal(await prisma.subscription.count({ where: { therapistId: userId } }), 0);
    assert.equal((await request("/subscription/status", { token })).status, 200);
    assert.equal((await request("/patients", { token })).data.requiresSubscription, true);
    assert.equal((await request("/auth/application", { token, method: "PUT", body: { ...profile, expectedVersion: currentVersion + 1 } })).status, 403);
    assert.equal((await request("/home-session/E2E-HOME-CODE")).status, 200);
    await decide("SUSPEND"); await clinicalBlocked();
    const suspendedLogin = await login(profile.username);
    assert.equal(suspendedLogin.redirect, "application.html");
    assert.equal((await request("/patients", { token: suspendedLogin.token })).data.requiresApproval, true);
    assert.equal((await request("/home-session/E2E-HOME-CODE")).status, 403);
    assert.equal((await request("/home-session/E2E-HOME-CODE/assessment", { method: "POST", body: { missionId: 1 } })).status, 403);
    await decide("RESTORE"); assert.equal((await request("/home-session/E2E-HOME-CODE")).status, 200);
    assert.equal((await request("/patients", { token: adminSession.token })).status, 403);
    await prisma.subscription.create({ data: { therapistId: userId, status: "ACTIVE", startDate: new Date(), endDate: new Date(Date.now() + 86400000) } });
    const directory = await request("/patients", { token }); assert.equal(directory.status, 200);
    const legacySession = await login("legacy-active");
    // Give the legacy account a current plan so the ownership check is reached.
    await prisma.subscription.update({ where: { therapistId: legacySession.therapist.id }, data: { startDate: new Date(), endDate: new Date(Date.now() + 86400000) } });
    assert.equal((await request(`/patients/${patient.id}/report`, { token: legacySession.token })).status, 404);
    const timeline = await request("/auth/application", { token });
    assert.equal(timeline.data.history[0].toStatus, "PENDING");
    assert.equal(timeline.data.history.at(-1).toStatus, "APPROVED");
    assert.equal(timeline.data.history.at(-1).reason, "Alasan uji yang terlihat oleh pendaftar");
    assert.equal(await prisma.applicationDecision.count({ where: { therapistId: userId } }), timeline.data.history.length);
    const reviewedDashboard = await request("/admin/dashboard", { token: adminSession.token });
    assert.equal(reviewedDashboard.data.approvedMonthly, 1); // Restoration is not a new approval.
    assert.equal(reviewedDashboard.data.approvalWeeks.reduce((sum, week) => sum + week.count, 0), 1);
    assert.equal(reviewedDashboard.data.verificationHours >= 0, true);
    const activity = await request("/admin/activity", { token: adminSession.token });
    assert.equal(activity.data.events.some(event => event.therapistId === userId), true);
    assert.equal(JSON.stringify(activity.data).includes('"password"'), false);
    console.log("PASS revision, concurrent decisions, clinical/payments, subscription independence and old-token/home-session revocation");

    const { processNotifications } = require("../lib/notifications");
    await processNotifications({ prisma, transport: async () => { throw new Error("Fake email outage"); }, batchSize: 100 });
    assert.equal((await prisma.therapist.findUnique({ where: { id: userId } })).applicationStatus, "APPROVED");
    const queued = await prisma.notificationOutbox.findFirst({ where: { therapistId: userId } });
    assert.equal(queued.attempts, 1); assert.equal(queued.status, "PENDING");
    await prisma.notificationOutbox.updateMany({ data: { nextAttemptAt: new Date(0) } });
    const delivered = [];
    await processNotifications({ prisma, transport: async job => { delivered.push(job.eventId); return `fake-${job.eventId}`; }, batchSize: 100 });
    await processNotifications({ prisma, transport: async () => { throw new Error("Duplicate email"); }, batchSize: 100 });
    assert.equal(new Set(delivered).size, delivered.length);
    assert.equal(await prisma.notificationOutbox.count({ where: { status: "SENT" } }), delivered.length);
    console.log("PASS persistent email failure/retry/idempotency with fake transport");

    if (process.env.RUN_BROWSER === "1") {
      const { chromium } = require("../../node_modules/playwright");
      const artifactDir = mkdtempSync(path.join(os.tmpdir(), "movewall-registration-qa-"));
      frontend = spawn(process.execPath, [path.resolve(__dirname, "../../dev-server.js")], { env: { ...process.env, PORT: "3417", BACKEND_PORT: String(server.address().port) }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Frontend startup timed out")), 10000);
        frontend.stdout.on("data", chunk => { if (chunk.toString().includes("3417")) { clearTimeout(timeout); resolve(); } });
        frontend.once("error", reject); frontend.once("exit", code => reject(new Error(`Frontend exited: ${code}`)));
      });
      browser = await chromium.launch({ channel: "chrome", headless: true });
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.addInitScript(backend => sessionStorage.setItem("mw_backend_url", backend), origin);
      const page = await context.newPage(); const errors = []; page.on("pageerror", err => errors.push(err.message));
      await page.goto("http://127.0.0.1:3417/register.html");
      await page.locator("#regName").fill("Terapis Browser"); await page.locator("#regUsername").fill("browser-user");
      await page.locator("#regEmail").fill("browser@example.test"); await page.locator("#regClinic").fill("Klinik Browser");
      await page.locator("#regPassword").fill(password); await page.locator("#regPasswordConfirm").fill(password);
      assert.equal(await page.locator("[name=inviteCode]").count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(artifactDir, "registration-mobile.png"), fullPage: true });
      await page.getByRole("button", { name: "Ajukan pendaftaran" }).click();
      await page.locator("#regSuccess:not(.hidden)").waitFor();
      await page.locator("#regSuccessLogin").click(); await page.locator("#loginUsername").fill("browser-user"); await page.locator("#loginPassword").fill(password);
      await page.locator("#loginSubmitBtn").click(); await page.waitForURL("**/application.html");
      await page.getByRole("heading", { name: "Menunggu pemeriksaan", exact: true }).waitFor();
      const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await adminContext.addInitScript(({ backend, session }) => { sessionStorage.setItem("mw_backend_url", backend); sessionStorage.setItem("mw_token", session.token); sessionStorage.setItem("mw_therapist", JSON.stringify(session.therapist)); }, { backend: origin, session: adminSession });
      const adminPage = await adminContext.newPage(); adminPage.on("pageerror", err => errors.push(err.message));
      await adminPage.goto("http://127.0.0.1:3417/admin.html"); await adminPage.getByRole("button", { name: /Terapis Browser/ }).click();
      await adminPage.locator("#metricPending").filter({ hasText: "1" }).waitFor();
      await adminPage.locator("#profileButton").click(); await adminPage.getByRole("dialog").getByRole("heading", { name: "Profil pengajuan" }).waitFor();
      await adminPage.locator("#closeDialog").click();
      await adminPage.locator("#inviteButton").click(); assert.match(await adminPage.locator("#registrationLink").inputValue(), /register.html$/); await adminPage.locator("#closeDialog").click();
      await adminPage.locator("#auditButton").click(); await adminPage.locator("#dialogBody .event-list li").first().waitFor(); await adminPage.locator("#closeDialog").click();
      await adminPage.locator("#settingsButton").click(); await adminPage.getByRole("dialog").getByText("WITA (UTC+08)", { exact: true }).waitFor(); await adminPage.locator("#closeDialog").click();
      await adminPage.locator("#notificationsButton").click(); await adminPage.locator("#mailStatus").waitFor(); await adminPage.locator("#closeDialog").click();
      await adminPage.locator("#search").fill("Tidak Ada Klinik Ini"); await adminPage.locator("#filters").getByRole("button", { name: "Tampilkan" }).click();
      await adminPage.locator("#applications").getByText("Tidak ada pengajuan yang sesuai dengan filter ini.", { exact: true }).waitFor();
      await adminPage.locator("#search").fill(""); await adminPage.locator("#filters").getByRole("button", { name: "Tampilkan" }).click();
      await adminPage.getByRole("button", { name: /Terapis Browser/ }).click();
      await adminPage.locator("#reason").fill("Lengkapi nama klinik Anda."); await adminPage.locator('[data-action="REQUEST_REVISION"]').click();
      await adminPage.locator("#statusBadge").filter({ hasText: "Perlu revisi" }).waitFor();
      await page.locator("#refresh").click(); await page.locator("#revisionSection:not(.hidden)").waitFor();
      await page.locator("#revisionForm [name=clinicName]").fill("Klinik Browser Diperbaiki"); await page.locator("#resubmit").click();
      await page.getByRole("heading", { name: "Menunggu pemeriksaan", exact: true }).waitFor();
      await adminPage.locator("#filters button").click(); await adminPage.getByRole("button", { name: /Terapis Browser/ }).click();
      for (const name of ["identity", "clinic", "profession"]) await adminPage.locator(`[name=${name}]`).check();
      await adminPage.screenshot({ path: path.join(artifactDir, "admin-review.png"), fullPage: true });
      await adminPage.locator('[data-action="APPROVE"]').click(); await adminPage.locator("#statusBadge").filter({ hasText: "Disetujui" }).waitFor();
      await page.locator("#refresh").click(); await page.locator("#dashboardLink:not(.hidden)").waitFor();
      await page.screenshot({ path: path.join(artifactDir, "approved-status-mobile.png"), fullPage: true });
      // Approval grants dashboard entry; the paid clinical features still require a subscription.
      const browserAccount = await prisma.therapist.findUnique({ where: { username: "browser-user" } });
      assert.equal(await prisma.subscription.count({ where: { therapistId: browserAccount.id } }), 0);
      await prisma.subscription.create({ data: { therapistId: browserAccount.id, status: "ACTIVE", startDate: new Date(), endDate: new Date(Date.now() + 86400000) } });
      const statsResponse = page.waitForResponse(response => response.url() === `${origin}/api/dashboard/stats`);
      await page.locator("#dashboardLink").click(); await page.waitForURL("**/dashboard.html");
      assert.equal((await statsResponse).status(), 200);
      await adminPage.locator("#reason").fill("Penangguhan untuk pengujian."); await adminPage.locator('[data-action="SUSPEND"]').click();
      await adminPage.locator("#statusBadge").filter({ hasText: "Ditangguhkan" }).waitFor();
      await page.goto("http://127.0.0.1:3417/dashboard.html"); await page.waitForURL("**/application.html"); await page.getByRole("heading", { name: "Ditangguhkan", exact: true }).waitFor();
      for (const game of ["index.html", "mission2.html"]) {
        await page.goto(`http://127.0.0.1:3417/${game}`); await page.waitForURL("**/application.html");
        await page.getByRole("heading", { name: "Ditangguhkan", exact: true }).waitFor();
      }
      await adminPage.setViewportSize({ width: 390, height: 844 });
      assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await adminPage.screenshot({ path: path.join(artifactDir, "admin-mobile.png"), fullPage: true });
      await adminPage.locator('#statusTabs button[data-status="SUSPENDED"]').click();
      await adminPage.getByRole("button", { name: /Terapis Browser/ }).click();
      await adminPage.locator("#statusBadge").filter({ hasText: "Ditangguhkan" }).waitFor();
      await adminPage.locator("#reason").fill("Akses demo dipulihkan.");
      for (const name of ["identity", "clinic", "profession"]) await adminPage.locator(`[name=${name}]`).check();
      await adminPage.locator('[data-action="RESTORE"]').click();
      await adminPage.locator("#statusBadge").filter({ hasText: "Disetujui" }).waitFor();
      await adminPage.setViewportSize({ width: 320, height: 780 });
      assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
      console.log(`PASS Chrome registration, login routing, revision, approval, subscribed clinical dashboard, suspension, responsive layouts; screenshots: ${artifactDir}`);
    }
    // Exercise throttling after all user journeys so it cannot affect them.
    let throttled = false;
    for (let i = 0; i < 8; i++) throttled ||= (await request("/auth/register", { method: "POST", body: {} })).status === 429;
    assert.equal(throttled, true);
    for (const [endpoint, attempts, method, body] of [
      ["/auth/login", 16, "POST", {}],
      ["/auth/application", 6, "PUT", { ...profile, expectedVersion: 0 }],
    ]) {
      let blocked = false;
      for (let i = 0; i < attempts; i++) blocked ||= (await request(endpoint, { token, method, body })).status === 429;
      assert.equal(blocked, true, endpoint);
    }
    console.log("PASS registration, login and resubmission rate limits");
  } finally {
    if (browser) await browser.close();
    if (frontend) { frontend.kill(); await once(frontend, "exit").catch(() => {}); }
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (app) await app.locals.closeDatabase();
    if (pool) await pool.end();
    try {
      if (databaseCreated && /^movewall_registration_test_[a-f0-9]{32}$/.test(database)) await control.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    } finally { await control.end(); }
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
