import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.body || {};

    // fallback if no user system yet
    const finalUserId = userId || 'anonymous_user';

    // generate secure key
    const newKey = crypto.randomBytes(32).toString('hex');

    // insert into database
    const { error } = await supabase
      .from('api_keys')
      .insert({
        user_id: finalUserId,
        api_key: newKey,
        plan: 'paid',
        usage: 0
      });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ apiKey: newKey });

  } catch (err) {
    return res.status(500).json({
      error: 'Server error',
      details: err.message
    });
  }
}