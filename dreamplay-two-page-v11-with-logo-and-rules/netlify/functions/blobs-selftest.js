
exports.handler = async function(event, context) {
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ok: true,
      now: new Date().toISOString(),
      note: "blobs-selftest placeholder; replace with real Blob API if needed"
    })
  };
};
