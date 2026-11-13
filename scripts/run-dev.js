/**
 * MoveWall AI — Unified Development Runner
 * Menjalankan Backend (Express Port 3001) dan Frontend (Static Port 3000)
 * secara bersamaan dalam 1 terminal.
 *
 * Cara pakai:
 *   npm run dev
 *   atau
 *   node run-dev.js
 */

const { spawn, exec } = require("child_process");
const path = require("path");

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
};

const ROOT_DIR = path.resolve(__dirname, "..");
const BACKEND_DIR = path.join(ROOT_DIR, "game-ui", "backend");
const FRONTEND_DIR = path.join(ROOT_DIR, "game-ui");

console.log(`${colors.cyan}${colors.bold}==============================================================${colors.reset}`);
console.log(`${colors.cyan}${colors.bold}        🏃 MoveWall AI — Multi-Service Dev Runner             ${colors.reset}`);
console.log(`${colors.cyan}${colors.bold}==============================================================${colors.reset}`);
console.log(` ${colors.bold}Frontend :${colors.reset} ${colors.green}http://localhost:3000${colors.reset}`);
console.log(`   - Login     : http://localhost:3000/login`);
console.log(`   - Dashboard : http://localhost:3000/dashboard`);
console.log(`   - Game UI   : http://localhost:3000`);
console.log(` ${colors.bold}Backend  :${colors.reset} ${colors.cyan}http://localhost:3001${colors.reset}`);
console.log(`   - API Health: http://localhost:3001/api/health`);
console.log(`\n ${colors.yellow}${colors.bold}[INFO] Tekan Ctrl + C untuk menghentikan kedua service.${colors.reset}\n`);

// Helper untuk format stream output dengan prefix berwarna
function attachLogger(child, name, color) {
  const prefix = `${color}${colors.bold}[${name}]${colors.reset} `;

  function logChunk(data) {
    const lines = data.toString().split(/\r?\n/);
    for (const line of lines) {
      if (line.trim().length > 0) {
        console.log(`${prefix}${line}`);
      }
    }
  }

  if (child.stdout) child.stdout.on("data", logChunk);
  if (child.stderr) child.stderr.on("data", logChunk);
}

// Deteksi binary npm sesuai OS
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

// 1. Jalankan Backend (game-ui/backend)
const backend = spawn(`${npmCmd} run dev`, {
  cwd: BACKEND_DIR,
  shell: true,
  env: { ...process.env, FORCE_COLOR: "true" },
});
attachLogger(backend, "BACKEND ", colors.cyan);

// 2. Jalankan Frontend (game-ui)
const frontend = spawn(`${npmCmd} run dev`, {
  cwd: FRONTEND_DIR,
  shell: true,
  env: { ...process.env, FORCE_COLOR: "true" },
});
attachLogger(frontend, "FRONTEND", colors.green);

let isShuttingDown = false;

// Fungsi pembersihan proses saat dihentikan (Ctrl + C)
function cleanup(exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n${colors.yellow}${colors.bold}[SYSTEM] Menghentikan semua service (Frontend & Backend)...${colors.reset}`);

  function killProcess(proc, name) {
    if (!proc || !proc.pid) return;
    if (process.platform === "win32") {
      // Menghentikan seluruh process tree di Windows agar tidak ada orphan process/port macet
      try {
        exec(`taskkill /pid ${proc.pid} /T /F`, () => {});
      } catch (err) {
        // Abaikan jika proses sudah keluar sebelumnya
      }
    } else {
      try {
        proc.kill("SIGTERM");
      } catch (err) {}
    }
  }

  killProcess(backend, "Backend");
  killProcess(frontend, "Frontend");

  setTimeout(() => {
    console.log(`${colors.green}[SYSTEM] Semua service berhasil dihentikan. Sampai jumpa!${colors.reset}`);
    process.exit(exitCode);
  }, 500);
}

// Tangani event shutdown
process.on("SIGINT", () => cleanup(0));
process.on("SIGTERM", () => cleanup(0));
process.on("exit", () => cleanup(0));

backend.on("close", (code) => {
  if (!isShuttingDown && code !== 0 && code !== null) {
    console.log(`${colors.red}[BACKEND] Berhenti dengan kode exit ${code}${colors.reset}`);
  }
});

frontend.on("close", (code) => {
  if (!isShuttingDown && code !== 0 && code !== null) {
    console.log(`${colors.red}[FRONTEND] Berhenti dengan kode exit ${code}${colors.reset}`);
  }
});
