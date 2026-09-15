import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  console.log('=== EXPIRY CRON START ===');

  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    console.log('❌ Cron 인증 실패');
    return res.status(401).json({ error: 'unauthorized' });
  }

  console.log('✅ Cron 인증 성공');

  try {
    webpush.setVapidDetails(
      'https://kitchen-inventory-teal.vercel.app',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 실제 앱에서 사용하는 재고 테이블
    const { data: items, error: itemError } = await supabase
      .from('inventory_items')
      .select('id, item_name, expiry_date');

    if (itemError) {
      console.error('❌ 재고 조회 실패:', itemError.message);
      return res.status(500).json({
        error: 'inventory query failed',
        detail: itemError.message
      });
    }

    console.log(`📦 전체 재고: ${items?.length || 0}개`);

    // 한국 날짜 기준
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    const todayString = formatter.format(new Date());
    const [ty, tm, td] = todayString.split('-').map(Number);
    const today = Date.UTC(ty, tm - 1, td);

    let urgent = 0;
    let expired = 0;

    for (const item of items || []) {
      if (!item.expiry_date) continue;

      const [y, m, d] = item.expiry_date.split('-').map(Number);
      const expiry = Date.UTC(y, m - 1, d);
      const diff = Math.floor((expiry - today) / 86400000);

      console.log(
        `• ${item.item_name}: ${item.expiry_date} / D${diff >= 0 ? '-' + diff : '+' + Math.abs(diff)}`
      );

      if (diff < 0) {
        expired++;
      } else if (diff <= 7) {
        urgent++;
      }
    }

    console.log(`🟠 D-7 이내: ${urgent}개`);
    console.log(`🔴 만료: ${expired}개`);

    if (urgent === 0 && expired === 0) {
      console.log('ℹ️ 알림 대상 없음 → 발송하지 않음');

      return res.status(200).json({
        ok: true,
        inventory: items?.length || 0,
        urgent,
        expired,
        subscriptions: 0,
        sent: 0,
        reason: 'no expiring stock'
      });
    }

    const { data: subs, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*');

    if (subError) {
      console.error('❌ 구독 조회 실패:', subError.message);
      return res.status(500).json({
        error: 'subscription query failed',
        detail: subError.message
      });
    }

    console.log(`📱 등록된 푸시 기기: ${subs?.length || 0}개`);

    const payload = JSON.stringify({
      title: '⚠️ 취사장 유통기한 확인',
      body: `임박 ${urgent}건 · 만료 ${expired}건\n앱을 열어 재고를 확인하세요.`,
      url: '/'
    });

    let sent = 0;
    let failed = 0;

    for (const sub of subs || []) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth
            }
          },
          payload
        );

        sent++;
        console.log('✅ 푸시 발송 성공');
      } catch (error) {
        failed++;

        console.error(
          '❌ 푸시 발송 실패:',
          error.statusCode || '',
          error.message
        );

        if (error.statusCode === 404 || error.statusCode === 410) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', sub.endpoint);

          console.log('🗑️ 만료된 푸시 구독 삭제');
        }
      }
    }

    console.log(`🚀 발송 완료: 성공 ${sent} / 실패 ${failed}`);
    console.log('=== EXPIRY CRON END ===');

    return res.status(200).json({
      ok: true,
      inventory: items?.length || 0,
      urgent,
      expired,
      subscriptions: subs?.length || 0,
      sent,
      failed
    });

  } catch (error) {
    console.error('💥 예상하지 못한 오류:', error.message);

    return res.status(500).json({
      error: 'unexpected error',
      detail: error.message
    });
  }
}
