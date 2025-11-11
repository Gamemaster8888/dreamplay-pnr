async function handleRecruit(){
  try{
    console.log("[app] recruit clicked");
    const wallet = await requireWallet();
    disableActions(true);

    const out = await postJSON("/.netlify/functions/log-action", {
      wallet, action:"recruit", points:20
    });
    console.log("[app] log-action result", out);

    const maxed = out.capped || (typeof out.dayTotal === "number" && out.dayTotal >= 100);
    if (out.awarded > 0) {
      alert(`Logged ✅ +${out.awarded} pts (today total: ${out.dayTotal})`);
      try { window.confetti && window.confetti({ spread: 60, particleCount: 80, origin: { y: 0.7 } }); } catch(_){}
      setResult(`Action awarded ${out.awarded} • total ${out.dayTotal}`);
    } else if (maxed) {
      alert("Max Daily Pts Reached (100).");
      setResult(`Max Daily Pts Reached • total ${out.dayTotal ?? 100}`);
    } else {
      alert("No points awarded.");
      setResult(`No points awarded • total ${out.dayTotal ?? "?"}`);
    }
  } catch(e){
    console.error("[app] recruit failed:", e);
    alert("Log failed: " + safeErr(e));
  } finally { disableActions(false); }
}

