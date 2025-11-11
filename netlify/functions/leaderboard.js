// netlify/functions/leaderboard.js
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "OPTIONS,GET"
  };
}
function reply(status, body) {
  return { statusCode: status, headers: { "Content-Type": "application/json", ...cors() }, body: JSON.stringify(body) };
}
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

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors() };
  if (event.httpMethod !== "GET") return reply(405, { ok:false, error:"Method not allowed" });

  try {
    const store = await getClaimsStore();
    const indexKey = "claims/_index.json";
    let wallets = [];
    try { const raw = await store.get(indexKey); if (raw) wallets = JSON.parse(raw) || []; } catch {}
    const today = todayStr();
    const scores = [];
    for (const w of wallets) {
      try {
        const raw = await store.get(`claims/${w}.json`);
        if (!raw) continue;
        const j = JSON.parse(raw);
        const total = Number(j?.dayTotals?.[today] || 0);
        if (total > 0) scores.push([w, total]);
      } catch {}
    }
    scores.sort((a,b)=>b[1]-a[1]);
    return reply(200, { ok:true, entries: scores.slice(0,100), date: today, source: "claims-index" });
  } catch (e) {
    return reply(200, { ok:false, error: String(e?.message || e) });
  }
};
