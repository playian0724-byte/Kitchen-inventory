(() => {
  const $ = id => document.getElementById(id);
  const config = window.APP_CONFIG || {};
  const cloudReady = Boolean(config.SUPABASE_URL && config.SUPABASE_KEY && window.supabase);
  const client = cloudReady ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_KEY) : null;
  const state = { items: [], logs: [], filter: 'all', search: '', logSearch: '', session: null, page: 'inventory', channel: null };

  function addDays(days){ const d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); }
  function todayKST(){ return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
  function daysLeft(s){ if(!s)return 99999; const t=new Date(); t.setHours(0,0,0,0); return Math.ceil((new Date(`${s}T00:00:00`)-t)/86400000); }
  function statusFor(i){ const d=daysLeft(i.expiry_date); return d<0?'expired':d<=7?'urgent':d<=30?'warning':'normal'; }
  function dLabel(i){ const d=daysLeft(i.expiry_date); return d<0?`D+${Math.abs(d)}`:d===0?'D-DAY':`D-${d}`; }
  function escapeHtml(v=''){ return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function shortDate(s){ return s ? s.slice(5).replace('-','.') : '-'; }
  function showToast(m){ const t=$('toast'); t.textContent=m; t.classList.remove('hidden'); clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>t.classList.add('hidden'),2600); }

  function normalizeMemberName(v=''){ return String(v).trim().replace(/\s+/g,' '); }
  function memberEmail(name){
    const bytes=new TextEncoder().encode(normalizeMemberName(name));
    let binary=''; bytes.forEach(b=>binary+=String.fromCharCode(b));
    const token=btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    return `member-${token}@kitchen-stock.local`;
  }
  function memberNameFromEmail(email=''){
    const m=String(email).match(/^member-([^@]+)@kitchen-stock\.local$/);
    if(!m)return email;
    try{
      let token=m[1].replace(/-/g,'+').replace(/_/g,'/');
      while(token.length%4)token+='=';
      const binary=atob(token);
      const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }catch(_){ return email; }
  }
  function uniqueSuggestions(field){
    const vals=[...state.items,...state.logs].map(x=>String(x[field]||'').trim()).filter(Boolean);
    return [...new Set(vals)].sort((a,b)=>a.localeCompare(b,'ko'));
  }
  function matchingSuggestions(field, query){
    const q=String(query||'').trim().toLocaleLowerCase('ko');
    if(!q)return [];
    return uniqueSuggestions(field)
      .filter(v=>v.toLocaleLowerCase('ko').startsWith(q))
      .slice(0,12);
  }
  function hideSuggestionList(listId){ $(listId).classList.add('hidden'); }
  function updateSuggestionList(inputId,listId,field){
    const input=$(inputId), box=$(listId);
    const matches=matchingSuggestions(field,input.value);
    if(!input.value.trim() || !matches.length){
      box.innerHTML='';
      box.classList.add('hidden');
      return;
    }
    box.innerHTML=matches.map(v=>`<button type="button" class="autocomplete-option" data-value="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join('');
    box.classList.remove('hidden');
    box.querySelectorAll('.autocomplete-option').forEach(btn=>{
      btn.addEventListener('mousedown',e=>e.preventDefault());
      btn.addEventListener('click',()=>{
        input.value=btn.dataset.value;
        box.classList.add('hidden');
        input.focus();
      });
    });
  }
  function bindAutocomplete(inputId,listId,field){
    const input=$(inputId);
    input.addEventListener('input',()=>updateSuggestionList(inputId,listId,field));
    input.addEventListener('focus',()=>{
      if(input.value.trim())updateSuggestionList(inputId,listId,field);
      else hideSuggestionList(listId);
    });
    input.addEventListener('blur',()=>setTimeout(()=>hideSuggestionList(listId),120));
  }

  async function loadCloud(){
    if(!state.session){ state.items=[]; state.logs=[]; render(); return; }
    const [itemsRes,logsRes]=await Promise.all([
      client.from('inventory_items').select('*').order('expiry_date',{ascending:true}),
      client.from('inventory_logs').select('*').order('created_at',{ascending:false}).limit(300)
    ]);
    if(itemsRes.error) return showToast(`\uC7AC\uACE0 \uBD88\uB7EC\uC624\uAE30 \uC2E4\uD328: ${itemsRes.error.message}`);
    if(logsRes.error) return showToast(`\uAE30\uB85D \uBD88\uB7EC\uC624\uAE30 \uC2E4\uD328: ${logsRes.error.message}`);
    state.items=itemsRes.data||[];
    state.logs=logsRes.data||[];
    render();
  }

  function render(){
    const inv=state.page==='inventory';
    $('inventoryPage').classList.toggle('hidden',!inv);
    $('logsPage').classList.toggle('hidden',inv);
    $('addButton').classList.toggle('hidden',!inv);
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
      <div class="item-meta"><span>\uD83D\uDCCD ${escapeHtml(i.location)}</span><span>\uD83D\uDCC5 ${escapeHtml(i.expiry_date)}</span><span class="delivery-meta">\uD83D\uDCE6 \uB0A9\uC785 ${escapeHtml(shortDate(i.delivery_date))}</span>${i.note?`<span class="item-note">\uD83D\uDCDD ${escapeHtml(i.note)}</span>`:''}</div>
    </button>`).join('');

    $('emptyState').classList.toggle('hidden',visible.length!==0);
    document.querySelectorAll('.item-card').forEach(el=>el.addEventListener('click',()=>openEdit(el.dataset.id)));
    document.querySelectorAll('.filter-chip').forEach(el=>el.classList.toggle('active',el.dataset.filter===state.filter));

    const banner=$('modeBanner');
    if(!cloudReady){
      banner.classList.remove('hidden');
      banner.innerHTML='<strong>\uC5F0\uACB0 \uC624\uB958</strong> \u00B7 config.js\uC758 Supabase \uC124\uC815\uC744 \uD655\uC778\uD558\uC138\uC694.';
      $('authButton').textContent='\uC624\uB958';
    } else if(!state.session){
      banner.classList.remove('hidden');
      banner.innerHTML='<strong>\uACF5\uC720 \uBAA8\uB4DC \uC5F0\uACB0\uB428</strong> \u00B7 \uD300 \uC7AC\uACE0\uB97C \uBCF4\uB824\uBA74 \uB85C\uADF8\uC778\uD558\uC138\uC694.';
      $('authButton').textContent='\uB85C\uADF8\uC778';
    } else {
      banner.classList.add('hidden');
      $('authButton').textContent='\uB85C\uADF8\uC544\uC6C3';
    }
  }

  function renderLogs(){
    const q=state.logSearch.trim().toLowerCase();
    const logs=state.logs.filter(l=>!q||`${l.item_name} ${l.location||''} ${l.quantity||''} ${memberNameFromEmail(l.user_email||'')}`.toLowerCase().includes(q));
    const labels={add:'\uC785\uACE0',update:'\uC218\uC815',delete:'\uC0AD\uC81C'};
    const icons={add:'\uD83D\uDCE6',update:'\u270F\uFE0F',delete:'\uD83D\uDDD1\uFE0F'};
    let lastDay='';

    $('logList').innerHTML=logs.map(l=>{
      const dt=new Date(l.created_at);
      const day=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'short'}).format(dt);
      const time=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(dt);
      const header=day!==lastDay?`<div class="log-day">${escapeHtml(day)}</div>`:'';
      lastDay=day;
      return `${header}<article class="log-card log-${l.action}"><div class="log-icon">${icons[l.action]||'\u2022'}</div><div class="log-body">
        <div class="log-title"><strong>${escapeHtml(l.item_name)}</strong><span class="log-badge">${labels[l.action]||escapeHtml(l.action)}</span></div>
        <div class="log-detail">${escapeHtml(l.quantity||'-')} \u00B7 ${escapeHtml(l.location||'-')}</div>
        <div class="log-sub">${l.delivery_date?`\uB0A9\uC785 ${escapeHtml(l.delivery_date)} \u00B7 `:''}${escapeHtml(time)}${l.user_email?` \u00B7 ${escapeHtml(l.user_email)}`:''}</div>
      </div></article>`;
    }).join('');

    $('logEmpty').classList.toggle('hidden',logs.length!==0);
  }

  function openAdd(){
    if(!state.session) return openAuth();
    $('dialogTitle').textContent='\uC7AC\uACE0 \uCD94\uAC00';
    $('itemId').value='';
    $('itemName').value='';
    $('quantity').value='';
    $('location').value='';
    $('deliveryDate').value=todayKST();
    $('expiryDate').value=addDays(30);
    $('note').value='';
    $('deleteButton').classList.add('hidden');
    $('itemDialog').showModal();
  }

  function openEdit(id){
    const i=state.items.find(x=>String(x.id)===String(id));
    if(!i)return;
    $('dialogTitle').textContent='\uC7AC\uACE0 \uC218\uC815';
    $('itemId').value=i.id;
    $('itemName').value=i.item_name;
    $('quantity').value=i.quantity;
    $('location').value=i.location;
    $('deliveryDate').value=i.delivery_date||todayKST();
    $('expiryDate').value=i.expiry_date;
    $('note').value=i.note||'';
    $('deleteButton').classList.remove('hidden');
    $('itemDialog').showModal();
  }

  async function writeLog(action,item,id){
    const u=state.session.user;
    const {error}=await client.from('inventory_logs').insert({
      inventory_id:id||item.id||null,
      action,
      item_name:item.item_name,
      quantity:item.quantity,
      location:item.location,
      expiry_date:item.expiry_date,
      delivery_date:item.delivery_date,
      note:item.note||'',
      user_id:u.id,
      user_email:u.email||''
    });
    if(error)throw error;
  }

  async function saveItem(payload){
    const uid=state.session.user.id;
    if(payload.id){
      const id=payload.id;
      delete payload.id;
      const {error}=await client.from('inventory_items').update({...payload,updated_by:uid}).eq('id',id);
      if(error)throw error;
      await writeLog('update',payload,id);
    } else {
      const {data,error}=await client.from('inventory_items').insert({...payload,created_by:uid,updated_by:uid}).select().single();
      if(error)throw error;
      await writeLog('add',data,data.id);
    }
    await loadCloud();
  }

  async function deleteItem(id){
    const old=state.items.find(i=>String(i.id)===String(id));
    if(!old)return;
    await writeLog('delete',old,id);
    const {error}=await client.from('inventory_items').delete().eq('id',id);
    if(error)throw error;
    await loadCloud();
  }

  function openAuth(){
    if(!cloudReady)return showToast('Supabase \uC5F0\uACB0 \uC124\uC815\uC744 \uD655\uC778\uD558\uC138\uC694.');
    $('authMessage').textContent='';
    $('inviteCode').value='';
    $('authDialog').showModal();
    setTimeout(()=>$('memberName').focus(),50);
  }

  async function signIn(){
    const name=normalizeMemberName($('memberName').value);
    const code=$('inviteCode').value;
    if(!name || !code){
      $('authMessage').textContent='ì´ë¦ê³¼ ì´ëì½ëë¥¼ ìë ¥íì¸ì.';
      return;
    }

    const email=memberEmail(name);
    $('authMessage').textContent='ë¡ê·¸ì¸ ì¤...';

    // Existing member: same shared code signs in.
    const signed=await client.auth.signInWithPassword({email,password:code});
    if(!signed.error){
      $('authMessage').textContent=`${name}ë, ë¡ê·¸ì¸íìµëë¤.`;
      setTimeout(()=>$('authDialog').close(),250);
      return;
    }

    // New member: server verifies the kitchen-wide invite code first.
    const verified=await client.rpc('verify_kitchen_invite',{input_code:code});
    if(verified.error){
      $('authMessage').textContent='ì´ëì½ë íì¸ ì¤ ì¤ë¥ê° ë°ìíìµëë¤.';
      return;
    }
    if(verified.data !== true){
      $('authMessage').textContent='ì´ëì½ëê° ì¬ë°ë¥´ì§ ììµëë¤.';
      return;
    }

    const created=await client.auth.signUp({
      email,
      password:code,
      options:{data:{display_name:name}}
    });
    if(created.error){
      $('authMessage').textContent='ê³ì ì ë§ë¤ì§ ëª»íìµëë¤. ê°ì ì´ë¦ì´ ì´ë¯¸ ìë¤ë©´ ì´ëì½ëë¥¼ ë¤ì íì¸íì¸ì.';
      return;
    }
    if(created.data.session){
      $('authMessage').textContent=`${name}ë, ì²ì ë¡ê·¸ì¸íìµëë¤.`;
      setTimeout(()=>$('authDialog').close(),250);
    }else{
      $('authMessage').textContent='ê³ì ì ìì±ëì§ë§ ì¸ìì´ ììµëë¤. Confirm email ì¤ì ì íì¸íì¸ì.';
    }
  }

  function bindEvents(){
    bindAutocomplete('itemName','itemNameSuggestions','item_name');
    bindAutocomplete('location','locationSuggestions','location');
    $('addButton').addEventListener('click',openAdd);
    $('closeDialog').addEventListener('click',()=>$('itemDialog').close());
    $('closeAuthDialog').addEventListener('click',()=>$('authDialog').close());
    $('searchInput').addEventListener('input',e=>{state.search=e.target.value;render();});
    $('logSearchInput').addEventListener('input',e=>{state.logSearch=e.target.value;renderLogs();});
    document.querySelectorAll('.nav-tab').forEach(el=>el.addEventListener('click',()=>{state.page=el.dataset.page;render();}));
    document.querySelectorAll('[data-filter]').forEach(el=>el.addEventListener('click',()=>{state.filter=el.dataset.filter;render();}));

    $('itemForm').addEventListener('submit',async e=>{
      e.preventDefault();
      const p={
        id:$('itemId').value||undefined,
        item_name:$('itemName').value.trim(),
        quantity:$('quantity').value.trim(),
        location:$('location').value.trim(),
        delivery_date:$('deliveryDate').value,
        expiry_date:$('expiryDate').value,
        note:$('note').value.trim()
      };
      try{
        await saveItem(p);
        $('itemDialog').close();
        showToast('\uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.');
      }catch(err){ showToast(err.message||'\uC800\uC7A5 \uC2E4\uD328'); }
    });

    $('deleteButton').addEventListener('click',async()=>{
      const id=$('itemId').value;
      if(!confirm('\uC774 \uC7AC\uACE0\uB97C \uC0AD\uC81C\uD560\uAE4C\uC694?'))return;
      try{
        await deleteItem(id);
        $('itemDialog').close();
        showToast('\uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.');
      }catch(err){ showToast(err.message||'\uC0AD\uC81C \uC2E4\uD328'); }
    });

    $('authButton').addEventListener('click',async()=>{
      if(state.session){
        await client.auth.signOut();
        showToast('\uB85C\uADF8\uC544\uC6C3\uD588\uC2B5\uB2C8\uB2E4.');
      }else openAuth();
    });
    $('signInButton').addEventListener('click',signIn);

    // notificationButton is intentionally handled only by push.js.
  }

  async function initAuth(){
    if(!client)return;
    const {data}=await client.auth.getSession();
    state.session=data.session;
    client.auth.onAuthStateChange((_e,s)=>{state.session=s;loadCloud();});
    state.channel=client.channel('inventory-v2-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'inventory_items'},()=>loadCloud())
      .on('postgres_changes',{event:'*',schema:'public',table:'inventory_logs'},()=>loadCloud())
      .subscribe();
  }

  async function init(){
    bindEvents();
    await initAuth();
    await loadCloud();
    if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }

  init();
})();
