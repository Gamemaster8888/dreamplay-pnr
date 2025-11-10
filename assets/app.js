async function getWallet() {
  if (!window.ethereum) throw new Error("MetaMask required");
  const [account] = await window.ethereum.request({ method: 'eth_requestAccounts' });
  return account; // full 42-char address
}

async function postJSON(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ? data.error : JSON.stringify(data));
  return data;
}

// "Recruit a New Member (+20 pts)" button
async function onLogRecruitClick() {
  const wallet = await getWallet();
  const out = await postJSON('/.netlify/functions/log-action', {
    wallet,
    action: 'recruit',
    points: 20
  });
  console.log('log-action result', out);
  alert('Logged +20 points for recruit ✅');
}

// "Claim Daily" button
async function onClaimDailyClick() {
  const wallet = await getWallet();
  const out = await postJSON('/.netlify/functions/claim-daily', { wallet });
  if (out.alreadyClaimed) {
    alert('Already claimed — try again after the 24h window.');
  } else if (out.capped) {
    alert('Daily cap reached (100 pts).');
  } else {
    alert(`Claimed ✅ +${out.pointsAwarded} pts`);
  }
  console.log('claim-daily result', out);
}
