/** Preserve the current pg TLS verification when its SSL aliases change. */
function normalizeDatabaseUrl(connectionString) {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("Database URL must use PostgreSQL.");
  }
  // An explicit libpq compatibility setting already defines its SSL behavior.
  if (url.searchParams.get("uselibpqcompat") === "true") return connectionString;
  if (["prefer", "require", "verify-ca"].includes(url.searchParams.get("sslmode"))) {
    url.searchParams.set("sslmode", "verify-full");
    return url.toString();
  }
  return connectionString;
}

module.exports = { normalizeDatabaseUrl };
