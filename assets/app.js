// /assets/app.js  (ESM)
export const App = (() => {
  const CHAIN_ID_HEX = "0x89"; // Polygon (137)
  const POLYGON_PARAMS = {
    chainId: CHAIN_ID_HEX,
    chainName: "Polygon Mainnet",
    nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
    rpcUrls: [window.POLYGON_PUBLIC_RPC || "https://rpc.ankr.com/polygon"],
    blockExplorerUrls: ["https://polygonscan.com"]
  };

  const state = { address: null };

  const short = (a) => (a ? a.slice(0,6) + "…" + a.slice(-4) : "");

  async function ensureEthereum() {
    if (!window.ethereum) throw new Error("MetaMask not detected");
    return window.ethereum;
    }
  async function ensurePolygon(eth) {
    const current = await eth.request({ method: "eth_chainId" });
    if (current !== CHAIN_ID_HEX) {
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] });
      } catch (e) {
        if (e && e.code === 4902) {
          await eth.request({ method: "wallet_addEthereumChain", params: [POLYGON_PARAMS] });
        } else {
          throw e;
        }
      }
    }
  }
  async function requestAccounts(eth) {
    const accounts = await eth.request({ method: "eth_requestAccounts" });
    if (!accounts || !accounts[0]) throw new Error("No account returned");
    return accounts[0];
  }

  async function connectMetaMask(statusEl) {
    const eth = await ensureEthereum();
    await ensurePolygon(eth);
    const acct = await requestAccounts(eth);
    state.address = acct;
    localStorage.setItem("walletAddress", acct);
    if (statusEl) statusEl.textContent = `Connected: ${short(acct)} • chain 137`;
    return acct;
  }

  // Use your server function that enforces the 24h lock and 100/day cap on the "claim daily"
  async function postClaim(actionId, meta = {}) {
    const wallet = state.address || localStorage.getItem("walletAddress");
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet || "")) {
      throw new Error("Connect wallet first");
    }
    const res = await fetch("/.netlify/functions/claim-daily", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ wallet, actionId, meta })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || JSON.stringify(data));
    return data; // {alreadyClaimed, nextEligibleMs, capped, pointsAwarded, dayTotal, storage}
  }

  // General action logger → your server function with global 100/day cap (updated in our earlier step)
  async function logAction(actionId, points, sponsor = "") {
    const wallet = state.address || localStorage.getItem("walletAddress");
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet || "")) {
      throw new Error("Connect wallet first");
    }
    const body = { wallet, action: actionId, points: Number(points) || 0 };
    if (sponsor && /^0x[a-fA-F0-9]{40}$/.test(sponsor)) body.sponsor = sponsor;

    const res = await fetch("/.netlify/functions/log-action", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || JSON.stringify(data));
    // returns { ok:true, storage:"blobs", awarded, capped, dayTotal, ... }
    return data;
  }

  return { state, short, connectMetaMask, postClaim, logAction };
})();
