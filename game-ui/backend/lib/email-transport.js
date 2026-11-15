const { createResendTransport } = require("./notifications");

function emailConfiguration(env = process.env) {
  const provider = env.EMAIL_PROVIDER || "resend";
  if (!["resend", "emailjs"].includes(provider)) throw new Error("EMAIL_PROVIDER harus resend atau emailjs.");
  return { provider, configured: provider === "emailjs"
    ? Boolean(env.EMAILJS_SERVICE_ID && env.EMAILJS_TEMPLATE_ID && env.EMAILJS_PUBLIC_KEY)
    : Boolean(env.RESEND_API_KEY && env.EMAIL_FROM) };
}

function createEmailJsTransport({ serviceId, templateId, approvalTemplateId, publicKey, privateKey, appUrl = "", replyTo = "", fetchImpl = fetch,
  now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  if (!serviceId || !templateId || !publicKey) throw new Error("Konfigurasi EmailJS belum lengkap.");
  let queue = Promise.resolve(), nextRequestAt = 0;
  const transport = job => {
    const run = queue.then(async () => {
      const delay = Math.max(0, nextRequestAt - now());
      if (delay) await sleep(delay);
      nextRequestAt = now() + 1100; // EmailJS permits one request per second.
      let response;
      try {
        response = await fetchImpl("https://api.emailjs.com/api/v1.0/email/send", {
          method: "POST", signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ service_id: serviceId,
            template_id: approvalTemplateId && job.subject === "MoveWall AI: Pengajuan disetujui" ? approvalTemplateId : templateId,
            user_id: publicKey,
            ...(privateKey ? { accessToken: privateKey } : {}),
            template_params: { to_email: job.recipient, to_name: job.therapist?.name || job.recipient,
              subject: job.subject, message: job.body, event_id: job.eventId,
              next_step_url: appUrl ? `${appUrl.replace(/\/+$/, "")}/login.html` : "",
              sender_name: "Administrator MoveWall", organization_name: "MoveWall AI", reply_to: replyTo } }),
        });
      } catch { throw Object.assign(new Error("EmailJS hasil pengiriman belum diketahui."), { uncertain: true }); }
      if (!response.ok) {
        const error = new Error(`EmailJS HTTP ${response.status}`);
        error.uncertain = response.status >= 500 || response.status === 408;
        error.permanent = !error.uncertain && response.status !== 429;
        throw error;
      }
      let body;
      try { body = (await response.text()).trim(); }
      catch { throw Object.assign(new Error("EmailJS hasil pengiriman belum diketahui."), { uncertain: true }); }
      if (body !== "OK" && body !== '"OK"') throw Object.assign(new Error("EmailJS hasil pengiriman belum diketahui."), { uncertain: true });
      return null; // EmailJS returns OK, not a provider message ID.
    });
    queue = run.catch(() => {});
    return run;
  };
  return Object.assign(transport, { provider: "emailjs", supportsIdempotency: false });
}

function createEmailTransport(env = process.env, options = {}) {
  const config = emailConfiguration(env);
  if (!config.configured) throw new Error(`Konfigurasi ${config.provider} belum lengkap.`);
  if (config.provider === "emailjs") return createEmailJsTransport({ serviceId: env.EMAILJS_SERVICE_ID,
    templateId: env.EMAILJS_TEMPLATE_ID, approvalTemplateId: env.EMAILJS_APPROVAL_TEMPLATE_ID,
    publicKey: env.EMAILJS_PUBLIC_KEY, privateKey: env.EMAILJS_PRIVATE_KEY,
    appUrl: env.APP_URL, replyTo: env.EMAILJS_REPLY_TO, ...options });
  return createResendTransport({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM, ...options });
}
module.exports = { emailConfiguration, createEmailJsTransport, createEmailTransport };
