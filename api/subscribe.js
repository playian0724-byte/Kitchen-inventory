import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'login required' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'invalid login' });

  const sub = req.body || {};
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return res.status(400).json({ error: 'bad subscription' });
  }

  const { error: dbError } = await supabase
    .from('push_subscriptions')
    .upsert({
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      updated_at: new Date().toISOString()
    }, { onConflict: 'endpoint' });

  if (dbError) return res.status(500).json({ error: dbError.message });
  return res.status(200).json({ ok: true });
}
