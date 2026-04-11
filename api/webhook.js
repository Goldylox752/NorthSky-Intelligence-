import Stripe from 'stripe';
import crypto from 'crypto';
import { buffer } from 'micro';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const config = {
  api: { bodyParser: false },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    const buf = await buffer(req);

    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    console.log("✅ EVENT:", event.type);

  } catch (err) {
    console.error("❌ STRIPE ERROR:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // 💰 PAYMENT SUCCESS
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    console.log("💰 PAYMENT SUCCESS:", session.id);

    // safer email extraction
    const email =
      session.customer_details?.email ||
      session.customer_email;

    if (!email) {
      console.error("❌ No email found");
      return res.status(200).json({ received: true });
    }

    // 🔑 Generate API key
    const apiKey = crypto.randomBytes(32).toString('hex');

    // 💾 Store in Supabase
    const { error } = await supabase.from('api_keys').insert({
      stripe_session_id: session.id,
      user_id: email,
      email: email,
      api_key: apiKey,
      plan: 'pro',
      usage: 0
    });

    if (error) {
      console.error("❌ SUPABASE ERROR:", error);
    } else {
      console.log("🔥 API KEY CREATED:", apiKey);
    }

    // ✉️ Send email
    try {
      await resend.emails.send({
        from: 'NorthSky <onboarding@resend.dev>',
        to: email,
        subject: 'Your NorthSky API Key 🚀',
        html: `
          <h2>Welcome to NorthSky AI</h2>
          <p>Your API key is ready:</p>
          <pre style="background:#111;padding:12px;border-radius:8px;color:#00ff88;">
${apiKey}
          </pre>
          <p>Use this key in your app to unlock full access.</p>
          <p><a href="https://north-sky-ai.vercel.app">Open App</a></p>
        `
      });

      console.log("📧 Email sent to:", email);

    } catch (emailErr) {
      console.error("❌ EMAIL ERROR:", emailErr);
    }
  }

  return res.status(200).json({ received: true });
}