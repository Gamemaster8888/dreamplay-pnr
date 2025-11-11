// netlify/functions/leaderboard.js
export async function handler() {
  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore({
      name: "claims",
      // fallback: env creds if needed
      ...(process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN ? {
        siteID: process.env.BLOBS_SITE_ID, token: process.env.BLOBS_TOKEN
      } : {})
    });

    // List all keys under claims/
    const entries = [];
    for await (const item of store.list({ prefix: "claims/" })) {
      const key = item.key; // e.g., claims/0xabc...json
      const raw = await store.get(key);
      if (!raw) continue;
      try {
        const json = JSON.parse(raw);
        const today = new Date().toISOString().slice(0,10);
        const total = Number(json?.dayTotals?.[today] || 0);
        const wallet = key.replace(/^claims\//,'').replace(/\.json$/,'');
        if (total > 0 && /^0x[a-fA-F0-9]{40}$/.test(wallet)) {
          entries.push([wallet, total]);
        }
      } catch {}
    }

    entries.sort((a,b)=> b[1]-a[1]);
    return {
      statusCode: 200,
      headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" },
      body: JSON.stringify({ ok:true, entries })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: String(e?.message || e) }) };
  }
}
