// --- DreamPlay daily claim: rolling 24h + 100/day cap ---
// Accepts POST JSON { wallet } OR GET ?wallet=0x... (for easy testing)

const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;
const POINTS_PER_TASK = 100;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
  };
}
function resp(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
    body: JSON.stringify(body)
  };
}
function now(){ return Date.now(); }

// TEMP storage placeholder (replace with Blobs/Redis later)
async function getKV(){ return globalThis.__kv || (globalThis.__kv = new Map()); }

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: corsHeaders() };

  let wallet = "";
  try {
    if (event.httpMethod === "POST" && event.body) {
      const parsed = JSON.parse(event.body || "{}");
      wallet = (parsed.wallet || "").trim();
    }
    if (!wallet) {
      const params = new URLSearchParams(event.queryStringParameters || {});
      wallet = (params.get?.("wallet") || "").trim();
    }
  } catch (_) {}

  if (!wallet) return resp(400, { error: "Missing wallet" });

  try {
    const kv = await getKV();
    const lastKey = `claim:last:${wallet.toLowerCase()}`;
    const todayKey = `claim:total:${wallet.toLowerCase()}:${new Date().toISOString().slice(0,10)}`;

    const last = kv.get(lastKey) || 0;
    const elapsed = now() - last;
    if (elapsed < ROLLING_WINDOW_MS) {
      return resp(200, {
        alreadyClaimed: true,
        nextEligibleMs: ROLLING_WINDOW_MS - elapsed,
        pointsAwarded: 0
      });
    }

    const todayTotal = kv.get(todayKey) || 0;
    const add = Math.min(POINTS_PER_TASK, Math.max(0, 100 - todayTotal));
    if (add === 0) {
      kv.set(lastKey, now());
      return resp(200, { capped: true, pointsAwarded: 0, dayTotal: todayTotal });
    }

    kv.set(lastKey, now());
    kv.set(todayKey, todayTotal + add);
    return resp(200, { alreadyClaimed: false, pointsAwarded: add, dayTotal: todayTotal + add });
  } catch (e) {
    return resp(500, { error: String(e.message || e) });
  }
};
