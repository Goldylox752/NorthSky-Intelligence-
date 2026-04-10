import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({ error: "Missing session_id" });
    }

    const { data, error } = await supabase
      .from('api_keys')
      .select('api_key')
      .eq('stripe_session_id', session_id)
      .maybeSingle(); // ✅ FIXED (no crash)

    if (error) {
      console.error("❌ Supabase error:", error);
      return res.status(500).json({ error: "Database error" });
    }

    if (!data) {
      return res.status(404).json({ error: "Key not found yet" });
    }

    return res.status(200).json({ api_key: data.api_key });

  } catch (err) {
    console.error("🔥 SERVER CRASH:", err);
    return res.status(500).json({ error: "Server error" });
  }
}