
// --- DreamPlay sponsor gate (factory isAnchor || hasLaunched) ---
const { ethers } = require('ethers');
const FACTORY = '0x81A004F712432107869aEA67dC67bB2602C31033';
const FACTORY_ABI = [
  "function isAnchor(address) view returns (bool)",
  "function hasLaunched(address) view returns (bool)"
];
const provider = new ethers.providers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
async function isValidSponsor(addr) {
  const c = new ethers.Contract(FACTORY, FACTORY_ABI, provider);
  const [a, l] = await Promise.all([c.isAnchor(addr), c.hasLaunched(addr)]);
  return a || l;
}
exports.handler = async (event) => {
  try {
    const { sponsor } = JSON.parse(event.body || "{}");
    if (!sponsor) return resp(400, { error: "Missing sponsor" });
    const ok = await isValidSponsor(sponsor);
    if (!ok) return resp(400, { error: "Invalid sponsor: must be an Anchor or Launcher" });
    return resp(200, { valid: true });
  } catch(e) {
    return resp(500, { error: String(e.message || e) });
  }
};
function resp(statusCode, body){ return { statusCode, headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) };}
// --- end sponsor gate ---
