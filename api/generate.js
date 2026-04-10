import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // 🔥 IMPORTANT FIX
);

export default async function handler(req, res) {
  try {
    // only allow POST
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // 1. API key
    const apiKey = req.headers["x-api-key"];

    if (!apiKey) {
      return res.status(401).json({ error: "Missing API key" });
    }

    // 2. Validate key in DB
    const { data: keyData, error } = await supabase
      .from("api_keys")
      .select("user_id, active")
      .eq("api_key", apiKey)
      .eq("active", true)
      .maybeSingle(); // 🔥 safer than .single()

    if (error || !keyData) {
      return res.status(403).json({ error: "Invalid or inactive API key" });
    }

    // 3. Validate input
    const { message } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing or invalid message" });
    }

    // 4. (OPTIONAL) rate limit placeholder
    // TODO: add Redis / Supabase usage counter

    // 5. AI logic (replace later with OpenAI)
    const reply = `NorthSky Secure AI Response:\n\nUser: ${message}`;

    return res.status(200).json({
      reply,
      user_id: keyData.user_id
    });

  } catch (err) {
    console.error("API ERROR:", err);

    return res.status(500).json({
      error: "Internal server error"
    });
  }
}
