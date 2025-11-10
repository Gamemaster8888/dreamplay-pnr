// --- DreamPlay sponsor gate (factory isAnchor || hasLaunched) ---
// Accepts POST JSON { sponsor } OR GET ?sponsor=0x...

const { ethers } = require("ethers"); // v5 CJS

const FACTORY = "0x81A004F712432107869aEA67dC67bB2602C31033";
const FACTORY_ABI = [
  "function isAnchor(address) view returns (bool)",
  "function hasLaunched(address) view returns (bool)"
];

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
  };
}
function resp(statusCode, body){
  return { statusCode, headers:{ "Content-Type":"application/json", ...corsHeaders() }, body: JSON.stringify(body) };
}

const provider = new ethers.providers.JsonRpcProvider(process.env.POLYGON_RPC_URL);

async function isValidSponsor(addr) {
  const c = new ethers.Contract(FACTORY, FACTORY_ABI, provider);
  const [a, l] = await Promise.all([c.isAnchor(addr), c.hasLaunched(addr)]);
  return a || l;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: corsHeaders() };

  let sponsor = "";
  try {
    if (event.httpMethod === "POST" && event.body) {
      const parsed = JSON.parse(event.body || "{}");
      sponsor = (parsed.sponsor || "").trim();
    }
    if (!sponsor) {
      const params = new URLSearchParams(event.queryStringParameters || {});
      sponsor = (params.get?.("sponsor") || "").trim();
    }
  } catch (_) {}

  if (!sponsor) return resp(400, { error: "Missing sponsor" });

  try {
    const ok = await isValidSponsor(sponsor);
    if (!ok) return resp(400, { error: "Invalid sponsor: must be an Anchor or Launcher" });
    return resp(200, { valid: true });
  } catch(e) {
    return resp(500, { error: String(e.message || e) });
  }
};
