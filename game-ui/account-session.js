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
  if (!win) return { routeFor };
  const local = ["localhost", "127.0.0.1"].includes(win.location.hostname);
  const origin = sessionStorage.getItem("mw_backend_url") || win.MOVEWALL_BACKEND_URL ||
    (local && sessionStorage.getItem("mw_use_local_backend") !== "false" ? "http://localhost:3001" : "https://movewall-backend-production.up.railway.app");
  const apiBase = `${origin.replace(/\/$/, "")}/api`;
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
    const response = await win.fetch(`${apiBase}${path}`, {
      ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options.headers },
    });
    const data = await response.json();
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
