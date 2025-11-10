
// --- DreamPlay daily claim: rolling 24h + 100/day cap ---
const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;
const POINTS_PER_TASK = 100;

async function getKV(){ 
  // Placeholder: swap for your storage client (D1/Redis/Blob). Must support get/set with TTL.
  return globalThis.__kv || (globalThis.__kv = new Map());
}
function now(){ return Date.now(); }

exports.handler = async (event) => {
  try {
    const { wallet } = JSON.parse(event.body || "{}");
    if (!wallet) return resp(400, { error: "Missing wallet" });
    const kv = await getKV();
    const lastKey = `claim:last:${wallet}`;
    const totalKey = `claim:total:${wallet}:${new Date().toISOString().slice(0,10)}`; // human date for cap display
    const last = kv.get(lastKey) || 0;
    const elapsed = now() - last;
    if (elapsed < ROLLING_WINDOW_MS) {
      return resp(200, { alreadyClaimed: true, nextEligibleMs: ROLLING_WINDOW_MS - elapsed, pointsAwarded: 0 });
    }
    const todayTotal = kv.get(totalKey) || 0;
    const add = Math.min(POINTS_PER_TASK, Math.max(0, 100 - todayTotal));
    if (add === 0) {
      // respect cap but still set last claim timestamp to avoid spam
      kv.set(lastKey, now());
      return resp(200, { capped: true, pointsAwarded: 0 });
    }
    kv.set(lastKey, now());
    kv.set(totalKey, todayTotal + add);
    return resp(200, { alreadyClaimed: false, pointsAwarded: add, dayTotal: todayTotal + add });
  } catch (e) {
    return resp(500, { error: String(e.message || e) });
  }
};
function resp(statusCode, body){ return { statusCode, headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) };}
// --- end rolling claim ---
