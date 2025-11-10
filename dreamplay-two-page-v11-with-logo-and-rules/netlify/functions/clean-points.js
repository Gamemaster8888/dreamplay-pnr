const { getStore } = require('@netlify/blobs');

exports.handler = async function(event){
  try {
    const adminSecret = process.env.ADMIN_SECRET || "DreamPlayGoodNews8";
    const u = new URL(event.rawUrl || ("https://x"+event.path));
    const secret = u.searchParams.get("secret") || "";
    const moveTo = (u.searchParams.get("moveTo") || "").toLowerCase();
    if (secret !== adminSecret) {
      return { statusCode:401, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:"Unauthorized" }) };
    }
    const store = getStore({ name:'points', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_ACCESS_TOKEN });
    const totalsKey = 'totals.json';
    const totals = await store.get(totalsKey, { type:'json' }) || {};
    const isAddr = a => /^0x[0-9a-f]{40}$/i.test(a);
    let migrated=0, removed=0;
    if (moveTo && isAddr(moveTo) && Object.prototype.hasOwnProperty.call(totals, "")) {
      const val = Number(totals[""] || 0) || 0;
      if (val>0) { totals[moveTo] = (Number(totals[moveTo]||0)||0) + val; migrated = val; }
      delete totals[""];
    }
    for (const k of Object.keys(totals)) { if (!isAddr(k)) { delete totals[k]; removed++; } }
    await store.set(totalsKey, JSON.stringify(totals), { contentType:'application/json' });
    return { statusCode:200, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:true, removed, migrated, keys:Object.keys(totals).length }) };
  } catch(e){
    return { statusCode:500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error: String(e && e.message || e) }) };
  }
};
