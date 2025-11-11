// netlify/functions/leaderboard.js
export async function handler() {
  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore({
      name: "claims",
      ...(process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN
        ? { siteID: process.env.BLOBS_SITE_ID, token: process.env.BLOBS_TOKEN }
        : {})
    });

    const today = new Date().toISOString().slice(0, 10);
    const entries = [];

    // Some Netlify environments return a paged object { blobs, cursor }
    // Others (older/newer combos) expose an async iterator.
    // This supports both.

    async function handleBlobKey(key) {
      if (!key || !key.startsWith("claims/") || !key.endsWith(".json")) return;
      const raw = await store.get(key);
      if (!raw) return;
      try {
        const json = JSON.parse(raw);
        const total = Number(json?.dayTotals?.[today] || 0);
        const wallet = key.replace(/^claims\//, "").replace(/\.json$/, "");
        if (total > 0 && /^0x[a-fA-F0-9]{40}$/i.test(wallet)) {
          entries.push([wallet, total]);
        }
      } catch {
        /* ignore bad blobs */
      }
    }

    async function listPaged(prefix) {
      let cursor = undefined;
      do {
        const res = await store.list({ prefix, cursor });
        // Expected shape: { blobs: [{ key, size, ... }], cursor?: string }
        const page = res?.blobs || [];
        for (const b of page) {
          await handleBlobKey(b.key);
        }
        cursor = res?.cursor;
      } while (cursor);
    }

    // Try paged listing first
    let listed = false;
    try {
      if (typeof store.list === "function") {
        const test = await store.list({ prefix: "claims/" });
        if (test && Array.isArray(test.blobs)) {
          // We already consumed first page in `test`, but to
          // keep logic simple, run the full paged flow which
          // will fetch the first page again (cheap).
          await listPaged("claims/");
          listed = true;
        }
      }
    } catch {
      // fallthrough to iterator path
    }

    // Fallback: async-iterable listing (older SDKs)
    if (!listed) {
      if (store && typeof store.list === "function") {
        try {
          // Some environments implement store.list as async iterable directly.
          for await (const item of store.list({ prefix: "claims/" })) {
            // Expected shape: item.key
            await handleBlobKey(item?.key);
          }
          listed = true;
        } catch {
          // still not supported
        }
      }
    }

    if (!listed) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ ok: false, error: "Blobs listing not supported in this environment" })
      };
    }

    entries.sort((a, b) => b[1] - a[1]);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ ok: true, entries })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ ok: false, error: String(e?.message || e) })
    };
  }
}
