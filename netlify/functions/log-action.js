// netlify/functions/log-action.js
// Validates sponsor on-chain (no HTTP), then awards up to 100/day and logs the action.

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
    body: JSON.stringify(body),
  };
}

const isAddr = (x) => /^0x[a-fA-F0-9]{40}$/i.test(x || "");
const todayStr = (d = new Date()) => d.toISOString().slice(0, 10);

// ---- On-chain sponsor validation (ethers v5) ----
const FACTORY_ADDR = "0x81A004F712432107869aEA67dC67bB2602C31033";
const FACTORY_ABI = [
  { "inputs":[{"internalType":"address","name":"","type":"address"}], "name":"isAnchor", "outputs":[{"internalType":"bool","name":"","type":"bool"}], "stateMutability":"view", "type":"function" },
  { "inputs":[{"internalType":"address","name":"","type":"address"}], "name":"hasLaunched", "outputs":[{"internalType":"bool","name":"","type":"bool"}], "stateMutability":"view", "type":"function" }
];

async function getProvider() {
  const { ethers } = require("ethers");           // v5.7.2 in package.json
  const url = process.env.POLYGON_RPC_URL || process.env.POLYGON_PUBLIC_RPC;
  if (!url) throw new Error("Missing POLYGON_RPC_URL / POLYGON_PUBLIC_RPC");
  return new ethers.providers.JsonRpcProvider(url);
}
async function validateSponsorOnChain(addr) {
  const provider = await getProvider();
  const { ethers } = require("ethers");
  const c = new ethers.Contract(FACTORY_ADDR, FACTORY_ABI, provider);
  const [anchor, launched] = await Promise.all([
    c.isAnchor(addr),
    c.hasLaunched(addr),
  ]);
  if (!anchor && !launched) throw new Error("Sponsor is not Anchor or Launcher");
  return true;
}

// ---- Blobs helpers ----
async function getStore(name) {
  const blobs = await import("@netlify/blobs").catch(() => null);
  if (!blobs || !blobs.getStore) throw new Error("Blobs SDK not available");
  return blobs.getStore({
    name,
    ...(process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN
      ? { siteID: process.env.BLOBS_SITE_ID, token: process.env.BLOBS_TOKEN }
      : {}),
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

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: corsHeaders() };

  // GET: status (no mutation)
  if (event.httpMethod === "GET") {
    const q = event.queryStringParameters || {};
    const wallet = (q.wallet || "").trim();
    if (!isAddr(wallet)) return resp(400, { error: "Missing or invalid wallet" });
    try {
      const claims = await getStore("claims");
      const { json } = await readClaimState(claims, wallet);
      const today = todayStr();
      const dayTotal = Number(json?.dayTotals?.[today] || 0);
      return resp(200, { ok: true, mode: "status", dayTotal, capped: dayTotal >= 100 });
    } catch (e) {
      return resp(500, { error: String(e?.message || e) });
    }
  }

  if (event.httpMethod !== "POST") return resp(405, { error: "Method not allowed" });

  let wallet="", action="", points=0, note="", sponsor="";
  try {
    const b = JSON.parse(event.body || "{}");
    wallet  = (b.wallet  || "").trim();
    action  = (b.action  || "").trim();
    points  = Number(b.points || 0);
    note    = (b.note    || "").trim();
    sponsor = (b.sponsor || "").trim();
  } catch(_) {}
  if (!isAddr(wallet))  return resp(400, { error: "Missing or invalid wallet" });
  if (!action)          return resp(400, { error: "Missing action" });
  if (!Number.isFinite(points) || points <= 0) return resp(400, { error: "Invalid points" });
  if (!isAddr(sponsor)) return resp(400, { error: "Sponsor required and must be a valid address" });

  try {
    // 1) Server-side sponsor enforcement (no relative fetch)
    await validateSponsorOnChain(sponsor);

    // 2) Award up to the daily cap
    const claims = await getStore("claims");
    const { key, json } = await readClaimState(claims, wallet);
    const today = todayStr();
    const todayTotal = Number(json?.dayTotals?.[today] || 0);
    const add = Math.min(points, Math.max(0, 100 - todayTotal));

    if (add > 0) {
      json.dayTotals[today] = todayTotal + add;
      await writeClaimState(claims, key, json);
    }

    // 3) Log the action
    const actions = await getStore("actions");
    const logKey = `log/${Date.now()}-${wallet.toLowerCase()}`;
    const entry  = { ts: new Date().toISOString(), wallet: wallet.toLowerCase(), action, points, note, sponsor };
    await actions.set(logKey, JSON.stringify(entry));

    return resp(200, {
      ok: true,
      awarded: add,
      dayTotal: Number(json.dayTotals[today] || 0),
      capped: (json.dayTotals[today] || 0) >= 100,
      entryKey: logKey,
    });
  } catch (e) {
    return resp(400, { error: String(e?.message || e) });
  }
};
