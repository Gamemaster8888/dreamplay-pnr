// netlify/functions/post-board.js
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "OPTIONS,GET",
    // Prevent CDN/browser caching so you always see fresh data
    "Cache-Control": "no-store"
  };
}
function reply(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", ...cors() },
    body: JSON.stringify(body)
  };
}

const ZERO = "0x0000000000000000000000000000000000000000";
const isAddr = (x)=> /^0x[a-fA-F0-9]{40}$/i.test(x||"");
const LVL_PCT = [21,13,8,5,3,2,1,1];
const round2 = (n) => Math.round(n * 100) / 100;

const FACTORY_ADDR = "0x81A004F712432107869aEA67dC67bB2602C31033";
const FACTORY_ABI = [
  { "inputs":[{"internalType":"address","name":"","type":"address"}],
    "name":"sponsorOf","outputs":[{"internalType":"address","name":"","type":"address"}],
    "stateMutability":"view","type":"function" }
];

async function getProvider() {
  const { ethers } = require("ethers");
  const url = process.env.POLYGON_RPC_URL || process.env.POLYGON_PUBLIC_RPC;
  if (!url) throw new Error("Missing POLYGON_RPC_URL / POLYGON_PUBLIC_RPC");
  return new ethers.providers.JsonRpcProvider(url);
}
async function getFactory() {
  const { ethers } = require("ethers");
  const p = await getProvider();
  return new ethers.Contract(FACTORY_ADDR, FACTORY_ABI, p);
}

async function getActionsStore() {
  const blobs = await import("@netlify/blobs").catch(()=>null);
  if (!blobs || !blobs.getStore) throw new Error("Blobs SDK not available");
  return blobs.getStore({
    name: "actions",
    ...(process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN
      ? { siteID: process.env.BLOBS_SITE_ID, token: process.env.BLOBS_TOKEN }
      : {})
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS")
    return { statusCode: 204, headers: cors() };
  if (event.httpMethod !== "GET")
    return reply(405, { ok:false, error:"Method not allowed" });

  const wallet = (event.queryStringParameters?.wallet || "").trim();
  if (!isAddr(wallet)) return reply(200, { ok:false, error:"Missing or invalid wallet" });

  try {
    const actions = await getActionsStore();

    // read per-actor index
    const idxKey = `actions/by-actor/${wallet.toLowerCase()}.json`;
    let keys = [];
    try {
      const raw = await actions.get(idxKey);
      if (raw) keys = JSON.parse(raw) || [];
    } catch {}

    if (!Array.isArray(keys) || keys.length === 0) {
      return reply(200, { ok:true, base: wallet.toLowerCase(), totals: [], levels: [], actions: 0 });
    }

    const factory = await getFactory();
    const sponsorCache = new Map();
    async function sponsorOfCached(addr){
      const k = (addr || "").toLowerCase();
      if (sponsorCache.has(k)) return sponsorCache.get(k);
      const s = await factory.sponsorOf(addr);
      const sLc = (s || ZERO).toLowerCase();
      sponsorCache.set(k, sLc);
      return sLc;
    }

    const perWallet = new Map();
    const perLevelAgg = Array(8).fill(0);
    let readOk=0, readFail=0;

    for (const k of keys) {
      try {
        const raw = await actions.get(k);
        if (!raw) continue;
        const entry = JSON.parse(raw);

        const basePts = Number(entry?.awarded || 0);
        if (!basePts) { readOk++; continue; }

        let upline = (entry?.sponsor || "").toLowerCase();
        // if no sponsor on record, skip (do NOT send to ZERO)
        if (!isAddr(upline) || upline === ZERO) { readOk++; continue; }

        // distribute up to 8 levels; STOP at ZERO or non-address
        for (let lvl = 0; lvl < 8; lvl++) {
          if (!isAddr(upline) || upline === ZERO) break;
          const pct = LVL_PCT[lvl] || 0;
          const pts = round2((basePts * pct) / 100);
          if (pts > 0) {
            perLevelAgg[lvl] = round2(perLevelAgg[lvl] + pts);
            perWallet.set(upline, round2((perWallet.get(upline) || 0) + pts));
          }
          upline = await sponsorOfCached(upline);
        }
        readOk++;
      } catch { readFail++; }
    }

    // Build totals array (explicitly exclude ZERO just in case)
    const totals = Array.from(perWallet.entries())
      .filter(([addr]) => addr && addr.toLowerCase() !== ZERO)   // <—— hard filter
      .map(([addr, pts]) => [addr, pts])
      .sort((a,b) => b[1] - a[1]);

    const levels = perLevelAgg.map((pts,i)=>({ level:i+1, pct:LVL_PCT[i], points:pts }));

    return reply(200, {
      ok:true,
      base: wallet.toLowerCase(),
      totals,
      levels,
      actions: keys.length,
      diag: { readOk, readFail }
    });
  } catch (e) {
    return reply(200, { ok:false, error: String(e?.message || e) });
  }
};
