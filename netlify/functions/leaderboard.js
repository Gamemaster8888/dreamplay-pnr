const { getStore } = require('@netlify/blobs');

exports.handler = async function(event){
  try {
    const store = getStore({ name:'points', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_ACCESS_TOKEN });
    const totals = await store.get('totals.json', { type:'json' }) || {};
    const isAddr = a => /^0x[0-9a-f]{40}$/i.test(a);
    const entries = Object.entries(totals)
      .filter(([a,p]) => isAddr(a))
      .map(([a,p]) => [a, Number(p)||0])
      .sort((a,b)=> b[1]-a[1])
      .slice(0, 20);
    return { statusCode:200, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:true, entries }) };
  } catch(e){
    return { statusCode:500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error: String(e && e.message || e) }) };
  }
};
