// assets/app.js

// ---------- helpers ----------
const CHAIN_ID_HEX = "0x89"; // 137 Polygon
const POLYGON_PARAMS = {
  chainId: CHAIN_ID_HEX,
  chainName: "Polygon Mainnet",
  nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
  rpcUrls: [window.POLYGON_PUBLIC_RPC || "https://rpc.ankr.com/polygon"],
  blockExplorerUrls: ["https://polygonscan.com"]
};

const $ = (sel) => document.querySelector(sel);
const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");

function setStatus(text) { const el = $("#connStatus"); if (el) el.textContent = text; }
function setConnectBtn(text) { const b = $("#connectBtn"); if (b) b.textContent = text; }
function setResult(text) { const el = $("#lastResult"); if (el) el.textContent = text; }

// ---------- MetaMask / Wallet ----------
async function ensureEthereum() {
  if (!window.ethereum) {
    alert("MetaMask is required. Please install MetaMask.");
    throw new Error("MetaMask not found");
  }
  return window.ethereum;
}

async function ensurePolygon(provider) {
  const current = await provider.request({ method: "eth_chainId" });
  if (current !== CHAIN_ID_HEX) {
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] });
    } catch (e) {
      if (e && e.code === 4902) {
        await provider.request({ method: "wallet_addEthereumChain", params: [POLYGON_PARAMS] });
      } else {
        throw e;
      }
    }
  }
}

async function requestAccounts(provider) {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  if (!accounts || !accounts[0]) throw new Error("No account returned");
  return accounts[0];
}

let CURRENT_WALLET = "";

// ---------- Public API (called from HTML onclick) ----------
async function onConnectClick() {
  try {
    const eth = await ensureEthereum();        // throws if no MetaMask
    await ensurePolygon(eth);                  // may prompt user
    const account = await requestAccounts(eth);// must be called on click
    CURRENT_WALLET = account;
    setConnectBtn("Connected");
    setStatus(`Connected: ${short(account)} • chain 137`);
  } catch (e) {
    console.error("Connect failed:", e);
    alert("Connect failed: " + (e && e.message ? e.message : e));
  }
}

async function onLogRecruitClick() {
  try {
    const wallet = await requireWallet();  // ensures connected
    disableActions(true);
    const out = await postJSON("/.netlify/functions/log-action", {
      wallet,
      action: "recruit",
      points: 20
    });
    console.log("log-action result", out);
    setResult(`Logged +20 pts • storage=${out.storage}`);
    alert("Logged +20 points for recruit ✅");
  } catch (e) {
    console.error(e);
    alert("Log failed: " + safeErr(e));
  } finally {
    disableActions(false);
  }
}

async function onClaimDailyClick() {
  try {
    const wallet = await requireWallet();
    disableActions(true);
    const out = await postJSON("/.netlify/functions/claim-daily", { wallet });
    console.log("claim-daily result", out);
    if (out.alreadyClaimed) {
      const mins = Math.ceil((out.nextEligibleMs || 0) / 60000);
      alert(`Already claimed — try again in ~${mins} min.`);
      setResult(`Already claimed • next in ~${mins} min • storage=${out.storage}`);
    } else if (out.capped) {
      alert(`Daily cap reached (100 pts).`);
      setResult(`Daily cap reached • storage=${out.storage}`);
    } else {
      alert(`Claimed ✅ +${out.pointsAwarded} pts (today total: ${out.dayTotal})`);
      setResult(`Claimed +${out.pointsAwarded} (total ${out.dayTotal}) • storage=${out.storage}`);
    }
  } catch (e) {
    console.error(e);
    alert("Claim failed: " + safeErr(e));
  } finally {
    disableActions(false);
  }
}

// ---------- internals ----------
function disableActions(disabled) {
  const buttons = document.querySelectorAll("#actions button, #wallet button");
  buttons.forEach(b => (b.disabled = !!disabled));
}

function safeErr(e) {
  try {
    if (typeof e === "string") return e;
    if (e && e.message) return e.message;
    return JSON.stringify(e);
  } catch {
    return "Unknown error";
  }
}

async function requireWallet() {
  if (CURRENT_WALLET && /^0x[a-fA-F0-9]{40}$/.test(CURRENT_WALLET)) return CURRENT_WALLET;
  // Called from onclick => still a user gesture, we can trigger connect
  await onConnectClick();
  if (!CURRENT_WALLET) throw new Error("Wallet not connected");
  return CURRENT_WALLET;
}

async function postJSON(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data && data.error ? data.error : JSON.stringify(data));
  return data;
}

// ---------- passive init (no wallet prompts here) ----------
window.addEventListener("DOMContentLoaded", () => {
  if (!window.ethereum) {
    setStatus("MetaMask not detected");
    return;
  }
  setStatus("MetaMask detected — click Connect");
});

// expose functions for inline onclick
window.onConnectClick = onConnectClick;
window.onLogRecruitClick = onLogRecruitClick;
window.onClaimDailyClick = onClaimDailyClick;
