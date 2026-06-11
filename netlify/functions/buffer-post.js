// Printarelle Content Engine — Buffer Publishing Function
// Requires BUFFER_TOKEN environment variable in Netlify.

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  const TOKEN = process.env.BUFFER_TOKEN;
  if (!TOKEN) return {
    statusCode: 500, headers,
    body: JSON.stringify({ error: "BUFFER_TOKEN not set in Netlify environment variables." }),
  };

  // Buffer API — try v1 with Bearer auth header (current method)
  const API = "https://api.bufferapp.com/1";
  const authHeaders = {
    "Authorization": "Bearer " + TOKEN,
    "Content-Type": "application/x-www-form-urlencoded",
  };

  try {
    const body = JSON.parse(event.body || "{}");
    const { action, profileIds, platforms, imageUrl } = body;

    // ── Get profiles ─────────────────────────────────────────────────────────
    if (action === "profiles") {
      const res = await fetch(`${API}/profiles.json`, {
        headers: { "Authorization": "Bearer " + TOKEN }
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch(e) {
        throw new Error("Buffer returned non-JSON: " + text.slice(0, 200));
      }
      if (!res.ok) throw new Error(
        "Buffer " + res.status + ": " + (data.message || data.error || JSON.stringify(data))
      );
      const profiles = Array.isArray(data) ? data : (data.data || []);
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          profiles: profiles.map((p) => ({
            id: p.id,
            service: p.service,
            username: p.formatted_username || p.service_username || p.service_id || p.id,
          })),
        }),
      };
    }

    // ── Publish ───────────────────────────────────────────────────────────────
    if (action === "publish") {
      const results = {};

      const post = async (profileId, text, extra = {}) => {
        const params = new URLSearchParams({ "profile_ids[]": profileId, text });
        if (imageUrl) params.append("media[photo]", imageUrl);
        Object.entries(extra).forEach(([k, v]) => params.append(k, v));
        const res = await fetch(`${API}/updates/create.json`, {
          method: "POST",
          headers: authHeaders,
          body: params,
        });
        const resText = await res.text();
        let data;
        try { data = JSON.parse(resText); } catch(e) { data = { message: resText }; }
        return res.ok ? { success: true } : { error: data.message || data.error || "Error " + res.status };
      };

      if (platforms?.instagram && profileIds?.instagram)
        results.instagram = await post(profileIds.instagram, platforms.instagram.caption);

      if (platforms?.facebook && profileIds?.facebook)
        results.facebook = await post(profileIds.facebook, platforms.facebook.caption);

      if (platforms?.pinterest?.pins && profileIds?.pinterest) {
        results.pinterest = [];
        for (const pin of platforms.pinterest.pins) {
          const r = await post(profileIds.pinterest, pin.description, {
            "extra_data[title]": pin.title || ""
          });
          results.pinterest.push(r);
        }
      }

      return { statusCode: 200, headers, body: JSON.stringify({ results }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown action: " + action }) };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
