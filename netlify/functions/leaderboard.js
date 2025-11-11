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
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", ...cors() },
    body: JSON.stringify(body),
  };
}
const todayStr = (d = new Date()) => d.toISOString().slice(0, 10);

async function getStore() {
  const blobs = await import("@netlify/blobs").catch(() => null);
  if (!blobs || !blobs.getStore) throw new Error("Blobs SDK not available");
  // Use siteID/token if present (manual mode), else auto mode.
  return blobs.getStore({
    name: "claims",
    ...(process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN
      ? { siteID: process.env.BLOBS_SITE_ID, token: process.env.BLOBS_TOKEN }
      : {}),
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors() };
  if (event.httpMethod !== "GET") return reply(405, { ok: false, error: "Method not allowed" });

  const diagWanted = (event.queryStringParameters?.diag === "1");

  try {
    const store = await getStore();

    // Collect keys under "claims/"
    const keys = [];
    let listed = 0;

    // Prefer async iteration if available
    const iterable = store.list?.({ prefix: "claims/" });
    if (iterable && typeof iterable[Symbol.asyncIterator] === "function") {
      for await (const item of iterable) {
        listed++;
        const key = typeof item === "string" ? item : (item?.key || item?.name || "");
        if (key && key.startsWith("claims/")) keys.push(key);
      }
    } else {
      // Some environments return an array instead of async iterable
      const arr = await store.list?.({ prefix: "claims/" });
      if (Array.isArray(arr)) {
        for (const item of arr) {
          listed++;
          const key = typeof item === "string" ? item : (item?.key || item?.name || "");
          if (key && key.startsWith("claims/")) keys.push(key);
        }
      } else {
        // As a last resort, try listing without prefix and filter.
        const all = await store.list?.();
        if (Array.isArray(all)) {
          for (const item of all) {
            listed++;
            const key = typeof item === "string" ? item : (item?.key || item?.name || "");
            if (key && key.startsWith("claims/")) keys.push(key);
          }
        } else {
          // No listing capability exposed
          return reply(200, {
            ok: false,
            error: "Blobs store.list is unavailable in this environment.",
            diag: { hasList: !!store.list, type: typeof store.list },
          });
        }
      }
    }

    const today = todayStr();
    const scores = [];
    let readOk = 0, readFail = 0;

    for (const key of keys) {
      try {
        const raw = await store.get(key);
        if (!raw) continue;
        const j = JSON.parse(raw);
        const addr = key.split("/")[1]?.replace(".json", "") || "";
        const total = Number(j?.dayTotals?.[today] || 0);
        if (addr && total > 0) {
          scores.push([addr, total]);
        }
        readOk++;
      } catch {
        readFail++;
      }
    }

    scores.sort((a, b) => b[1] - a[1]);
    const entries = scores.slice(0, 100);

    return reply(200, {
      ok: true,
      entries,
      date: today,
      source: "claims",
      ...(diagWanted ? { diag: { listed, keys: keys.length, readOk, readFail } } : {}),
    });
  } catch (e) {
    // Return 200 with ok:false so the UI can show the message
    return reply(200, { ok: false, error: String(e?.message || e) });
  }
};
