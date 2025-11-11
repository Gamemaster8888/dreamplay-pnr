// /assets/app.js  (non-module; binds handlers itself)
(function(){
  window.__APP_READY__ = false;

  const CHAIN_ID_HEX = "0x89";
  const POLYGON_PARAMS = {
    chainId: CHAIN_ID_HEX,
    chainName: "Polygon Mainnet",
    nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
    rpcUrls: [window.POLYGON_PUBLIC_RPC || "https://rpc.ankr.com/polygon"],
    blockExplorerUrls: ["https://polygonscan.com"]
  };

  const $ = (s) => document.querySelector(s);
  const short = (a) => (a ? a.slice(0,6) + "…" + a.slice(-4) : "");
  function setStatus(t){ const el=$("#connStatus"); if(el) el.textContent=t; }
  function setPointsToday(t){ const el=$("#pointsToday"); if(el) el.textContent=t; }

  async function ensureEthereum(){
    if (!window.ethereum) { alert("MetaMask is required."); throw new Error("MetaMask not found"); }
    return window.ethereum;
  }
  async function ensurePolygon(eth){
    const current = await eth.request({ method:"eth_chainId" });
    if (current !== CHAIN_ID_HEX){
      try {
        await eth.request({ method:"wallet_switchEthereumChain", params:[{ chainId: CHAIN_ID_HEX }] });
      } catch(e){
        if (e && e.code === 4902){
          await eth.request({ method:"wallet_addEthereumChain", params:[POLYGON_PARAMS] });
        } else { throw e; }
      }
    }
  }
  async function requestAccounts(eth){
    const accounts = await eth.request({ method:"eth_requestAccounts" });
    if (!accounts || !accounts[0]) throw new Error("No account returned");
    return accounts[0];
  }

  const state = { wallet: localStorage.getItem("walletAddress") || "" };

  async function postJSON(path, body){
    const res = await fetch(path, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(()=> ({}));
    if (!res.ok) throw new Error(data?.error || JSON.stringify(data));
    return data;
  }
  async function getJSON(path){
    const res = await fetch(path, { headers: { accept: "application/json" } });
    const data = await res.json().catch(()=> ({}));
    if (!res.ok) throw new Error(data?.error || JSON.stringify(data));
    return data;
  }

  async function getTodayTotal(){
    if (!/^0x[a-fA-F0-9]{40}$/.test(state.wallet || "")) return null;
    try {
      const data = await getJSON(`/.netlify/functions/claim-daily?wallet=${state.wallet}&mode=status`);
      if (typeof data?.dayTotal === "number") return data.dayTotal;
      return null;
    } catch { return null; }
  }

  async function onConnect(){
    const eth = await ensureEthereum();
    await ensurePolygon(eth);
    const acct = await requestAccounts(eth);
    state.wallet = acct;
    localStorage.setItem("walletAddress", acct);
    setStatus(`Connected: ${short(acct)} • chain 137`);
    const total = await getTodayTotal();
    if (typeof total === "number") setPointsToday(`Points today: ${total} / 100`);
  }

  async function onLogAction(){
    if (!/^0x[a-fA-F0-9]{40}$/.test(state.wallet || "")) { alert("Connect wallet first"); return; }
    const map = {RECRUIT_MEMBER:20,COACH_MEMBER:15,CREATE_CONTENT:10,SHARE_CONTENT:5,VERIFY_ID:15,QUALITY_CONTROL:5,FINLIT_LESSON:15,REPORTER:15,DREAMCASTER:15,VOTE:10,BELIEF_CHAIN:20};
    const id = $("#actionSelect")?.value || "RECRUIT_MEMBER";
    const sponsor = ($("#sponsorInput")?.value || "").trim();
    const points = map[id] || 0;

    const btn = $("#logBtn"); const status = $("#actorStatus");
    if (btn) btn.disabled = true;
    status && (status.textContent = "Logging…");
    try {
      const body = { wallet: state.wallet, action: id, points };
      if (/^0x[a-fA-F0-9]{40}$/.test(sponsor)) body.sponsor = sponsor;
      const out = await postJSON("/.netlify/functions/log-action", body);

      const maxed = out.capped || (typeof out.dayTotal === "number" && out.dayTotal >= 100);
      if (out.awarded > 0) {
        status.textContent = `Logged ${id} (+${out.awarded}) • Total ${out.dayTotal}`;
        try { window.confetti && window.confetti({ spread: 60, particleCount: 80, origin: { y: 0.7 } }); } catch(_){}
      } else if (maxed) {
        status.textContent = "Max Daily Pts Reached (100).";
      } else {
        status.textContent = "No points awarded.";
      }
      const total = await getTodayTotal();
      if (typeof total === "number") setPointsToday(`Points today: ${total} / 100`);
      $("#refreshLbBtn")?.click();
    } catch(e){
      status && (status.textContent = "Log failed");
      alert(e?.message || e);
    } finally { if (btn) btn.disabled = false; }
  }

  // --- YouTube gating (unchanged logic) ---
  let player, duration=0, watched=0, playing=false, apiReady=false, fallbackStarted=false;
  window.onYouTubeIframeAPIReady = function(){
    apiReady = true;
    const dbg = $("#claimDebug"); if (dbg) dbg.textContent = "YouTube API ready";
    try {
      player = new YT.Player('video', {
        events: {
          onReady: (e)=>{ try { duration = e.target.getDuration() || 0; } catch(_){ duration = 0; } updateGate(); },
          onStateChange: (e)=>{
            if (e.data === YT.PlayerState.PLAYING) { playing = true; }
            else { if (playing){ playing = false; updateGate(); } }
          }
        }
      });
    } catch (e) { if (dbg) dbg.textContent = "YT init error: " + (e?.message || e); }
  };
  setInterval(()=>{ if (playing) { watched += 0.5; updateGate(); } }, 500);
  setTimeout(()=>{
    if (!apiReady && !fallbackStarted) {
      fallbackStarted = true;
      const dbg = $("#claimDebug"); if (dbg) dbg.textContent = "⚠️ YT API not ready — fallback timer started";
      setInterval(()=>{ watched += 1; updateGate(); }, 1000);
    }
  }, 1500);

  function eligibleNow(){
    if (apiReady && player) {
      let pct = 0; try { pct = duration ? (player.getCurrentTime()/Math.max(duration,1)) : 0; } catch(_){}
      return (watched >= 60) && (pct >= 0.5);
    }
    return watched >= 60;
  }
  function updateGate(){
    const btn = $("#claimBtn"); const status = $("#claimStatus");
    if (!btn || !status) return;
    const ok = eligibleNow();
    btn.disabled = !ok;
    let pct = 0; try { pct = duration ? (player.getCurrentTime()/Math.max(duration,1)) : 0; } catch(_){}
    status.textContent = ok
      ? "Eligible to claim ✅"
      : `Watch at least 60s and 50% — watched ${Math.floor(watched)}s (${Math.floor(pct*100)}%)`;
  }

  async function onClaim(){
    if (!/^0x[a-fA-F0-9]{40}$/.test(state.wallet || "")) { alert("Connect wallet first"); return; }
    if (!eligibleNow()) return;
    const btn = $("#claimBtn"); const status = $("#claimStatus");
    btn && (btn.disabled = true);
    status && (status.textContent = "Claiming…");
    try {
      const out = await postJSON("/.netlify/functions/claim-daily", { wallet: state.wallet, actionId: "daily-video", meta: { watchedSeconds: Math.floor(watched) } });
      if (out.alreadyClaimed) {
        const mins = Math.ceil((out.nextEligibleMs || 0) / 60000);
        status.textContent = `Already claimed — try again in ~${mins} min.`;
      } else if (out.capped || (typeof out.dayTotal === "number" && out.dayTotal >= 100)) {
        status.textContent = `Max Daily Pts Reached (100).`;
      } else if (out.pointsAwarded > 0) {
        status.textContent = `Claimed! +${out.pointsAwarded} (today ${out.dayTotal})`;
        try { window.confetti && window.confetti({ spread: 70, particleCount: 120, origin: { y: 0.6 } }); } catch(_){}
        const total = await getTodayTotal();
        if (typeof total === "number") setPointsToday(`Points today: ${total} / 100`);
        $("#refreshLbBtn")?.click();
      } else {
        status.textContent = `No points awarded.`;
      }
    } catch(e){
      status && (status.textContent = "Claim failed");
      alert(e?.message || e);
    } finally { updateGate(); }
  }

  async function onCheckFunctions(){
    const el = $("#verifyStatus");
    el && (el.textContent = "Calling blobs-selftest…");
    try {
      const r = await fetch("/.netlify/functions/blobs-selftest", { headers: { accept: "application/json" } });
      el.textContent = "blobs-selftest: " + (await r.text()).slice(0,140);
    } catch(e){ el.textContent = "blobs-selftest failed: " + (e?.message || e); }
  }
  async function onGetNonce(){
    const el = $("#verifyStatus");
    el && (el.textContent = "Requesting nonce…");
    try {
      const r = await fetch("/.netlify/functions/nonce", { headers: { accept: "application/json" } });
      el.textContent = "nonce: " + (await r.text()).slice(0,140);
    } catch(e){ el.textContent = "nonce failed: " + (e?.message || e); }
  }

  async function refreshLeaderboard(){
    const body = $("#lbTableBody"); const lbStatus=$("#lbStatus"); const lbUpdated=$("#lbUpdated");
    if (lbStatus) lbStatus.textContent = "Loading…";
    try {
      const data = await getJSON("/.netlify/functions/leaderboard");
      if (data.ok && Array.isArray(data.entries)) {
        if (body) body.innerHTML = data.entries.map((row, i)=>{
          const addr=row[0]; const pts=row[1];
          return `<tr><td>${i+1}</td><td>${addr.slice(0,6)}…${addr.slice(-4)}</td><td>${pts}</td></tr>`;
        }).join("") || `<tr><td>—</td><td>—</td><td>—</td></tr>`;
        if (lbUpdated) lbUpdated.textContent = "Updated " + new Date().toLocaleTimeString();
        if (lbStatus) lbStatus.textContent = "";
      } else {
        if (lbStatus) lbStatus.textContent = data.error || "No data";
      }
    } catch(e){ if (lbStatus) lbStatus.textContent = "Leaderboard error"; }
  }

  // ---- bind on load ----
  window.addEventListener("DOMContentLoaded", async ()=>{
    $("#connectBtn")?.addEventListener("click", onConnect);
    $("#logBtn")?.addEventListener("click", onLogAction);
    $("#claimBtn")?.addEventListener("click", onClaim);
    $("#checkFunctions")?.addEventListener("click", onCheckFunctions);
    $("#getNonce")?.addEventListener("click", onGetNonce);
    $("#refreshLbBtn")?.addEventListener("click", refreshLeaderboard);
    refreshLeaderboard();

    // Don’t trust cached localStorage — verify with eth_accounts
    try {
      if (window.ethereum) {
        const accts = await window.ethereum.request({ method: "eth_accounts" });
        const acct = Array.isArray(accts) && accts[0] ? accts[0] : "";
        if (acct) {
          state.wallet = acct;
          localStorage.setItem("walletAddress", acct);
          setStatus(`Connected: ${short(acct)} • chain 137`);
          const total = await getTodayTotal();
          if (typeof total === "number") setPointsToday(`Points today: ${total} / 100`);
        } else {
          // not authorized → clear stale cache
          state.wallet = "";
          localStorage.removeItem("walletAddress");
          setStatus("Not connected");
        }
      }
    } catch {
      // ignore; user will click Connect
    }

    window.__APP_READY__ = true;
    const badge = $("#jsStatus"); if (badge) badge.style.display = "inline-block";
  });
})();
