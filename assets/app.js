
// --- DreamPlay: MetaMask-only + Polygon switch helper ---
async function ensurePolygon() {
  if (!window.ethereum) {
    throw new Error("MetaMask is required");
  }
  const provider = window.ethereum;
  const polygon = {
    chainId: '0x89',
    chainName: 'Polygon Mainnet',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    rpcUrls: [window.POLYGON_PUBLIC_RPC || 'https://rpc.ankr.com/polygon'],
    blockExplorerUrls: ['https://polygonscan.com']
  };
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: polygon.chainId }] });
  } catch (e) {
    if (e && e.code === 4902) {
      await provider.request({ method: 'wallet_addEthereumChain', params: [polygon] });
    } else {
      throw e;
    }
  }
}
window.addEventListener('load', async () => {
  try { await ensurePolygon(); } catch (e) { console.warn(e); }
});
// --- end helper ---


// /assets/app.js — shared helpers (no Supabase/Magic)
export const App = (() => {
  const state = {
    address: localStorage.getItem('walletAddress') || null,
    chainId: localStorage.getItem('walletChainId') || null,
  };
  const short = (a) => a ? `${a.slice(0,6)}…${a.slice(-4)}` : "—";

  async function connectMetaMask(statusEl) {
    if (!window.ethereum) { alert('MetaMask not found'); return null; }
    try {
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (window.ethers && window.ethers.BrowserProvider) {
        const provider = new window.ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const addr = await signer.getAddress();
        const net  = await provider.getNetwork();
        state.address = addr;
        state.chainId = Number(net.chainId);
        localStorage.setItem('walletAddress', addr);
        localStorage.setItem('walletChainId', String(state.chainId));
        if (statusEl) statusEl.textContent = `Connected: ${short(addr)} • chain ${state.chainId}`;
        return { address: addr, chainId: state.chainId };
      } else {
        const [addr] = await window.ethereum.request({ method: 'eth_accounts' });
        state.address = addr || null;
        state.chainId = null;
        localStorage.setItem('walletAddress', state.address || "");
        if (statusEl) statusEl.textContent = `Connected via MetaMask: ${short(state.address)}`;
        return { address: state.address, chainId: null };
      }
    } catch (e) {
      console.error(e);
      if (statusEl) statusEl.textContent = `MetaMask connect failed`;
      alert(`MetaMask connect failed: ${e && e.message || e}`);
      return null;
    }
  }

  async function postClaim(reason = "daily-video", extra = {}) {
    const payload = {
      reason,
      address: state.address || localStorage.getItem('walletAddress') || null,
      chainId: state.chainId || Number(localStorage.getItem('walletChainId')) || null,
      ...extra
    };
    const res = await fetch('/.netlify/functions/claim-daily', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error((res.status===404? 'Function not found at /.netlify/functions/claim-daily' : '') || text || `claim-daily returned ${res.status}`);
    }
    try { return await res.json(); } catch(_) { return {}; }
  }

  return { state, short, connectMetaMask, postClaim };
})();
