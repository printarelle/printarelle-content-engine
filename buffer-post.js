// Printarelle Content Engine — Buffer GraphQL API
// Uses Buffer's new GraphQL API at https://api.buffer.com
// Requires: BUFFER_TOKEN in Netlify environment variables (Personal Key from Buffer Settings → API)

const API = "https://api.buffer.com";

const gql = async (token, query, variables = {}) => {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors.map(e => e.message).join(", "));
  return data.data;
};

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
    body: JSON.stringify({ error: "BUFFER_TOKEN not set. Add your Buffer Personal Key to Netlify → Site settings → Environment variables." }),
  };

  try {
    const body = JSON.parse(event.body || "{}");

    // ── Get channels ────────────────────────────────────────────────────────
    if (body.action === "profiles") {
      const data = await gql(TOKEN, `{
        channels {
          id
          name
          service
          serviceType
        }
      }`);
      const channels = data.channels || [];
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          profiles: channels.map(c => ({
            id: c.id,
            service: c.service || c.serviceType,
            username: c.name || c.id,
          })),
        }),
      };
    }

    // ── Create posts ─────────────────────────────────────────────────────────
    if (body.action === "publish") {
      const { profileIds, platforms } = body;
      const results = {};

      const createPost = async (channelId, text) => {
        const CREATE = `
          mutation CreatePost($channelId: String!, $text: String!) {
            createPost(input: {
              channelId: $channelId,
              text: $text,
              schedulingType: automatic,
              mode: addToQueue
            }) {
              ... on PostActionSuccess { post { id } }
              ... on MutationError { message }
            }
          }`;
        const data = await gql(TOKEN, CREATE, { channelId, text });
        const result = data.createPost;
        if (result.message) throw new Error(result.message);
        return { success: true, id: result.post?.id };
      };

      if (platforms?.instagram && profileIds?.instagram) {
        try { results.instagram = await createPost(profileIds.instagram, platforms.instagram.caption); }
        catch(e) { results.instagram = { error: e.message }; }
      }

      if (platforms?.facebook && profileIds?.facebook) {
        try { results.facebook = await createPost(profileIds.facebook, platforms.facebook.caption); }
        catch(e) { results.facebook = { error: e.message }; }
      }

      if (platforms?.pinterest?.pins && profileIds?.pinterest) {
        results.pinterest = [];
        for (const pin of platforms.pinterest.pins) {
          const text = (pin.title ? pin.title + "\n\n" : "") + pin.description;
          try { results.pinterest.push(await createPost(profileIds.pinterest, text)); }
          catch(e) { results.pinterest.push({ error: e.message }); }
        }
      }

      return { statusCode: 200, headers, body: JSON.stringify({ results }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown action: " + body.action }) };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
