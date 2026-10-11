// Roughly where a visitor is, from Cloudflare's IP location, rounded to about 10 km: enough for the sky to know when the sun rises and sets.
export function handleHere(request) {
  const cf = request.cf || {};
  const lat = Math.round(Number(cf.latitude) * 10) / 10, lon = Math.round(Number(cf.longitude) * 10) / 10;
  const known = cf.latitude != null && cf.longitude != null && Number.isFinite(lat) && Number.isFinite(lon);
  const body = known ? { lat, lon, place: String(cf.city || "") } : { error: "no location" };
  return new Response(JSON.stringify(body), { status: known ? 200 : 404, headers: { "content-type": "application/json", "cache-control": "private, max-age=3600" } });
}
