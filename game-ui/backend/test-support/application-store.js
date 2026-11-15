const { randomUUID } = require("node:crypto");
function createStore(initial = []) {
  let state = { accounts: structuredClone(initial), decisions: [], notifications: [] };
  let serial = Promise.resolve();
  const select = (row, fields) => !row ? null : structuredClone(fields ? Object.fromEntries(Object.keys(fields).map(key => [key, row[key]])) : row);
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some(part => matches(row, part));
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("lte" in value) return row[key] != null && row[key] <= value.lte;
      if ("contains" in value) return String(row[key] || "").toLowerCase().includes(value.contains.toLowerCase());
    }
    return row[key] === value;
  });
  const update = (row, data) => { for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === "object" && "increment" in value ? (row[key] || 0) + value.increment : value; };
  const api = {
    get state() { return state; },
    therapist: {
      async findUnique({ where, select: fields }) { return select(state.accounts.find(row => matches(row, where)), fields); },
      async findMany({ where, select: fields, take = 25, skip = 0 }) { return state.accounts.filter(row => matches(row, where)).slice(skip, skip + take).map(row => select(row, fields)); },
      async count({ where }) { return state.accounts.filter(row => matches(row, where)).length; },
      async create({ data, select: fields }) {
        if (state.accounts.some(row => row.username === data.username || row.email === data.email)) throw { code: "P2002", meta: { target: ["username"] } };
        const row = { id: Math.max(0, ...state.accounts.map(row => row.id)) + 1, applicationVersion: 0, submittedAt: new Date(), createdAt: new Date(), ...data };
        state.accounts.push(row); return select(row, fields);
      },
      async updateMany({ where, data }) { const rows = state.accounts.filter(row => matches(row, where)); rows.forEach(row => update(row, data)); return { count: rows.length }; },
      async update({ where, data, select: fields }) { const row = state.accounts.find(row => matches(row, where)); update(row, data); return select(row, fields); },
    },
    applicationDecision: {
      async create({ data }) { const row = { id: randomUUID(), createdAt: new Date(), ...data }; state.decisions.push(row); return structuredClone(row); },
      async findMany({ where, select: fields }) { return state.decisions.filter(row => matches(row, where)).map(row => select(row, fields)); },
    },
    notificationOutbox: {
      async create({ data }) { const row = { id: randomUUID(), status: "PENDING", attempts: 0, createdAt: new Date(), nextAttemptAt: new Date(), firstAttemptAt: null, ...data }; state.notifications.push(row); return structuredClone(row); },
      async findUnique({ where }) { return select(state.notifications.find(row => matches(row, where))); },
      async findMany({ where, select: fields, take = 30 }) { return state.notifications.filter(row => matches(row, where)).slice(0, take).map(row => select(row, fields)); },
      async updateMany({ where, data }) { const rows = state.notifications.filter(row => matches(row, where)); rows.forEach(row => update(row, data)); return { count: rows.length }; },
    },
    async $transaction(fn) {
      const run = serial.then(async () => { const before = structuredClone(state); try { return await fn(api); } catch (err) { state = before; throw err; } });
      serial = run.catch(() => {}); return run;
    },
  };
  return api;
}
module.exports = { createStore };
