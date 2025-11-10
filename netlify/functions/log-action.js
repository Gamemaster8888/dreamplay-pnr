const { getStore } = require('@netlify/blobs');

exports.handler = async function(event){
  try {
    let body = {}; try{ body = event.body ? JSON.parse(event.body) : {}; }catch(_){}
    const addr = (body.address||"").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/i.test(addr)) {
      return { statusCode:400, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:"Invalid address" }) };
    }
    const action = (body.action||"").toUpperCase();
    const sponsor = (body.sponsor||"").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/i.test(sponsor)) {
      return { statusCode:400, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:"Sponsor required (0x… address)" }) };
    }

    const store = getStore({ name:'points', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_ACCESS_TOKEN });
    const sponsorsList = await store.get('config/sponsors.json', { type:'json' }) || [];
    const isAllowed = Array.isArray(sponsorsList) && sponsorsList.some(s => (s||"").toLowerCase() === sponsor);
    if (!isAllowed) {
      return { statusCode:403, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:"Sponsor not permitted. Update config/sponsors.json." }) };
    }

    const POINTS = {
      "RECRUIT_MEMBER": 20, "COACH_MEMBER": 15, "CREATE_CONTENT": 10, "SHARE_CONTENT": 5,
      "VERIFY_ID": 15, "QUALITY_CONTROL": 5, "FINLIT_LESSON": 15, "REPORTER": 15,
      "DREAMCASTER": 15, "VOTE": 10, "BELIEF_CHAIN": 20
    };
    const want = POINTS[action] || 1;

    const dayKey = new Date().toISOString().slice(0,10);
    const capsKey = `caps/${dayKey}.json`;
    const caps = await store.get(capsKey, { type:'json' }) || {};
    const CAP = 10;
    const awardedToday = Number(caps[addr]||0);
    const remaining = Math.max(0, CAP - awardedToday);
    if (remaining <= 0) {
      return { statusCode:200, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, capReached:true, message:"Daily cap reached (10 pts)" }) };
    }
    const add = Math.min(want, remaining);

    const totalsKey = 'totals.json';
    const totals = await store.get(totalsKey, { type:'json' }) || {};
    totals[addr] = (Number(totals[addr]||0) || 0) + add;
    caps[addr] = awardedToday + add;

    await store.set(totalsKey, JSON.stringify(totals), { contentType:'application/json' });
    await store.set(capsKey, JSON.stringify(caps), { contentType:'application/json' });

    return { statusCode:200, headers:{'content-type':'application/json'},
      body: JSON.stringify({ ok:true, added:add, total: totals[addr], action, sponsor, remaining: Math.max(0, CAP - caps[addr]), capped: add<want }) };
  } catch(e){
    return { statusCode:500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error: String(e && e.message || e) }) };
  }
};
