/* Shared routing and live access handling for therapist/admin sessions. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MoveWallSession = factory(root);
})(typeof window !== "undefined" ? window : globalThis, function (win) {
  function routeFor(account) {
    if (account?.role === "ADMIN" && account.isActive && account.applicationStatus === "APPROVED") return "admin.html";
    if (account?.role === "THERAPIST" && account.isActive && account.applicationStatus === "APPROVED") return "dashboard.html";
    return "application.html";
  }
  function apiBaseFor({ hostname, origin, override, configured, useLocal }) {
    const local = ["localhost", "127.0.0.1"].includes(hostname);
    const backend = override || configured || (local
      ? (useLocal !== "false" ? "http://localhost:3001" : "https://movewall-backend-production.up.railway.app")
      : origin);
    return `${backend.replace(/\/$/, "")}/api`;
  }
  if (!win) return { routeFor, apiBaseFor };
  const apiBase = apiBaseFor({ hostname: win.location.hostname, origin: win.location.origin,
    override: sessionStorage.getItem("mw_backend_url"), configured: win.MOVEWALL_BACKEND_URL,
    useLocal: sessionStorage.getItem("mw_use_local_backend") });
  const originalFetch = win.fetch.bind(win);
  function logout() {
    sessionStorage.removeItem("mw_token");
    sessionStorage.removeItem("mw_therapist");
    win.location.replace("./login.html");
  }
  win.fetch = async function (input, options) {
    const response = await originalFetch(input, options);
    const url = typeof input === "string" ? input : input?.url;
    if (url && (url.startsWith(`${apiBase}/`) || url.startsWith("/api/")) && sessionStorage.getItem("mw_token")) {
      if (response.status === 401 && !url.endsWith("/auth/login")) logout();
      if (response.status === 403) {
        const error = await response.clone().json().catch(() => ({}));
        if (error.requiresApproval) win.location.replace(`./${error.redirect === "admin.html" ? "admin.html" : "application.html"}`);
      }
    }
    return response;
  };
  async function request(path, options = {}) {
    const token = sessionStorage.getItem("mw_token");
    if (!token) { logout(); throw new Error("Silakan masuk terlebih dahulu."); }
    let response;
    try {
      response = await win.fetch(`${apiBase}${path}`, {
        cache: "no-store", ...options,
        headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token}`, ...options.headers },
      });
    } catch {
      throw Object.assign(new Error("Koneksi ke server terputus. Perbarui status untuk memastikan hasil permintaan."), { code: "NETWORK_ERROR" });
    }
    let data;
    try { data = await response.json(); }
    catch { throw Object.assign(new Error("Respons server belum dapat dibaca. Perbarui status sebelum mencoba kembali."), { code: "NETWORK_ERROR", status: response.status }); }
    if (!response.ok) throw Object.assign(new Error(data.error || "Permintaan belum dapat diproses."), { status: response.status, errors: data.errors });
    return data;
  }
  async function verify() {
    const data = await request("/auth/me");
    sessionStorage.setItem("mw_therapist", JSON.stringify(data.therapist));
    return data.therapist;
  }
  return { routeFor, apiBase, request, verify, logout };
});
