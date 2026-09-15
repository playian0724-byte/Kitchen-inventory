(() => {
  const cfg = window.APP_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_KEY) return;
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
  }

  async function enablePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('이 기기에서는 웹 푸시를 사용할 수 없습니다.');
      return;
    }
    const { data } = await sb.auth.getSession();
    if (!data.session) {
      alert('먼저 로그인한 뒤 알림을 켜주세요.');
      return;
    }
    if (await Notification.requestPermission() !== 'granted') return;

    const registration = await navigator.serviceWorker.ready;
    const keyResponse = await fetch('/api/vapid-public');
    if (!keyResponse.ok) throw new Error('푸시 공개키를 불러오지 못했습니다.');
    const { publicKey } = await keyResponse.json();

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }

    const response = await fetch('/api/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${data.session.access_token}`
      },
      body: JSON.stringify(subscription.toJSON())
    });
    if (!response.ok) throw new Error('푸시 구독 저장에 실패했습니다.');
    alert('알림 등록 완료! 매일 18시에 유통기한을 확인합니다.');
  }

  window.addEventListener('load', () => {
    const button = document.getElementById('notificationButton');
    if (button) {
      button.addEventListener('click', e => {
        e.stopImmediatePropagation();
        enablePush().catch(err => alert(err.message));
      }, true);
    }
  });
})();