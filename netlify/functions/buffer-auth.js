// Printarelle Content Engine — Buffer OAuth Handler
// Handles both the auth redirect (start) and the callback (code exchange)
// Requires: BUFFER_CLIENT_ID and BUFFER_CLIENT_SECRET in Netlify env vars

const REDIRECT_URI = "https://printarelle.netlify.app/.netlify/functions/buffer-auth";
const APP_ORIGIN  = "https://printarelle.netlify.app";

exports.handler = async (event) => {
  const p = event.queryStringParameters || {};
  const CLIENT_ID     = process.env.BUFFER_CLIENT_ID;
  const CLIENT_SECRET = process.env.BUFFER_CLIENT_SECRET;

  // ── Step 1: Kick off auth — redirect to Buffer's login ───────────────────
  if (p.start) {
    if (!CLIENT_ID) return html("❌ BUFFER_CLIENT_ID not set in Netlify environment variables.");
    const url = "https://bufferapp.com/oauth2/authorize"
      + "?client_id=" + encodeURIComponent(CLIENT_ID)
      + "&redirect_uri=" + encodeURIComponent(REDIRECT_URI)
      + "&response_type=code";
    return { statusCode: 302, headers: { Location: url }, body: "" };
  }

  // ── Step 2: Buffer redirects back with a code ─────────────────────────────
  if (p.error) return closePopup(null, "Buffer declined: " + p.error);

  if (p.code) {
    try {
      const res = await fetch("https://api.bufferapp.com/1/oauth2/token.json", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id:     CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri:  REDIRECT_URI,
          code:          p.code,
          grant_type:    "authorization_code",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.access_token)
        throw new Error(data.message || data.error || JSON.stringify(data));
      return closePopup(data.access_token, null);
    } catch (e) {
      return closePopup(null, e.message);
    }
  }

  return { statusCode: 400, headers: { "Content-Type": "text/plain" }, body: "Invalid request" };
};

function closePopup(token, error) {
  const msg = token
    ? `{ type: "buffer_auth", token: ${JSON.stringify(token)} }`
    : `{ type: "buffer_auth", error: ${JSON.stringify(error)} }`;
  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html" },
    body: `<!DOCTYPE html><html>
<body style="font-family:sans-serif;text-align:center;padding:48px;background:#FAF6EE">
  ${token
    ? '<p style="font-size:20px">✓ Buffer connected!</p><p style="color:#888">Closing window...</p>'
    : `<p style="color:#c0392b">❌ ${error||"Unknown error"}</p><p>Close this window and try again.</p>`
  }
  <script>
    try {
      if(window.opener && !window.opener.closed){
        window.opener.postMessage(${msg}, ${JSON.stringify("https://printarelle.netlify.app")});
        setTimeout(function(){ window.close(); }, 900);
      } else {
        ${token
          ? `window.location.href="${"https://printarelle.netlify.app"}/#buffer_token=" + encodeURIComponent(${JSON.stringify(token)});`
          : `document.body.innerHTML += "<p>Could not return to app. Close this tab manually.</p>";`
        }
      }
    } catch(e){ document.body.innerHTML += "<p>" + e.message + "</p>"; }
  </script>
</body></html>`,
  };
}

function html(msg) {
  return { statusCode: 200, headers: { "Content-Type": "text/html" }, body: `<p>${msg}</p>` };
}
