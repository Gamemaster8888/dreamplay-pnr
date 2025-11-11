// netlify/functions/leaderboard.js
// Reads today's totals from the 'claims' store only.

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "OPTIONS,GET"
  };
}
function reply(status, body) {
  return { statusCode: status, headers: { "Content-Type":"application/json", ...cors() }, body: JSON.stringify(body) };
}
const todayStr = (d=new Date()) => d.toISOString().slice(0,10);

async function getStore() {
  const blobs = await import("@netlify/blobs").catch(()=>null);
  if (!blobs || !blobs.getStore) throw new Error("Blobs SDK not available");
  return blobs.getStore({
    name: "claims",
    ...(process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN
      ? { siteID: process.env.BLOBS_SITE_ID, token: process.env.BLOBS_TOKEN }
      : {})
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode:204, headers: cors() };
  if (event.httpMethod !== "GET") return reply(405, { ok:false, error:"Method not allowed" });

  try {
    const store = await getStore();
    const items = [];
    for await (const k of store.list({ prefix: "claims/" })) items.push(k);

    const today = todayStr();
    const scores = [];
    for (const key of items) {
      const raw = await store.get(key);
      if (!raw) continue;
      try {
        const j = JSON.parse(raw);
        const addr = key.split("/")[1]?.replace(".json","") || "";
        const total = Number(j?.dayTotals?.[today] || 0);
        if (addr && total > 0) scores.push([addr, total]);
      } catch {}
    }

    scores.sort((a,b) => b[1]-a[1]);
    const entries = scores.slice(0, 100);
    return reply(200, { ok:true, entries, date: today, source: "claims" });
  } catch (e) {
    return reply(500, { ok:false, error: String(e?.message || e) });
  }
};
