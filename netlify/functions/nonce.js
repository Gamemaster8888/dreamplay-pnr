
function randomNonce(len = 24) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i=0; i<len; i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}

exports.handler = async function(event, context) {
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ok: true,
      nonce: randomNonce(),
      ts: Date.now()
    })
  };
};
