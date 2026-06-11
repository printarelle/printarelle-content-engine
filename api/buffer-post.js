// Printarelle Content Engine — Buffer GraphQL API (Vercel Function)
// Requires: BUFFER_TOKEN in Vercel environment variables (Personal Key from Buffer Settings → API)

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

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const TOKEN = process.env.BUFFER_TOKEN;
  if (!TOKEN) return res.status(500).json({
    error: "BUFFER_TOKEN not set. Add your Buffer Personal Key to Vercel → Project → Settings → Environment Variables.",
  });

  try {
    const body = req.body || {};

    // ── Get channels ──────────────────────────────────────────────────────────
    if (body.action === "profiles") {
      const orgData = await gql(TOKEN, `query { account { organizations { id name } } }`);
      const orgs = orgData.account?.organizations || [];
      if (!orgs.length) throw new Error("No organisations found in your Buffer account.");
      const orgId = orgs[0].id;

      const chData = await gql(TOKEN, `
        query GetChannels($orgId: OrganizationId!) {
          channels(input: { organizationId: $orgId }) {
            id
            name
            displayName
            service
          }
        }
      `, { orgId });

      const channels = chData.channels || [];
      return res.status(200).json({
        profiles: channels.map(c => ({
          id: c.id,
          service: c.service || "unknown",
          username: c.displayName || c.name || c.id,
        })),
      });
    }

    // ── Publish ───────────────────────────────────────────────────────────────
    if (body.action === "publish") {
      const { profileIds, platforms } = body;
      const results = {};

      const createPost = async (channelId, text) => {
        const data = await gql(TOKEN, `
          mutation CreatePost($channelId: ChannelId!, $text: String!) {
            createPost(input: {
              channelId: $channelId,
              text: $text,
              schedulingType: automatic,
              mode: addToQueue
            }) {
              ... on PostActionSuccess { post { id } }
              ... on MutationError { message }
            }
          }
        `, { channelId, text });
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

      return res.status(200).json({ results });
    }

    return res.status(400).json({ error: "Unknown action: " + body.action });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
