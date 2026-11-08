/**
 * MoveWall AI — Local Development Static Server
 * Zero-dependency static server menggunakan modul bawaan Node.js (http, fs, path).
 * Mendukung Clean URLs (seperti Vercel): /login -> /login.html, /dashboard -> /dashboard.html
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const BACKEND_PORT = process.env.BACKEND_PORT || 3001;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".task": "application/octet-stream",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer((req, res) => {
  // CORS & Security headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. Forward request /api/* ke backend (Port 3001) secara otomatis
  if (req.url.startsWith("/api/")) {
    const proxyReq = http.request(
      {
        hostname: "localhost",
        port: BACKEND_PORT,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          host: `localhost:${BACKEND_PORT}`,
        },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on("error", () => {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: `Backend MoveWall tidak aktif di port ${BACKEND_PORT}`,
          tip: "Pastikan server backend sudah dijalankan lewat 'npm run dev'.",
        })
      );
    });

    req.pipe(proxyReq);
    return;
  }

  // 2. Parse URL path
  const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let reqPath = decodeURI(urlObj.pathname);

  if (reqPath === "/" || reqPath === "") {
    reqPath = "/index.html";
  }

  // Hapus trailing slash jika ada (misal /login/ -> /login)
  if (reqPath.length > 1 && reqPath.endsWith("/")) {
    reqPath = reqPath.slice(0, -1);
  }

  const directPath = path.normalize(path.join(PUBLIC_DIR, reqPath));

  // Cegah directory traversal di luar PUBLIC_DIR
  if (!directPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("403 Forbidden");
    return;
  }

  let resolvedFile = null;

  // Cek path langsung (misal /styles.css, /index.html)
  if (fs.existsSync(directPath)) {
    const stat = fs.statSync(directPath);
    if (stat.isFile()) {
      resolvedFile = directPath;
    } else if (stat.isDirectory()) {
      const dirIndex = path.join(directPath, "index.html");
      if (fs.existsSync(dirIndex) && fs.statSync(dirIndex).isFile()) {
        resolvedFile = dirIndex;
      }
    }
  }

  // Clean URLs: jika tidak ditemukan, coba tambahkan .html (misal /login -> login.html)
  if (!resolvedFile) {
    const htmlCandidate = directPath + ".html";
    if (fs.existsSync(htmlCandidate) && fs.statSync(htmlCandidate).isFile()) {
      resolvedFile = htmlCandidate;
    }
  }

  // Jika file ditemukan, stream ke respons
  if (resolvedFile) {
    const ext = path.extname(resolvedFile).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": fs.statSync(resolvedFile).size,
    });

    const stream = fs.createReadStream(resolvedFile);
    stream.pipe(res);
    return;
  }

  // 3. Fallback: Halaman 404 informatif jika route tidak ada
  res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 - Halaman Tidak Ditemukan | MoveWall AI</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      margin: 0;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 1rem;
      padding: 2.5rem;
      max-width: 480px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);
    }
    .badge {
      display: inline-block;
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      padding: 0.35rem 0.85rem;
      border-radius: 9999px;
      font-weight: 600;
      font-size: 0.875rem;
      margin-bottom: 1rem;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    h1 { margin: 0 0 0.5rem; font-size: 1.8rem; font-weight: 700; color: #fff; }
    p { color: #94a3b8; font-size: 0.95rem; line-height: 1.6; margin-bottom: 1.8rem; }
    code { background: #0f172a; padding: 0.2rem 0.4rem; border-radius: 0.3rem; color: #38bdf8; font-family: monospace; }
    .nav-grid { display: flex; flex-direction: column; gap: 0.75rem; }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      background: #3b82f6;
      color: white;
      text-decoration: none;
      padding: 0.75rem 1.25rem;
      border-radius: 0.5rem;
      font-weight: 600;
      font-size: 0.95rem;
      transition: all 0.2s;
    }
    .btn:hover { background: #2563eb; transform: translateY(-1px); }
    .btn-secondary { background: #334155; color: #e2e8f0; }
    .btn-secondary:hover { background: #475569; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Error 404</div>
    <h1>Halaman Tidak Ditemukan</h1>
    <p>Route <code>${escapeHtml(reqPath)}</code> tidak ditemukan. Pilih halaman yang ingin Anda buka:</p>
    <div class="nav-grid">
      <a href="/login" class="btn">🔐 Halaman Login Terapis</a>
      <a href="/dashboard" class="btn btn-secondary">📊 Dashboard Terapis</a>
      <a href="/index.html" class="btn btn-secondary">🎮 MoveWall Game UI</a>
    </div>
  </div>
</body>
</html>`);
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

server.listen(PORT, () => {
  console.log(`[MoveWall Frontend] 🌐 Local server berjalan di http://localhost:${PORT}`);
  console.log(`                    👉 Login:       http://localhost:${PORT}/login`);
  console.log(`                    👉 Dashboard:   http://localhost:${PORT}/dashboard`);
  console.log(`                    👉 Game UI:     http://localhost:${PORT}/index.html`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[MoveWall Frontend] ⚠️ Port ${PORT} sudah digunakan aplikasi lain!`);
  } else {
    console.error("[MoveWall Frontend] Error:", err.message);
  }
});
