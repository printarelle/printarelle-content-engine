// Printarelle Content Engine — Buffer Publishing Function
// Netlify serverless function. Requires BUFFER_TOKEN environment variable in Netlify.

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
    body: JSON.stringify({ error: "BUFFER_TOKEN not set. Go to Netlify → Site settings → Environment variables and add BUFFER_TOKEN." }),
  };

  const API = "https://api.bufferapp.com/1";

  try {
    const body = JSON.parse(event.body || "{}");
    const { action, profileIds, platforms, imageUrl } = body;

    // ── Get Buffer profiles ──────────────────────────────────────────────────
    if (action === "profiles") {
      const res = await fetch(`${API}/profiles.json?access_token=${TOKEN}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Buffer returned " + res.status);
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          profiles: data.map((p) => ({
            id: p.id,
            service: p.service,
            username: p.formatted_username || p.service_username || p.service_id,
          })),
        }),
      };
    }

    // ── Publish pack ─────────────────────────────────────────────────────────
    if (action === "publish") {
      const results = {};

      const post = async (profileId, text, extra = {}) => {
        const params = new URLSearchParams({ access_token: TOKEN, "profile_ids[]": profileId, text });
        if (imageUrl) params.append("media[photo]", imageUrl);
        Object.entries(extra).forEach(([k, v]) => params.append(k, v));
        const res = await fetch(`${API}/updates/create.json`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params,
        });
        const data = await res.json();
        return res.ok ? { success: true } : { error: data.message || "Buffer error" };
      };

      // Instagram
      if (platforms?.instagram && profileIds?.instagram) {
        results.instagram = await post(profileIds.instagram, platforms.instagram.caption);
      }

      // Facebook
      if (platforms?.facebook && profileIds?.facebook) {
        results.facebook = await post(profileIds.facebook, platforms.facebook.caption);
      }

      // Pinterest — 3 pins
      if (platforms?.pinterest?.pins && profileIds?.pinterest) {
        results.pinterest = [];
        for (const pin of platforms.pinterest.pins) {
          const r = await post(
            profileIds.pinterest,
            pin.description,
            { "extra_data[title]": pin.title || "" }
          );
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
