// --- DreamPlay: log-action ---
// Accepts POST JSON: { wallet, action, points, note?, sponsor? }
// Or GET: ?wallet=0x..&action=...&points=20
// Persists to Netlify Blobs (siteID+token fallback), else memory.

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
function isHexAddress(x) { return /^0x[a-fA-F0-9]{40}$/.test(x || ""); }

// ESM SDK helper: works in CJS by dynamic import, and supports manual site creds.
async function getBlobsStore(name) {
  const { getStore } = await import("@netlify/blobs");
  const opts = { name };
  if (process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN) {
    opts.siteID = process.env.BLOBS_SITE_ID;
    opts.token = process.env.BLOBS_TOKEN;
  }
  return getStore(opts);
}

async function writeLog(entry) {
  try {
    const store = await getBlobsStore("actions");
    const key = `log/${Date.now()}-${(entry.wallet || "unknown").toLowerCase()}`;
    await store.set(key, JSON.stringify(entry));
    return { ok: true, storage: "blobs", key, diag: "blobs-ok" };
  } catch (e) {
    if (!globalThis.__LOGS) globalThis.__LOGS = [];
    globalThis.__LOGS.push(entry);
    return { ok: true, storage: "memory", size: globalThis.__LOGS.length, diag: `import-failed:${String(e && e.message || e)}` };
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: corsHeaders() };

  let wallet = "", action = "", points = 0, note = "", sponsor = "";
  try {
    if (event.httpMethod === "POST" && event.body) {
      const b = JSON.parse(event.body || "{}");
      wallet = (b.wallet || "").trim();
      action = (b.action || "").trim();
      points = Number(b.points || 0);
      note = (b.note || "").trim();
      sponsor = (b.sponsor || "").trim();
    }
    if (!wallet) wallet = (event.queryStringParameters?.wallet || "").trim();
    if (!action) action = (event.queryStringParameters?.action || "").trim();
    if (!points) points = Number(event.queryStringParameters?.points || 0);
    if (!note) note = (event.queryStringParameters?.note || "").trim();
    if (!sponsor) sponsor = (event.queryStringParameters?.sponsor || "").trim();
  } catch (_) {}

  if (!isHexAddress(wallet)) return resp(400, { error: "Missing or invalid wallet" });
  if (!action) return resp(400, { error: "Missing action" });
  if (!Number.isFinite(points)) return resp(400, { error: "Invalid points" });

  const entry = {
    ts: new Date().toISOString(),
    wallet: wallet.toLowerCase(),
    action,
    points,
    note,
    sponsor: isHexAddress(sponsor) ? sponsor : undefined
  };

  try {
    const result = await writeLog(entry);
    return resp(200, { ok: true, ...result, entry });
  } catch (e) {
    return resp(500, { error: String(e.message || e) });
  }
};
