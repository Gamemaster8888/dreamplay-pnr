// assets/app.js

// mark load (index.html checks this)
window.__APP_JS_LOADED__ = true;
console.log("[app] script loaded");

// ---------- config ----------
const CHAIN_ID_HEX = "0x89"; // Polygon (137)
const POLYGON_PARAMS = {
  chainId: CHAIN_ID_HEX,
  chainName: "Polygon Mainnet",
  nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
  rpcUrls: [window.POLYGON_PUBLIC_RPC || "https://rpc.ankr.com/polygon"],
  blockExplorerUrls: ["https://polygonscan.com"]
};

// ---------- dom helpers ----------
const $ = (sel) => document.querySelector(sel);
const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");
function setStatus(t){ const el=$("#connStatus"); if(el) el.textContent=t; }
function setConnectBtn(t){ const el=$("#connectBtn"); if(el) el.textContent=t; }
function setResult(t){ const el=$("#lastResult"); if(el) el.textContent=t; }

// ---------- wallet helpers ----------
async function ensureEthereum(){
  if(!window.ethereum){ alert("MetaMask is required."); throw new Error("MetaMask not found"); }
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

let CURRENT_WALLET = "";

// ---------- handlers ----------
async function handleConnect(){
  try{
    console.log("[app] connect clicked");
    const eth = await ensureEthereum();
    await ensurePolygon(eth);
    const acct = await requestAccounts(eth);
    CURRENT_WALLET = acct;
    setConnectBtn("Connected");
    setStatus(`Connected: ${short(acct)} • chain 137`);
    console.log("[app] connected wallet:", acct);
  } catch(e){
    console.error("[app] connect failed:", e);
    alert("Connect failed: " + (e?.message || e));
  }
}

async function handleRecruit(){
  try{
    console.log("[app] recruit clicked");
    const wallet = await requireWallet();
    disableActions(true);
    const out = await postJSON("/.netlify/functions/log-action", { wallet, action:"recruit", points:20 });
    console.log("[app] log-action result", out);
    if (out.awarded !== undefined) {
      if (out.awarded > 0) alert(`Logged ✅ +${out.awarded} pts (today total: ${out.dayTotal})`);
      else if (out.capped) alert(`Daily cap reached (100 pts).`);
      setResult(`Action awarded ${out.awarded ?? 20} • total ${out.dayTotal ?? "?"}`);
    } else {
      alert("Logged +20 points for recruit ✅");
      setResult(`Logged +20 pts • storage=${out.storage}`);
    }
  } catch(e){
    console.error("[app] recruit failed:", e);
    alert("Log failed: " + safeErr(e));
  } finally { disableActions(false); }
}

async function handleClaim(){
  try{
    console.log("[app] claim clicked");
    const wallet = await requireWallet();
    disableActions(true);
    const out = await postJSON("/.netlify/functions/claim-daily", { wallet });
    console.log("[app] claim-daily result", out);
    if (out.alreadyClaimed){
      const mins = Math.ceil((out.nextEligibleMs || 0) / 60000);
      setResult(`Already claimed — next in ~${mins} min • storage=${out.storage}`);
      alert(`Already claimed — try again in ~${mins} min.`);
    } else if (out.capped){
      setResult(`Daily cap reached • storage=${out.storage}`);
      alert(`Daily cap reached (100 pts).`);
    } else {
      setResult(`Claimed +${out.pointsAwarded} (total ${out.dayTotal}) • storage=${out.storage}`);
      alert(`Claimed ✅ +${out.pointsAwarded} pts (today total: ${out.dayTotal})`);
    }
  } catch(e){
    console.error("[app] claim failed:", e);
    alert("Claim failed: " + safeErr(e));
  } finally { disableActions(false); }
}

// ---------- internals ----------
function disableActions(disabled){
  document.querySelectorAll("#actions button, #wallet button").forEach(b => b.disabled = !!disabled);
}
function safeErr(e){
  try{ if(typeof e==="string") return e; if(e?.message) return e.message; return JSON.stringify(e); }
  catch { return "Unknown error"; }
}
async function requireWallet(){
  if (CURRENT_WALLET && /^0x[a-fA-F0-9]{40}$/.test(CURRENT_WALLET)) return CURRENT_WALLET;
  // Called from a click listener => still a user gesture, we can trigger connect
  await handleConnect();
  if (!CURRENT_WALLET) throw new Error("Wallet not connected");
  return CURRENT_WALLET;
}
async function postJSON(path, body){
  const res = await fetch(path, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(()=> ({}));
  if (!res.ok) throw new Error(data?.error || JSON.stringify(data));
  return data;
}

// ---------- bind listeners + diagnostics ----------
window.addEventListener("DOMContentLoaded", ()=>{
  // JS loaded badge
  const badge = $("#jsStatus");
  if (badge) badge.style.display = "inline-block";

  // bind buttons without inline onclick (avoids CSP issues)
  const c = $("#connectBtn");
  const r = $("#btnRecruit");
  const cl = $("#btnClaim");
  if (c) c.addEventListener("click", handleConnect);
  if (r) r.addEventListener("click", handleRecruit);
  if (cl) cl.addEventListener("click", handleClaim);

  if (!window.ethereum) {
    setStatus("MetaMask not detected");
  } else {
    setStatus("MetaMask detected — click Connect");
  }

  console.log("[app] DOM ready; listeners bound");
});
