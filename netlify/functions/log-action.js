// netlify/functions/log-action.js
// Logs an action AND updates today's points with a 100/day cap.
// Sponsor is REQUIRED and must be Anchor/Launcher (validated by /admin-sponsors).

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
  };
}
function resp(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
    body: JSON.stringify(body)
  };
}
const isAddr = (x) => /^0x[a-fA-F0-9]{40}$/.test(x || "");
const todayStr = (d = new Date()) => d.toISOString().slice(0, 10);

async function getClaimsStore() {
  const blobs = await import("@netlify/blobs").catch(() => null);
  if (!blobs || !blobs.getStore) throw new Error("Blobs SDK not available");
  return blobs.getStore({
    name: "claims",
    ...(process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN
      ? { siteID: process.env.BLOBS_SITE_ID, token: process.env.BLOBS_TOKEN }
      : {})
  });
}
async function getActionsStore() {
  const blobs = await import("@netlify/blobs").catch(() => null);
  if (!blobs || !blobs.getStore) throw new Error("Blobs SDK not available");
  return blobs.getStore({
    name: "actions",
    ...(process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN
      ? { siteID: process.env.BLOBS_SITE_ID, token: process.env.BLOBS_TOKEN }
      : {})
  });
}

async function readClaimState(store, wallet) {
  const key = `claims/${wallet.toLowerCase()}.json`;
  const raw = await store.get(key);
  const json = raw ? JSON.parse(raw) : { lastClaimAt: 0, dayTotals: {} };
  return { key, json };
}
async function writeClaimState(store, key, json) {
  await store.set(key, JSON.stringify(json));
}

async function validateSponsor(addr) {
  // Calls your existing sponsor validator
  const url = `/.netlify/functions/admin-sponsors?sponsor=${addr}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok || !data?.valid) {
    throw new Error(data?.reason || "Sponsor is not Anchor/Launcher");
  }
  return true;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS")
    return { statusCode: 204, headers: corsHeaders() };

  // Allow GET status for convenience (does NOT mutate)
  if (event.httpMethod === "GET") {
    const q = event.queryStringParameters || {};
    const wallet = (q.wallet || "").trim();
    if (!isAddr(wallet)) return resp(400, { error: "Missing or invalid wallet" });

    try {
      const store = await getClaimsStore();
      const { json } = await readClaimState(store, wallet);
      const today = todayStr();
      const dayTotal = Number(json?.dayTotals?.[today] || 0);
      return resp(200, { ok: true, mode: "status", dayTotal, capped: dayTotal >= 100 });
    } catch (e) {
      return resp(500, { error: String(e?.message || e) });
    }
  }

  // POST: validate + award
  if (event.httpMethod !== "POST") return resp(405, { error: "Method not allowed" });

  let wallet = "", action = "", points = 0, note = "", sponsor = "";
  try {
    const b = JSON.parse(event.body || "{}");
    wallet = (b.wallet || "").trim();
    action = (b.action || "").trim();
    points = Number(b.points || 0);
    note = (b.note || "").trim();
    sponsor = (b.sponsor || "").trim();
  } catch (_) {}
  if (!isAddr(wallet)) return resp(400, { error: "Missing or invalid wallet" });
  if (!action) return resp(400, { error: "Missing action" });
  if (!Number.isFinite(points) || points <= 0) return resp(400, { error: "Invalid points" });
  if (!isAddr(sponsor)) return resp(400, { error: "Sponsor required and must be a valid address" });

  try {
    // 1) Enforce sponsor rule
    await validateSponsor(sponsor);

    // 2) Award with daily cap
    const claims = await getClaimsStore();
    const { key, json } = await readClaimState(claims, wallet);
    const today = todayStr();
    const todayTotal = Number(json?.dayTotals?.[today] || 0);
    const add = Math.min(points, Math.max(0, 100 - todayTotal));

    if (add > 0) {
      json.dayTotals[today] = todayTotal + add;
      await writeClaimState(claims, key, json);
    }

    // 3) Log the action separately
    const actions = await getActionsStore();
    const logKey = `log/${Date.now()}-${wallet.toLowerCase()}`;
    const entry = { ts: new Date().toISOString(), wallet: wallet.toLowerCase(), action, points, note, sponsor };
    await actions.set(logKey, JSON.stringify(entry));

    const out = {
      ok: true,
      awarded: add,
      dayTotal: Number(json.dayTotals[today] || 0),
      capped: (json.dayTotals[today] || 0) >= 100,
      entryKey: logKey
    };
    return resp(200, out);
  } catch (e) {
    return resp(400, { error: String(e?.message || e) });
  }
};
