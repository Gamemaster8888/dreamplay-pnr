const { getStore } = require('@netlify/blobs');

exports.handler = async function(event){
  try {
    const store = getStore({ name:'points', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_ACCESS_TOKEN });
    const totals = await store.get('totals.json', { type:'json' }) || {};
    return { statusCode:200, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:true, totals }) };
  } catch(e){
    return { statusCode:500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error: String(e && e.message || e) }) };
  }
};
