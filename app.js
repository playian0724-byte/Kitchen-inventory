(() => {
  const $ = (id) => document.getElementById(id);
  const config = window.APP_CONFIG || {};
  const cloudReady = Boolean(config.SUPABASE_URL && config.SUPABASE_KEY && window.supabase);
  const client = cloudReady ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_KEY) : null;

  const state = {
    items: [],
    filter: 'all',
    search: '',
    session: null,
    channel: null,
    mode: cloudReady ? 'cloud' : 'demo'
  };

  const seedItems = [
    { id: crypto.randomUUID(), item_name: '냉동 닭정육', quantity: '12봉', location: '냉동고 2번', expiry_date: addDays(5), note: '먼저 사용' },
    { id: crypto.randomUUID(), item_name: '우유', quantity: '18개', location: '냉장고 1번', expiry_date: addDays(18), note: '' },
    { id: crypto.randomUUID(), item_name: '고추장', quantity: '3통', location: '건식창고 1단', expiry_date: addDays(93), note: '' },
    { id: crypto.randomUUID(), item_name: '소스 샘플', quantity: '1개', location: '냉장고 문쪽', expiry_date: addDays(-2), note: '폐기 확인 필요' }
  ];

  function addDays(days) {
    const d = new Date();
    d.setHours(12,0,0,0);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0,10);
  }

  function daysLeft(dateString) {
    if (!dateString) return 99999;
    const today = new Date();
    today.setHours(0,0,0,0);
    const target = new Date(`${dateString}T00:00:00`);
    return Math.ceil((target - today) / 86400000);
  }

  function statusFor(item) {
    const d = daysLeft(item.expiry_date);
    if (d < 0) return 'expired';
    if (d <= 7) return 'urgent';
    if (d <= 30) return 'warning';
    return 'normal';
  }

  function dLabel(item) {
    const d = daysLeft(item.expiry_date);
    if (d < 0) return `D+${Math.abs(d)}`;
    if (d === 0) return 'D-DAY';
    return `D-${d}`;
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.add('hidden'), 2600);
  }

  function saveDemo() {
    localStorage.setItem('kitchen_inventory_demo', JSON.stringify(state.items));
  }

  function loadDemo() {
    const saved = localStorage.getItem('kitchen_inventory_demo');
    state.items = saved ? JSON.parse(saved) : seedItems;
    if (!saved) saveDemo();
  }

  async function loadCloud() {
    if (!state.session) {
      state.items = [];
      render();
      return;
    }
    const { data, error } = await client.from('inventory_items').select('*').order('expiry_date', { ascending: true });
    if (error) return showToast(`불러오기 실패: ${error.message}`);
    state.items = data || [];
    render();
    checkNotifications();
  }

  async function loadItems() {
    if (state.mode === 'cloud') return loadCloud();
    loadDemo();
    render();
    checkNotifications();
  }

  function render() {
    const sorted = [...state.items].sort((a,b) => String(a.expiry_date).localeCompare(String(b.expiry_date)));
    const counts = {
      all: sorted.length,
      expired: sorted.filter(i => daysLeft(i.expiry_date) < 0).length,
      seven: sorted.filter(i => daysLeft(i.expiry_date) >= 0 && daysLeft(i.expiry_date) <= 7).length,
      thirty: sorted.filter(i => daysLeft(i.expiry_date) >= 0 && daysLeft(i.expiry_date) <= 30).length
    };
    $('countAll').textContent = counts.all;
    $('count7').textContent = counts.seven;
    $('count30').textContent = counts.thirty;
    $('countExpired').textContent = counts.expired;

    const q = state.search.trim().toLowerCase();
    const visible = sorted.filter(item => {
      const d = daysLeft(item.expiry_date);
      const matchesSearch = !q || `${item.item_name} ${item.location} ${item.quantity} ${item.note || ''}`.toLowerCase().includes(q);
      let matchesFilter = true;
      if (state.filter === '7') matchesFilter = d >= 0 && d <= 7;
      if (state.filter === '30') matchesFilter = d >= 0 && d <= 30;
      if (state.filter === 'expired') matchesFilter = d < 0;
      return matchesSearch && matchesFilter;
    });

    $('inventoryList').innerHTML = visible.map(item => {
      const status = statusFor(item);
      return `<button class="item-card status-${status}" data-id="${escapeHtml(item.id)}" type="button">
        <div class="item-top">
          <div>
            <div class="item-name">${escapeHtml(item.item_name)}</div>
            <div class="item-qty">${escapeHtml(item.quantity)}</div>
          </div>
          <span class="day-badge">${dLabel(item)}</span>
        </div>
        <div class="item-meta">
          <span>📍 ${escapeHtml(item.location)}</span>
          <span>📅 ${escapeHtml(item.expiry_date)}</span>
          ${item.note ? `<span class="item-note">📝 ${escapeHtml(item.note)}</span>` : ''}
        </div>
      </button>`;
    }).join('');

    $('emptyState').classList.toggle('hidden', visible.length !== 0);
    document.querySelectorAll('.item-card').forEach(el => el.addEventListener('click', () => openEdit(el.dataset.id)));
    document.querySelectorAll('.filter-chip').forEach(el => el.classList.toggle('active', el.dataset.filter === state.filter));

    const banner = $('modeBanner');
    if (state.mode === 'demo') {
      banner.classList.remove('hidden');
      banner.innerHTML = '<strong>데모 모드</strong> · 지금은 이 기기에만 저장됩니다. config.js에 Supabase 정보를 넣으면 팀 공유 모드로 전환됩니다.';
      $('authButton').textContent = '데모';
    } else if (!state.session) {
      banner.classList.remove('hidden');
      banner.innerHTML = '<strong>공유 모드 연결됨</strong> · 팀 재고를 보려면 로그인하세요.';
      $('authButton').textContent = '로그인';
    } else {
      banner.classList.add('hidden');
      $('authButton').textContent = '로그아웃';
    }
  }

  function setFilter(filter) {
    state.filter = filter;
    render();
  }

  function openAdd() {
    if (state.mode === 'cloud' && !state.session) return openAuth();
    $('dialogTitle').textContent = '재고 추가';
    $('itemId').value = '';
    $('itemName').value = '';
    $('quantity').value = '';
    $('location').value = '';
    $('expiryDate').value = addDays(30);
    $('note').value = '';
    $('deleteButton').classList.add('hidden');
    $('itemDialog').showModal();
  }

  function openEdit(id) {
    const item = state.items.find(i => String(i.id) === String(id));
    if (!item) return;
    $('dialogTitle').textContent = '재고 수정';
    $('itemId').value = item.id;
    $('itemName').value = item.item_name;
    $('quantity').value = item.quantity;
    $('location').value = item.location;
    $('expiryDate').value = item.expiry_date;
    $('note').value = item.note || '';
    $('deleteButton').classList.remove('hidden');
    $('itemDialog').showModal();
  }

  async function upsertItem(payload) {
    if (state.mode === 'demo') {
      if (payload.id) {
        state.items = state.items.map(i => i.id === payload.id ? { ...i, ...payload } : i);
      } else {
        state.items.push({ ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() });
      }
      saveDemo();
      render();
      checkNotifications();
      return;
    }

    if (!state.session) return openAuth();
    const userId = state.session.user.id;
    if (payload.id) {
      const id = payload.id;
      delete payload.id;
      const { error } = await client.from('inventory_items').update({ ...payload, updated_by: userId }).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await client.from('inventory_items').insert({ ...payload, created_by: userId, updated_by: userId });
      if (error) throw error;
    }
    await loadCloud();
  }

  async function deleteItem(id) {
    if (!id) return;
    if (state.mode === 'demo') {
      state.items = state.items.filter(i => i.id !== id);
      saveDemo();
      render();
      return;
    }
    const { error } = await client.from('inventory_items').delete().eq('id', id);
    if (error) throw error;
    await loadCloud();
  }

  async function requestNotifications() {
    if (!('Notification' in window)) return showToast('이 브라우저는 알림을 지원하지 않습니다.');
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      showToast('유통기한 알림을 켰습니다.');
      checkNotifications(true);
    } else {
      showToast('알림 권한이 허용되지 않았습니다.');
    }
  }

  function checkNotifications(force = false) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const todayKey = new Date().toISOString().slice(0,10);
    const targets = state.items.filter(i => daysLeft(i.expiry_date) <= 7);
    targets.forEach(item => {
      const key = `kitchen_notified_${item.id}_${todayKey}`;
      if (!force && localStorage.getItem(key)) return;
      const d = daysLeft(item.expiry_date);
      const body = d < 0
        ? `${item.item_name} · 유통기한 ${Math.abs(d)}일 경과 · ${item.location}`
        : `${item.item_name} · 유통기한 ${d}일 남음 · ${item.location}`;
      try { new Notification('취사장 유통기한 알림', { body, tag: `expiry-${item.id}` }); } catch (_) {}
      localStorage.setItem(key, '1');
    });
  }

  function openAuth() {
    if (state.mode === 'demo') return showToast('현재 데모 모드입니다. config.js에 Supabase 정보를 입력하세요.');
    $('authMessage').textContent = state.session ? `로그인됨: ${state.session.user.email || '사용자'}` : '';
    $('authDialog').showModal();
  }

  async function signIn() {
    const email = $('email').value.trim();
    const password = $('password').value;
    if (!email || !password) return $('authMessage').textContent = '이메일과 비밀번호를 입력하세요.';
    $('authMessage').textContent = '로그인 중...';
    const { error } = await client.auth.signInWithPassword({ email, password });
    $('authMessage').textContent = error ? error.message : '로그인했습니다.';
    if (!error) setTimeout(() => $('authDialog').close(), 350);
  }

  async function signUp() {
    const email = $('email').value.trim();
    const password = $('password').value;
    if (!email || password.length < 6) return $('authMessage').textContent = '이메일과 6자 이상 비밀번호를 입력하세요.';
    $('authMessage').textContent = '계정 생성 중...';
    const { error } = await client.auth.signUp({ email, password });
    $('authMessage').textContent = error ? error.message : '계정을 만들었습니다. 이메일 확인이 켜져 있으면 인증 메일을 확인하세요.';
  }

  async function signOut() {
    if (client) await client.auth.signOut();
  }

  function bindEvents() {
    $('addButton').addEventListener('click', openAdd);
    $('closeDialog').addEventListener('click', () => $('itemDialog').close());
    $('closeAuthDialog').addEventListener('click', () => $('authDialog').close());
    $('notificationButton').addEventListener('click', requestNotifications);
    $('searchInput').addEventListener('input', e => { state.search = e.target.value; render(); });
    document.querySelectorAll('[data-filter]').forEach(el => el.addEventListener('click', () => setFilter(el.dataset.filter)));

    $('itemForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        id: $('itemId').value || undefined,
        item_name: $('itemName').value.trim(),
        quantity: $('quantity').value.trim(),
        location: $('location').value.trim(),
        expiry_date: $('expiryDate').value,
        note: $('note').value.trim()
      };
      try {
        await upsertItem(payload);
        $('itemDialog').close();
        showToast('저장했습니다.');
      } catch (err) { showToast(err.message || '저장 실패'); }
    });

    $('deleteButton').addEventListener('click', async () => {
      const id = $('itemId').value;
      if (!confirm('이 재고를 삭제할까요?')) return;
      try {
        await deleteItem(id);
        $('itemDialog').close();
        showToast('삭제했습니다.');
      } catch (err) { showToast(err.message || '삭제 실패'); }
    });

    $('authButton').addEventListener('click', async () => {
      if (state.mode === 'demo') return openAuth();
      if (state.session) {
        await signOut();
        showToast('로그아웃했습니다.');
      } else openAuth();
    });
    $('signInButton').addEventListener('click', signIn);
    $('signUpButton').addEventListener('click', signUp);
  }

  async function initAuth() {
    if (!client) return;
    const { data } = await client.auth.getSession();
    state.session = data.session;
    client.auth.onAuthStateChange((_event, session) => {
      state.session = session;
      render();
      loadCloud();
    });
    state.channel = client.channel('inventory-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, () => loadCloud())
      .subscribe();
  }

  async function init() {
    bindEvents();
    await initAuth();
    await loadItems();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  init();
})();
