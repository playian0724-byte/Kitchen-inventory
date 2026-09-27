(() => {
  const $ = id => document.getElementById(id);
  const config = window.APP_CONFIG || {};
  const cloudReady = Boolean(config.SUPABASE_URL && config.SUPABASE_KEY && window.supabase);
  const client = cloudReady ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_KEY) : null;
  const state = { items: [], logs: [], filter: 'all', sort: 'expiry', search: '', logSearch: '', session: null, page: 'inventory', channel: null };

  const usingItems = new Set();
  let savingItem = false;

  function addDays(days){ const d=new Date(`${todayKST()}T00:00:00Z`); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); }
  function todayKST(){ return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
  function daysLeft(s){ if(!s)return 99999; return Math.round((Date.parse(`${s}T00:00:00Z`)-Date.parse(`${todayKST()}T00:00:00Z`))/86400000); }
  function statusFor(i){ const d=daysLeft(i.expiry_date); return d<0?'expired':d<=7?'urgent':d<=30?'warning':'normal'; }
  function dLabel(i){ const d=daysLeft(i.expiry_date); return d<0?`D+${Math.abs(d)}`:d===0?'D-DAY':`D-${d}`; }
  function escapeHtml(v=''){ return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function shortDate(s){ return s ? s.slice(5).replace('-','.') : '-'; }
  function parseQuantity(raw=''){
    const s=String(raw||'').trim();
    const m=s.match(/^(\d+)\s*(개|박스)$/);
    if(m)return {count:Number(m[1]),unit:m[2]};
    const n=parseInt(s,10);
    return {count:Number.isFinite(n)?n:1,unit:s.includes('박스')?'박스':'개'};
  }
  function stockQuantity(raw=''){
    // Bare numbers are legacy records saved before the unit fix.
    const match=String(raw).trim().match(/^(\d+)\s*(개|박스)?$/);
    if(!match || !Number.isSafeInteger(Number(match[1])))return null;
    return {count:Number(match[1]),unit:match[2]||'개'};
  }
  function stockKey(name=''){ return String(name).normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('ko'); }
  function lowStocks(){
    const groups=new Map();
    for(const item of state.items){
      const qty=stockQuantity(item.quantity);
      if(!qty || qty.unit!=='개')continue;
      const key=stockKey(item.item_name);
      if(!groups.has(key))groups.set(key,{key,name:item.item_name,count:0,items:[]});
      const group=groups.get(key);group.count+=qty.count;group.items.push(item);
    }
    return [...groups.values()].filter(g=>g.count<=2).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  }
  function renderPurchases(groups){
    $('purchaseList').innerHTML=groups.map(g=>`<article class="purchase-card">
      <div class="item-top"><div class="item-name">${escapeHtml(g.name)}</div><span class="low-stock-badge">부족 · ${g.count}개</span></div>
      <p class="helper">${escapeHtml([...new Set(g.items.map(i=>i.location))].join(' · '))}</p>
      <button class="secondary-btn" type="button" data-restock="${escapeHtml(g.items[0].id)}">재입고</button>
    </article>`).join('');
    $('purchaseEmpty').classList.toggle('hidden',groups.length!==0);
  }

  function setQuantity(count,unit){
    $('quantity').value=Math.max(0,Number.isFinite(Number(count))?Math.floor(Number(count)):1);
    $('quantityUnit').value=unit==='박스'?'박스':'개';
  }
  function stepQuantity(delta){
    const current=Math.max(0,parseInt($('quantity').value,10)||0);
    $('quantity').value=Math.max(0,current+delta);
  }
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
    $('logsPage').classList.toggle('hidden',state.page!=='logs');
    $('purchasesPage').classList.toggle('hidden',state.page!=='purchases');
    $('addButton').classList.toggle('hidden',!inv);
    document.querySelectorAll('.nav-tab').forEach(x=>x.classList.toggle('active',x.dataset.page===state.page));
    const shortages=lowStocks();
    const lowKeys=new Set(shortages.map(g=>g.key));
    $('purchaseCount').textContent=shortages.length;
    renderPurchases(shortages);
    if(state.page==='logs')renderLogs();

    const byName=(a,b)=>String(a.item_name||'').localeCompare(String(b.item_name||''),'ko',{numeric:true});
    const byExpiry=(a,b)=>String(a.expiry_date||'9999-12-31').localeCompare(String(b.expiry_date||'9999-12-31'));
    const sorted=[...state.items].sort((a,b)=>state.sort==='name' ? byName(a,b)||byExpiry(a,b) : byExpiry(a,b)||byName(a,b));
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

    $('inventoryList').innerHTML=visible.map(i=>{
      const qty=stockQuantity(i.quantity), busy=usingItems.has(String(i.id));
      const shortage=qty?.unit==='개'&&lowKeys.has(stockKey(i.item_name));
      return `<article class="item-card status-${statusFor(i)}" data-id="${escapeHtml(i.id)}">
        <button class="item-open" data-edit="${escapeHtml(i.id)}" type="button" ${busy?'disabled':''} aria-label="${escapeHtml(i.item_name)} 수정">
          <div class="item-top"><div><div class="item-name">${escapeHtml(i.item_name)} ${shortage?'<span class="low-stock-badge">부족</span>':''}</div><div class="item-qty">${escapeHtml(i.quantity)}</div></div><span class="day-badge">${dLabel(i)}</span></div>
          <div class="item-meta"><span>📍 ${escapeHtml(i.location)}</span><span>📅 ${escapeHtml(i.expiry_date)}</span><span class="delivery-meta">📦 납입 ${escapeHtml(shortDate(i.delivery_date))}</span>${i.note?`<span class="item-note">📝 ${escapeHtml(i.note)}</span>`:''}</div>
        </button>
        <div class="item-actions">
          <button type="button" data-use-one="${escapeHtml(i.id)}" ${!qty||qty.count<1||busy?'disabled':''}>1${qty?.unit||'개'} 사용</button>
          <button type="button" data-use="${escapeHtml(i.id)}" ${!qty||qty.count<1||busy?'disabled':''}>수량 지정</button>
          <button type="button" data-restock="${escapeHtml(i.id)}">재입고</button>
        </div>
      </article>`;
    }).join('');

    $('emptyState').classList.toggle('hidden',visible.length!==0);
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
        <div class="log-title"><strong>${escapeHtml(l.item_name)}</strong><span class="log-badge">${l.action==='update'&&String(l.note||'').startsWith('[사용] ')?'사용':labels[l.action]||escapeHtml(l.action)}</span></div>
        <div class="log-detail">${escapeHtml(l.quantity||'-')} \u00B7 ${escapeHtml(l.location||'-')}</div>
        ${l.action==='update'&&String(l.note||'').startsWith('[사용] ')?`<div class="log-detail">${escapeHtml(l.note)}</div>`:''}
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
    setQuantity(1,'개');
    $('location').value='';
    setDateField('deliveryDate',todayKST());
    setDateField('expiryDate',addDays(30));
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
    const qty=parseQuantity(i.quantity);
    setQuantity(qty.count,qty.unit);
    $('location').value=i.location;
    setDateField('deliveryDate',i.delivery_date||todayKST());
    setDateField('expiryDate',i.expiry_date);
    $('note').value=i.note||'';
    $('deleteButton').classList.remove('hidden');
    $('itemDialog').showModal();
  }

  function openRestock(id){
    if(!state.session)return openAuth();
    const item=state.items.find(i=>String(i.id)===String(id));
    if(!item)return;
    openAdd();
    $('dialogTitle').textContent='재입고 · 별도 재고 등록';
    $('itemName').value=item.item_name;
    $('location').value=item.location;
    setQuantity(1,stockQuantity(item.quantity)?.unit||'개');
  }
  function openUse(id){
    if(!state.session)return openAuth();
    const item=state.items.find(i=>String(i.id)===String(id));
    const qty=item&&stockQuantity(item.quantity);
    if(!qty || qty.count<1)return;
    $('useItemId').value=item.id;
    $('useQuantity').value=1;
    $('useQuantity').max=qty.count;
    $('useSummary').textContent=`${item.item_name} · ${item.location} · 유통기한 ${item.expiry_date} · 남은 수량 ${qty.count}${qty.unit}`;
    $('useDialog').showModal();
  }
  async function useStock(id,amount){
    if(!state.session){openAuth();return false;}
    id=String(id);
    if(usingItems.has(id))return false;
    const item=state.items.find(i=>String(i.id)===id);
    const qty=item&&stockQuantity(item.quantity);
    if(!qty || !Number.isSafeInteger(amount) || amount<1 || amount>qty.count){
      showToast('남은 수량 이내의 정수를 입력하세요.');return false;
    }
    usingItems.add(id);render();
    try{
      // Compare-and-set prevents concurrent use from overwriting another member's change.
      let query=client.from('inventory_items').update({quantity:`${qty.count-amount}${qty.unit}`,updated_by:state.session.user.id})
        .eq('id',id).eq('quantity',item.quantity);
      if(item.updated_at)query=query.eq('updated_at',item.updated_at);
      const {data,error}=await query.select().maybeSingle();
      if(error)throw error;
      if(!data){await loadCloud();showToast('다른 사용자가 재고를 변경했습니다. 최신 수량을 확인하고 다시 처리하세요.');return false;}
      state.items=state.items.map(i=>String(i.id)===id?data:i);
      let logFailed=false;
      try{
        await writeLog('update',{...data,note:`[사용] ${amount}${qty.unit} 사용 · ${qty.count}${qty.unit} → ${qty.count-amount}${qty.unit}`},id);
      }catch(_){logFailed=true;}
      await loadCloud();
      showToast(logFailed?'수량은 차감됐지만 사용 기록 저장에 실패했습니다. 다시 차감하지 마세요.':`${item.item_name} ${amount}${qty.unit} 사용 처리했습니다.`);
      return true;
    }catch(error){showToast(error.message||'사용 처리에 실패했습니다.');return false;}
    finally{usingItems.delete(id);render();}
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
      user_email:u.user_metadata?.display_name || memberNameFromEmail(u.email||'') || u.email || ''
    });
    if(error)throw error;
  }

  async function saveItem(payload){
    let logFailed=false;
    const uid=state.session.user.id;
    if(payload.id){
      const id=payload.id;
      delete payload.id;
      const {error}=await client.from('inventory_items').update({...payload,updated_by:uid}).eq('id',id);
      if(error)throw error;
      try{await writeLog('update',payload,id);}catch(_){logFailed=true;}
    } else {
      const {data,error}=await client.from('inventory_items').insert({...payload,created_by:uid,updated_by:uid}).select().single();
      if(error)throw error;
      try{await writeLog('add',data,data.id);}catch(_){logFailed=true;}
    }
    await loadCloud();
    return {logFailed};
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

  function setDateField(id,value){
    const [year,month,day]=(value||todayKST()).split('-').map(Number);
    const y=$(id+'Year'), m=$(id+'Month'), d=$(id+'Day');
    if(![...y.options].some(o=>Number(o.value)===year))y.add(new Option(`${year}년`,year));
    y.value=year; m.value=month;
    const maxDay=new Date(Date.UTC(year,month,0)).getUTCDate();
    d.replaceChildren(...Array.from({length:maxDay},(_,i)=>new Option(`${i+1}일`,i+1)));
    d.value=Math.min(day,maxDay);
    $(id).value=`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(d.value).padStart(2,'0')}`;
  }
  function bindDateFields(){
    for(const id of ['deliveryDate','expiryDate']){
      const year=Number(todayKST().slice(0,4));
      $(id+'Year').replaceChildren(...Array.from({length:31},(_,i)=>new Option(`${year-10+i}년`,year-10+i)));
      $(id+'Month').replaceChildren(...Array.from({length:12},(_,i)=>new Option(`${i+1}월`,i+1)));
      setDateField(id,todayKST());
      for(const part of ['Year','Month','Day'])$(id+part).addEventListener('change',()=>{
        setDateField(id,`${$(id+'Year').value}-${$(id+'Month').value}-${$(id+'Day').value}`);
      });
    }
    document.querySelectorAll('[data-date-target]').forEach(button=>button.addEventListener('click',()=>{
      setDateField(button.dataset.dateTarget,addDays(Number(button.dataset.days)));
    }));
  }

  function bindEvents(){
    bindDateFields();
    for(const list of ['inventoryList','purchaseList'])$(list).addEventListener('click',e=>{
      const button=e.target.closest('button');
      if(!button||button.disabled)return;
      if(button.dataset.edit)openEdit(button.dataset.edit);
      else if(button.dataset.restock)openRestock(button.dataset.restock);
      else if(button.dataset.useOne)useStock(button.dataset.useOne,1);
      else if(button.dataset.use)openUse(button.dataset.use);
    });
    $('closeUseDialog').addEventListener('click',()=>$('useDialog').close());
    $('useForm').addEventListener('submit',async e=>{
      e.preventDefault();
      if($('useSubmit').disabled)return;
      $('useSubmit').disabled=true;
      $('closeUseDialog').disabled=true;
      try{if(await useStock($('useItemId').value,Number($('useQuantity').value)))$('useDialog').close();}
      finally{$('useSubmit').disabled=false;$('closeUseDialog').disabled=false;}
    });
    $('useDialog').addEventListener('cancel',e=>{if($('useSubmit').disabled)e.preventDefault();});
    try { state.sort=localStorage.getItem('inventory-sort')==='name'?'name':'expiry'; } catch(_) {}
    $('sortSelect').value=state.sort;
    $('sortSelect').addEventListener('change',e=>{
      state.sort=e.target.value;
      try { localStorage.setItem('inventory-sort',state.sort); } catch(_) {}
      render();
    });
    bindAutocomplete('itemName','itemNameSuggestions','item_name');
    bindAutocomplete('location','locationSuggestions','location');
    $('quantityMinus').addEventListener('click',()=>stepQuantity(-1));
    $('quantityPlus').addEventListener('click',()=>stepQuantity(1));
    $('addButton').addEventListener('click',openAdd);
    $('closeDialog').addEventListener('click',()=>$('itemDialog').close());
    $('closeAuthDialog').addEventListener('click',()=>$('authDialog').close());
    $('searchInput').addEventListener('input',e=>{state.search=e.target.value;render();});
    $('logSearchInput').addEventListener('input',e=>{state.logSearch=e.target.value;renderLogs();});
    document.querySelectorAll('.nav-tab').forEach(el=>el.addEventListener('click',()=>{state.page=el.dataset.page;render();}));
    document.querySelectorAll('[data-filter]').forEach(el=>el.addEventListener('click',()=>{state.filter=el.dataset.filter;render();}));

    $('itemForm').addEventListener('submit',async e=>{
      e.preventDefault();
      if(savingItem)return;
      savingItem=true;
      const submit=$('itemForm').querySelector('[type=submit]');submit.disabled=true;
      const p={
        id:$('itemId').value||undefined,
        item_name:$('itemName').value.trim(),
        quantity:`${Math.max(0,parseInt($('quantity').value,10)||0)}${$('quantityUnit').value}`,
        location:$('location').value.trim(),
        delivery_date:$('deliveryDate').value,
        expiry_date:$('expiryDate').value,
        note:$('note').value.trim()
      };
      try{
        const result=await saveItem(p);
        $('itemDialog').close();
        showToast(result.logFailed?'재고는 저장됐지만 기록 저장에 실패했습니다. 다시 등록하지 마세요.':'저장했습니다.');
      }catch(err){ showToast(err.message||'\uC800\uC7A5 \uC2E4\uD328'); }
      finally{savingItem=false;submit.disabled=false;}
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
