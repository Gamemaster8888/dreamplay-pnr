// --- DreamPlay daily claim: rolling 24h + 100/day cap ---
// GET  => status ONLY (NO mutations)
// POST => attempt to claim (mutates state if eligible)

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
  };
}
function resp(status, body) {
  return { statusCode: status, headers: { "Content-Type": "application/json", ...corsHeaders() }, body: JSON.stringify(body) };
}

const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;
const POINTS_PER_TASK = 100;

function todayStr(d=new Date()) { return d.toISOString().slice(0,10); }
function nowMs(){ return Date.now(); }
function isHexAddress(x){ return /^0x[a-fA-F0-9]{40}$/.test(x || ""); }

async function readStore(wallet) {
  try {
    const blobs = await import('@netlify/blobs').catch(() => null);
    if (blobs && blobs.getStore) {
      const store = blobs.getStore({
        name: 'claims',
        ...(process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN
          ? { siteID: process.env.BLOBS_SITE_ID, token: process.env.BLOBS_TOKEN }
          : {})
      });
      const key = `claims/${wallet.toLowerCase()}.json`;
      const raw = await store.get(key);
      const json = raw ? JSON.parse(raw) : { lastClaimAt: 0, dayTotals: {} };
      return { type: 'blobs', store, key, json };
    }
  } catch(_) {}
  // memory fallback
  if (!globalThis.__CLAIMS) globalThis.__CLAIMS = {};
  globalThis.__CLAIMS[wallet.toLowerCase()] ||= { lastClaimAt: 0, dayTotals: {} };
  return { type: 'memory', json: globalThis.__CLAIMS[wallet.toLowerCase()] };
}

async function writeStore(ctx) {
  if (ctx.type === 'blobs') {
    await ctx.store.set(ctx.key, JSON.stringify(ctx.json));
    return 'blobs';
  } else {
    return 'memory';
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders() };

  // read wallet
  let wallet = '';
  try {
    if (event.httpMethod === 'POST' && event.body) {
      const b = JSON.parse(event.body || '{}');
      wallet = (b.wallet || '').trim();
    }
    if (!wallet) {
      const q = event.queryStringParameters || {};
      wallet = (q.wallet || '').trim();
    }
  } catch(_) {}
  if (!isHexAddress(wallet)) return resp(400, { error: "Missing or invalid wallet" });

  // read current state
  let ctx;
  try {
    ctx = await readStore(wallet);
  } catch (e) {
    return resp(500, { error: "Store read failed", diag: String(e?.message || e) });
  }
  const state = ctx.json; // { lastClaimAt, dayTotals: { 'YYYY-MM-DD': number } }
  const elapsed = nowMs() - (state.lastClaimAt || 0);
  const alreadyClaimed = elapsed < ROLLING_WINDOW_MS;
  const today = todayStr();
  const todayTotal = Number(state.dayTotals[today] || 0);

  // GET: status only, no writes/mutations
  if (event.httpMethod === 'GET') {
    const q = event.queryStringParameters || {};
    const mode = (q.mode || '').toLowerCase(); // support explicit ?mode=status
    if (mode !== 'status') {
      // even if no mode supplied, NEVER mutate on GET
    }
    return resp(200, {
      ok: true,
      mode: 'status',
      alreadyClaimed,
      nextEligibleMs: alreadyClaimed ? (ROLLING_WINDOW_MS - elapsed) : 0,
      dayTotal: todayTotal,
      capped: todayTotal >= 100,
      storage: ctx.type,
      diag: 'status-only'
    });
  }

  // POST: attempt to claim (mutate if eligible and not capped)
  if (event.httpMethod === 'POST') {
    try {
      if (alreadyClaimed) {
        return resp(200, {
          alreadyClaimed: true,
          nextEligibleMs: ROLLING_WINDOW_MS - elapsed,
          pointsAwarded: 0,
          dayTotal: todayTotal,
          storage: ctx.type
        });
      }

      const add = Math.min(POINTS_PER_TASK, Math.max(0, 100 - todayTotal));
      if (add === 0) {
        state.lastClaimAt = nowMs(); // throttle spam
        await writeStore(ctx);
        return resp(200, { capped: true, pointsAwarded: 0, dayTotal: todayTotal, storage: ctx.type });
      }

      state.lastClaimAt = nowMs();
      state.dayTotals[today] = todayTotal + add;
      const where = await writeStore(ctx);

      return resp(200, { alreadyClaimed: false, pointsAwarded: add, dayTotal: state.dayTotals[today], storage: where });
    } catch (e) {
      return resp(500, { error: String(e.message || e) });
    }
  }

  return resp(405, { error: "Method not allowed" });
};
