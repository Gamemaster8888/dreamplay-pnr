// assets/app.js

const CHAIN_ID_HEX = "0x89"; // Polygon (137)
const POLYGON_PARAMS = {
  chainId: CHAIN_ID_HEX,
  chainName: "Polygon Mainnet",
  nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
  rpcUrls: [window.POLYGON_PUBLIC_RPC || "https://rpc.ankr.com/polygon"],
  blockExplorerUrls: ["https://polygonscan.com"]
};

const $ = (sel) => document.querySelector(sel);
const short = (a) => (a ? a.slice(0,6) + "…" + a.slice(-4) : "");
function setStatus(t){ const el=$("#connStatus"); if(el) el.textContent=t; }
function setConnectBtn(t){ const el=$("#connectBtn"); if(el) el.textContent=t; }
function setResult(t){ const el=$("#lastResult"); if(el) el.textContent=t; }

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
  if(!accounts || !accounts[0]) throw new Error("No account returned");
  return accounts[0];
}

let CURRENT_WALLET = "";

async function onConnectClick(){
  try{
    const eth = await ensureEthereum();
    await ensurePolygon(eth);
    const acct = await requestAccounts(eth);
    CURRENT_WALLET = acct;
    setConnectBtn("Connected");
    setStatus(`Connected: ${short(acct)} • chain 137`);
  } catch(e){
    console.error("Connect failed:", e);
    alert("Connect failed: " + (e?.message || e));
  }
}

async function onLogRecruitClick(){
  try{
    const wallet = await requireWallet();
    disableActions(true);
    const out = await postJSON("/.netlify/functions/log-action", { wallet, action:"recruit", points:20 });
    console.log("log-action", out);
    if (out.awarded !== undefined) {
      if (out.awarded > 0) alert(`Logged ✅ +${out.awarded} pts (today total: ${out.dayTotal})`);
      else if (out.capped) alert(`Daily cap reached (100 pts).`);
      setResult(`Action awarded ${out.awarded ?? 20} • total ${out.dayTotal ?? "?"}`);
    } else {
      alert("Logged +20 points for recruit ✅");
      setResult(`Logged +20 pts • storage=${out.storage}`);
    }
  } catch(e){
    console.error(e); alert("Log failed: " + safeErr(e));
  } finally { disableActions(false); }
}

async function onClaimDailyClick(){
  try{
    const wallet = await requireWallet();
    disableActions(true);
    const out = await postJSON("/.netlify/functions/claim-daily", { wallet });
    console.log("claim-daily", out);
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
    console.error(e); alert("Claim failed: " + safeErr(e));
  } finally { disableActions(false); }
}

function disableActions(disabled){
  document.querySelectorAll("#actions button, #wallet button").forEach(b => b.disabled = !!disabled);
}
function safeErr(e){ try{ if(typeof e==="string") return e; if(e?.message) return e.message; return JSON.stringify(e);}catch{return "Unknown error";} }
async function requireWallet(){
  if (CURRENT_WALLET && /^0x[a-fA-F0-9]{40}$/.test(CURRENT_WALLET)) return CURRENT_WALLET;
  await onConnectClick(); // still inside a click gesture because callers are onclicks
  if (!CURRENT_WALLET) throw new Error("Wallet not connected");
  return CURRENT_WALLET;
}
async function postJSON(path, body){
  const res = await fetch(path, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(()=> ({}));
  if (!res.ok) throw new Error(data?.error || JSON.stringify(data));
  return data;
}

window.addEventListener("DOMContentLoaded", ()=>{
  if (!window.ethereum) { setStatus("MetaMask not detected"); return; }
  setStatus("MetaMask detected — click Connect");
});
window.onConnectClick = onConnectClick;
window.onLogRecruitClick = onLogRecruitClick;
window.onClaimDailyClick = onClaimDailyClick;
