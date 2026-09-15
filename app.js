(() => {
  const $ = id => document.getElementById(id);
  const config = window.APP_CONFIG || {};
  const cloudReady = Boolean(config.SUPABASE_URL && config.SUPABASE_KEY && window.supabase);
  const client = cloudReady ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_KEY) : null;
  const state = { items: [], logs: [], filter: 'all', search: '', logSearch: '', session: null, page: 'inventory', channel: null };

  function addDays(days) { const d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); }
  function todayKST() { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
  function daysLeft(s) { if(!s)return 99999; const t=new Date();t.setHours(0,0,0,0);return Math.ceil((new Date(`${s}T00:00:00`)-t)/86400000); }
  function statusFor(i) { const d=daysLeft(i.expiry_date); return d<0?'expired':d<=7?'urgent':d<=30?'warning':'normal'; }
  function dLabel(i) { const d=daysLeft(i.expiry_date); return d<0?`D+${Math.abs(d)}`:d===0?'D-DAY':`D-${d}`; }
  function escapeHtml(v='') { return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function shortDate(s) { return s ? s.slice(5).replace('-','.') : '-'; }
  function showToast(m) { const t=$('toast');t.textContent=m;t.classList.remove('hidden');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>t.classList.add('hidden'),2600); }

  async function loadCloud() {
    if(!state.session){ state.items=[];state.logs=[];render();return; }
    const [itemsRes,logsRes]=await Promise.all([
      client.from('inventory_items').select('*').order('expiry_date',{ascending:true}),
      client.from('inventory_logs').select('*').order('created_at',{ascending:false}).limit(300)
    ]);
    if(itemsRes.error)return showToast(`ì¬ê³  ë¶ë¬ì¤ê¸° ì¤í¨: ${itemsRes.error.message}`);
    if(logsRes.error)return showToast(`ê¸°ë¡ ë¶ë¬ì¤ê¸° ì¤í¨: ${logsRes.error.message}`);
    state.items=itemsRes.data||[]; state.logs=logsRes.data||[]; render();
  }

  function render() {
    const inv=state.page==='inventory';
    $('inventoryPage').classList.toggle('hidden',!inv); $('logsPage').classList.toggle('hidden',inv); $('addButton').classList.toggle('hidden',!inv);
    document.querySelectorAll('.nav-tab').forEach(x=>x.classList.toggle('active',x.dataset.page===state.page));
    if(!inv){ renderLogs(); return; }

    const sorted=[...state.items].sort((a,b)=>String(a.expiry_date).localeCompare(String(b.expiry_date)));
    $('countAll').textContent=sorted.length;
    $('countExpired').textContent=sorted.filter(i=>daysLeft(i.expiry_date)<0).length;
    $('count7').textContent=sorted.filter(i=>daysLeft(i.expiry_date)>=0&&daysLeft(i.expiry_date)<=7).length;
    $('count30').textContent=sorted.filter(i=>daysLeft(i.expiry_date)>=0&&daysLeft(i.expiry_date)<=30).length;
    const q=state.search.trim().toLowerCase();
    const visible=sorted.filter(i=>{
      const d=daysLeft(i.expiry_date);
      const searchOk=!q||`${i.item_name} ${i.location} ${i.quantity} ${i.note||''}`.toLowerCase().includes(q);
      const filterOk=state.filter==='all'||(state.filter==='7'&&d>=0&&d<=7)||(state.filter==='30'&&d>=0&&d<=30)||(state.filter==='expired'&&d<0);
      return searchOk&&filterOk;
    });
    $('inventoryList').innerHTML=visible.map(i=>`<button class="item-card status-${statusFor(i)}" data-id="${escapeHtml(i.id)}" type="button">
      <div class="item-top"><div><div class="item-name">${escapeHtml(i.item_name)}</div><div class="item-qty">${escapeHtml(i.quantity)}</div></div><span class="day-badge">${dLabel(i)}</span></div>
      <div class="item-meta"><span>ð ${escapeHtml(i.location)}</span><span>ð ${escapeHtml(i.expiry_date)}</span><span class="delivery-meta">ð¦ ë©ì ${escapeHtml(shortDate(i.delivery_date))}</span>${i.note?`<span class="item-note">ð ${escapeHtml(i.note)}</span>`:''}</div>
    </button>`).join('');
    $('emptyState').classList.toggle('hidden',visible.length!==0);
    document.querySelectorAll('.item-card').forEach(el=>el.addEventListener('click',()=>openEdit(el.dataset.id)));
    document.querySelectorAll('.filter-chip').forEach(el=>el.classList.toggle('active',el.dataset.filter===state.filter));

    const banner=$('modeBanner');
    if(!cloudReady){banner.classList.remove('hidden');banner.innerHTML='<strong>ì°ê²° ì¤ë¥</strong> Â· config.jsì Supabase ì¤ì ì íì¸íì¸ì.';$('authButton').textContent='ì¤ë¥';}
    else if(!state.session){banner.classList.remove('hidden');banner.innerHTML='<strong>ê³µì  ëª¨ë ì°ê²°ë¨</strong> Â· í ì¬ê³ ë¥¼ ë³´ë ¤ë©´ ë¡ê·¸ì¸íì¸ì.';$('authButton').textContent='ë¡ê·¸ì¸';}
    else{banner.classList.add('hidden');$('authButton').textContent='ë¡ê·¸ìì';}
  }

  function renderLogs() {
    const q=state.logSearch.trim().toLowerCase();
    const logs=state.logs.filter(l=>!q||`${l.item_name} ${l.location||''} ${l.quantity||''} ${l.user_email||''}`.toLowerCase().includes(q));
    const labels={add:'ìê³ ',update:'ìì ',delete:'ì­ì '}, icons={add:'ð¦',update:'âï¸',delete:'ðï¸'};
    let lastDay='';
    $('logList').innerHTML=logs.map(l=>{
      const dt=new Date(l.created_at);
      const day=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'short'}).format(dt);
      const time=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(dt);
      const header=day!==lastDay?`<div class="log-day">${escapeHtml(day)}</div>`:''; lastDay=day;
      return `${header}<article class="log-card log-${l.action}"><div class="log-icon">${icons[l.action]||'â¢'}</div><div class="log-body">
        <div class="log-title"><strong>${escapeHtml(l.item_name)}</strong><span class="log-badge">${labels[l.action]||escapeHtml(l.action)}</span></div>
        <div class="log-detail">${escapeHtml(l.quantity||'-')} Â· ${escapeHtml(l.location||'-')}</div>
        <div class="log-sub">${l.delivery_date?`ë©ì ${escapeHtml(l.delivery_date)} Â· `:''}${escapeHtml(time)}${l.user_email?` Â· ${escapeHtml(l.user_email)}`:''}</div>
      </div></article>`;
    }).join('');
    $('logEmpty').classList.toggle('hidden',logs.length!==0);
  }

  function openAdd() {
    if(!state.session)return openAuth();
    $('dialogTitle').textContent='ì¬ê³  ì¶ê°'; $('itemId').value=''; $('itemName').value=''; $('quantity').value=''; $('location').value='';
    $('deliveryDate').value=todayKST(); $('expiryDate').value=addDays(30); $('note').value=''; $('deleteButton').classList.add('hidden'); $('itemDialog').showModal();
  }
  function openEdit(id) {
    const i=state.items.find(x=>String(x.id)===String(id)); if(!i)return;
    $('dialogTitle').textContent='ì¬ê³  ìì '; $('itemId').value=i.id; $('itemName').value=i.item_name; $('quantity').value=i.quantity; $('location').value=i.location;
    $('deliveryDate').value=i.delivery_date||todayKST(); $('expiryDate').value=i.expiry_date; $('note').value=i.note||''; $('deleteButton').classList.remove('hidden'); $('itemDialog').showModal();
  }
  async function writeLog(action,item,id) {
    const u=state.session.user;
    const {error}=await client.from('inventory_logs').insert({inventory_id:id||item.id||null,action,item_name:item.item_name,quantity:item.quantity,location:item.location,expiry_date:item.expiry_date,delivery_date:item.delivery_date,note:item.note||'',user_id:u.id,user_email:u.email||''});
    if(error)throw error;
  }
  async function saveItem(payload) {
    const uid=state.session.user.id;
    if(payload.id){
      const id=payload.id; delete payload.id;
      const {error}=await client.from('inventory_items').update({...payload,updated_by:uid}).eq('id',id); if(error)throw error;
      await writeLog('update',payload,id);
    } else {
      const {data,error}=await client.from('inventory_items').insert({...payload,created_by:uid,updated_by:uid}).select().single(); if(error)throw error;
      await writeLog('add',data,data.id);
    }
    await loadCloud();
  }
  async function deleteItem(id) {
    const old=state.items.find(i=>String(i.id)===String(id)); if(!old)return;
    await writeLog('delete',old,id);
    const {error}=await client.from('inventory_items').delete().eq('id',id); if(error)throw error;
    await loadCloud();
  }

  function openAuth(){ if(!cloudReady)return showToast('Supabase ì°ê²° ì¤ì ì íì¸íì¸ì.'); $('authMessage').textContent=''; $('authDialog').showModal(); }
  async function signIn(){const email=$('email').value.trim(),password=$('password').value;if(!email||!password)return $('authMessage').textContent='ì´ë©ì¼ê³¼ ë¹ë°ë²í¸ë¥¼ ìë ¥íì¸ì.';$('authMessage').textContent='ë¡ê·¸ì¸ ì¤...';const{error}=await client.auth.signInWithPassword({email,password});$('authMessage').textContent=error?error.message:'ë¡ê·¸ì¸íìµëë¤.';if(!error)setTimeout(()=>$('authDialog').close(),300);}
  async function signUp(){const email=$('email').value.trim(),password=$('password').value;if(!email||password.length<6)return $('authMessage').textContent='ì´ë©ì¼ê³¼ 6ì ì´ì ë¹ë°ë²í¸ë¥¼ ìë ¥íì¸ì.';const{error}=await client.auth.signUp({email,password});$('authMessage').textContent=error?error.message:'ê³ì ì ë§ë¤ììµëë¤.';}

  function bindEvents() {
    $('addButton').addEventListener('click',openAdd);
    $('closeDialog').addEventListener('click',()=>$('itemDialog').close());
    $('closeAuthDialog').addEventListener('click',()=>$('authDialog').close());
    $('searchInput').addEventListener('input',e=>{state.search=e.target.value;render();});
    $('logSearchInput').addEventListener('input',e=>{state.logSearch=e.target.value;renderLogs();});
    document.querySelectorAll('.nav-tab').forEach(el=>el.addEventListener('click',()=>{state.page=el.dataset.page;render();}));
    document.querySelectorAll('[data-filter]').forEach(el=>el.addEventListener('click',()=>{state.filter=el.dataset.filter;render();}));
    $('itemForm').addEventListener('submit',async e=>{e.preventDefault();const p={id:$('itemId').value||undefined,item_name:$('itemName').value.trim(),quantity:$('quantity').value.trim(),location:$('location').value.trim(),delivery_date:$('deliveryDate').value,expiry_date:$('expiryDate').value,note:$('note').value.trim()};try{await saveItem(p);$('itemDialog').close();showToast('ì ì¥íìµëë¤.');}catch(err){showToast(err.message||'ì ì¥ ì¤í¨');}});
    $('deleteButton').addEventListener('click',async()=>{const id=$('itemId').value;if(!confirm('ì´ ì¬ê³ ë¥¼ ì­ì í ê¹ì?'))return;try{await deleteItem(id);$('itemDialog').close();showToast('ì­ì íìµëë¤.');}catch(err){showToast(err.message||'ì­ì  ì¤í¨');}});
    $('authButton').addEventListener('click',async()=>{if(state.session){await client.auth.signOut();showToast('ë¡ê·¸ììíìµëë¤.');}else openAuth();});
    $('signInButton').addEventListener('click',signIn); $('signUpButton').addEventListener('click',signUp);
    // notificationButton intentionally has NO handler here.
    // Existing push.js owns it, preserving real background Web Push.
  }
  async function initAuth() {
    if(!client)return;
    const {data}=await client.auth.getSession(); state.session=data.session;
    client.auth.onAuthStateChange((_e,s)=>{state.session=s;loadCloud();});
    state.channel=client.channel('inventory-v2-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'inventory_items'},()=>loadCloud())
      .on('postgres_changes',{event:'*',schema:'public',table:'inventory_logs'},()=>loadCloud())
      .subscribe();
  }
  async function init(){bindEvents();await initAuth();await loadCloud();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});}
  init();
})();
