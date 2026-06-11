// Printarelle Content Engine — Buffer Publishing Proxy
// Token is sent from the browser (obtained via OAuth flow in buffer-auth.js)
// Requires: BUFFER_CLIENT_ID + BUFFER_CLIENT_SECRET in Netlify env vars (for auth only)

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST")    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  const API = "https://api.bufferapp.com/1";

  try {
    const body  = JSON.parse(event.body || "{}");
    const TOKEN = body.accessToken;
    if (!TOKEN) return { statusCode: 400, headers, body: JSON.stringify({ error: "No accessToken provided. Please reconnect Buffer in Settings." }) };

    const authHeader = { "Authorization": "Bearer " + TOKEN };

    // ── Get profiles ─────────────────────────────────────────────────────────
    if (body.action === "profiles") {
      const res  = await fetch(`${API}/profiles.json`, { headers: authHeader });
      const data = await res.json();
      if (!res.ok) throw new Error("Buffer " + res.status + ": " + (data.message || data.error || JSON.stringify(data)));
      const list = Array.isArray(data) ? data : (data.data || []);
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          profiles: list.map(p => ({
            id: p.id,
            service: p.service,
            username: p.formatted_username || p.service_username || p.service_id || p.id,
          })),
        }),
      };
    }

    // ── Publish ───────────────────────────────────────────────────────────────
    if (body.action === "publish") {
      const { profileIds, platforms, imageUrl } = body;
      const results = {};

      const post = async (profileId, text, extra = {}) => {
        const params = new URLSearchParams({ "profile_ids[]": profileId, text });
        if (imageUrl) params.append("media[photo]", imageUrl);
        Object.entries(extra).forEach(([k, v]) => params.append(k, v));
        const r = await fetch(`${API}/updates/create.json`, {
          method:  "POST",
          headers: { ...authHeader, "Content-Type": "application/x-www-form-urlencoded" },
          body:    params,
        });
        const d = await r.json();
        return r.ok ? { success: true } : { error: d.message || d.error || "Error " + r.status };
      };

      if (platforms?.instagram && profileIds?.instagram)
        results.instagram = await post(profileIds.instagram, platforms.instagram.caption);

      if (platforms?.facebook && profileIds?.facebook)
        results.facebook = await post(profileIds.facebook, platforms.facebook.caption);

      if (platforms?.pinterest?.pins && profileIds?.pinterest) {
        results.pinterest = [];
        for (const pin of platforms.pinterest.pins)
          results.pinterest.push(await post(profileIds.pinterest, pin.description, { "extra_data[title]": pin.title || "" }));
      }

      return { statusCode: 200, headers, body: JSON.stringify({ results }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown action: " + body.action }) };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
