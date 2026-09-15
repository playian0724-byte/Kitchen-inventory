import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  webpush.setVapidDetails(
    'mailto:kitchen-inventory@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Current app's table is public.inventory.
  const { data: items, error: itemError } =
    await supabase.from('inventory').select('expiry_date');

  if (itemError) return res.status(500).json({ error: itemError.message });

  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());

  let urgent = 0;
  let expired = 0;

  for (const item of items || []) {
    if (!item.expiry_date) continue;
    const [y,m,d] = item.expiry_date.split('-').map(Number);
    const diff = Math.floor((Date.UTC(y,m-1,d) - today) / 86400000);
    if (diff < 0) expired++;
    else if (diff <= 7) urgent++;
  }

  if (!urgent && !expired) {
    return res.status(200).json({ ok: true, sent: 0, reason: 'no expiring stock' });
  }

  const { data: subs, error: subError } =
    await supabase.from('push_subscriptions').select('*');
  if (subError) return res.status(500).json({ error: subError.message });

  const payload = JSON.stringify({
    title: '⚠️ 취사장 유통기한 확인',
    body: `임박 ${urgent}건 · 만료 ${expired}건\n앱을 열어 재고를 확인하세요.`,
    url: '/'
  });

  let sent = 0;
  for (const sub of subs || []) {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      }, payload);
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      }
    }
  }

  return res.status(200).json({ ok: true, sent, urgent, expired });
}