(() => {
  'use strict';

  const VERSION = '2.0.0';
  const STORAGE_KEY = 'ct_v2_state';
  const DOC_DB = 'ct_v2_docs';
  const DOC_STORE = 'docs';
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const refs = {
    views: {
      inicio: $('#view-inicio'),
      nuevo: $('#view-nuevo'),
      cuaderno: $('#view-cuaderno'),
      alertas: $('#view-alertas'),
      mas: $('#view-mas')
    },
    nav: $$('.nav-button'),
    search: $('#globalSearch'),
    modal: $('#modalRoot'),
    toast: $('#toastRoot'),
    install: $('#installButton'),
    backupInput: $('#backupImportInput'),
    docsInput: $('#catalogDocInput')
  };

  const ui = {
    view: 'inicio',
    search: '',
    cuadernoMode: 'cards',
    activeDraftId: null,
    pendingDocProductId: null,
    installPrompt: null,
    tab: 'ficha'
  };

  const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const nowIso = () => new Date().toISOString();
  const uid = (p='id') => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`;
  const esc = v => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const num = v => v === '' || v === null || v === undefined ? null : (Number.isFinite(Number(String(v).replace(',','.'))) ? Number(String(v).replace(',','.')) : null);
  const fmtNum = v => num(v) === null ? '—' : new Intl.NumberFormat('es-ES',{maximumFractionDigits:3}).format(num(v));
  const fmtDate = iso => {
    const [y,m,d] = String(iso || '').split('-');
    return y && m && d ? `${d}/${m}/${y}` : '—';
  };
  const parseManualDate = raw => {
    const m = String(raw || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const dt = new Date(Number(m[3]), Number(m[2])-1, Number(m[1]));
    if (dt.getFullYear() !== Number(m[3]) || dt.getMonth() !== Number(m[2])-1 || dt.getDate() !== Number(m[1])) return null;
    return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  };
  const dateObj = iso => {
    const [y,m,d] = String(iso || '').split('-').map(Number);
    if (!y || !m || !d) return null;
    const dt = new Date(y,m-1,d);
    return dt.getFullYear() === y && dt.getMonth() === m-1 && dt.getDate() === d ? dt : null;
  };
  const isFuture = iso => {
    const a = dateObj(iso);
    const b = dateObj(todayIso());
    return Boolean(a && b && a.getTime() > b.getTime());
  };
  const units = ['g/hL','kg/hL','mL/hL','L/hL','g/ha','kg/ha','mL/ha','L/ha'];

  const blankUse = () => ({
    id: uid('uso'),
    crop: 'Vid de vinificación',
    target: '',
    ps: 'A verificar',
    doseDisplay: 'A verificar',
    doseRule: { kind:'unset', unit:'', value:null, min:null, max:null, limitHa:null },
    volumeDisplay: 'A verificar',
    volumeRule: { kind:'unset', value:null, min:null, max:null },
    maxApplications: null,
    interval: '',
    stadium: '',
    extra: ''
  });

  const blankState = () => ({
    schema: 'CT-APP-V2',
    version: VERSION,
    campaign: '2026',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    settings: {
      campaignName: 'Campaña 2026',
      applicator: 'JOSE FELIX BUA VILA',
      defaultCrop: 'Vid de vinificación',
      defaultLha: 400
    },
    products: [],
    interventions: [],
    drafts: [],
    resolvedAlerts: [],
    importHistory: []
  });

  function normalizeUse(u={}) {
    return { ...blankUse(), ...u,
      id: u.id || uid('uso'),
      doseRule: { kind:'unset', unit:'', value:null, min:null, max:null, limitHa:null, ...(u.doseRule || {}) },
      volumeRule: { kind:'unset', value:null, min:null, max:null, ...(u.volumeRule || {}) }
    };
  }
  function normalizeProduct(p={}) {
    const product = {
      id: p.id || uid('prod'),
      name: p.name || 'Producto sin nombre',
      registration: p.registration || 'A verificar',
      activeIngredients: p.activeIngredients || 'A verificar',
      mix: p.mix || 'A verificar',
      status: p.status === 'verified' ? 'verified' : 'pending',
      archived: Boolean(p.archived),
      uses: Array.isArray(p.uses) && p.uses.length ? p.uses.map(normalizeUse) : [blankUse()],
      docs: Array.isArray(p.docs) ? p.docs : [],
      createdAt: p.createdAt || nowIso(),
      updatedAt: p.updatedAt || nowIso()
    };
    product.status = productIsVerified(product) ? 'verified' : 'pending';
    return product;
  }
  function normalizeApp(a={}) {
    return {
      id: a.id || uid('apl'),
      productId: a.productId || '',
      productNameSnapshot: a.productNameSnapshot || '',
      lot: a.lot || '',
      crop: a.crop || 'Vid de vinificación',
      target: a.target || '',
      doseApplied: a.doseApplied ?? '',
      doseUnit: a.doseUnit || '',
      lha: a.lha ?? '',
      observations: a.observations || '',
      incidence: a.incidence || '',
      createdAt: a.createdAt || nowIso(),
      updatedAt: a.updatedAt || nowIso()
    };
  }
  function normalizeIntervention(i={}) {
    return {
      id: i.id || uid('int'),
      date: i.date || todayIso(),
      applications: Array.isArray(i.applications) ? i.applications.map(normalizeApp) : [],
      createdAt: i.createdAt || nowIso(),
      updatedAt: i.updatedAt || nowIso()
    };
  }
  function normalizeDraft(d={}) {
    return {
      id: d.id || uid('draft'),
      title: d.title || `Borrador ${fmtDate(todayIso())}`,
      groups: Array.isArray(d.groups) ? d.groups.map(g => ({
        id: g.id || uid('grupo'),
        date: g.date || '',
        futureConfirmed: Boolean(g.futureConfirmed),
        applications: Array.isArray(g.applications) ? g.applications.map(normalizeApp) : []
      })) : [],
      currentGroupId: d.currentGroupId || '',
      createdAt: d.createdAt || nowIso(),
      updatedAt: d.updatedAt || nowIso()
    };
  }
  function migrate(data={}) {
    const base = blankState();
    return {
      ...base,
      ...data,
      version: VERSION,
      settings: { ...base.settings, ...(data.settings || {}) },
      products: Array.isArray(data.products) ? data.products.map(normalizeProduct) : [],
      interventions: Array.isArray(data.interventions) ? data.interventions.map(normalizeIntervention) : [],
      drafts: Array.isArray(data.drafts) ? data.drafts.map(normalizeDraft) : [],
      resolvedAlerts: Array.isArray(data.resolvedAlerts) ? data.resolvedAlerts : [],
      importHistory: Array.isArray(data.importHistory) ? data.importHistory : []
    };
  }
  function load() {
    try { return migrate(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || {}); }
    catch { return blankState(); }
  }
  let state = load();
  function save() { state.updatedAt = nowIso(); localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function mutate(fn, message='') { fn(state); save(); renderAll(); if (message) toast(message); }

  function toast(message, tone='info') {
    const id = uid('toast');
    refs.toast.insertAdjacentHTML('beforeend', `<div id="${id}" class="toast toast-${esc(tone)}">${esc(message)}</div>`);
    setTimeout(() => $(`#${id}`)?.remove(), 3600);
  }
  function badge(text, tone='neutral') { return `<span class="badge badge-${esc(tone)}">${esc(text)}</span>`; }
  function statusBadge(p) { return badge(p?.status === 'verified' ? 'Verificado' : 'A verificar', p?.status === 'verified' ? 'success' : 'warning'); }
  function modal(html, cls='') {
    refs.modal.innerHTML = `<div class="modal-backdrop" data-close-modal></div><section class="modal ${esc(cls)}" role="dialog" aria-modal="true">${html}</section>`;
    $$('[data-close-modal]', refs.modal).forEach(b => b.addEventListener('click', closeModal));
  }
  function closeModal(){ refs.modal.innerHTML=''; }
  function confirmBox(title, message, onConfirm, confirmText='Confirmar', danger=false) {
    modal(`<div class="modal-head"><h2>${esc(title)}</h2><button class="icon-button" data-close-modal type="button">×</button></div><p>${esc(message)}</p><div class="action-row"><button class="secondary-button" data-close-modal type="button">Cancelar</button><button id="modalConfirm" class="${danger?'danger-button':'primary-button'}" type="button">${esc(confirmText)}</button></div>`);
    $('#modalConfirm', refs.modal)?.addEventListener('click', () => { closeModal(); onConfirm?.(); });
  }
  function futureDoubleConfirm(iso, done) {
    confirmBox('Fecha futura detectada', `Has indicado ${fmtDate(iso)}. La app bloquea inicialmente fechas futuras.`, () => {
      confirmBox('Segunda verificación', `Confirma de forma expresa que deseas registrar ${fmtDate(iso)}.`, done, 'Confirmar fecha futura', true);
    }, 'Continuar');
  }

  function byName(name){ const n=norm(name); return state.products.find(p => norm(p.name)===n) || null; }
  function product(id){ return state.products.find(p => p.id===id) || null; }
  function draft(){ return state.drafts.find(d => d.id===ui.activeDraftId) || null; }
  function apps(){ return state.interventions.flatMap(i => i.applications.map(a => ({intervention:i, app:a}))); }
  function productUse(p,a){ return p?.uses.find(u => norm(u.crop)===norm(a.crop) && (!u.target || norm(u.target)===norm(a.target))) || p?.uses.find(u => norm(u.crop)===norm(a.crop)) || p?.uses[0] || null; }
  function prodCount(id){ return apps().filter(x => x.app.productId===id).length; }
  function interventionNumbers(){ const map=new Map(); [...state.interventions].sort((a,b)=>a.date.localeCompare(b.date)).forEach((i,n)=>map.set(i.id,n+1)); return map; }
  function productIsVerified(p) {
    const base = p?.name && p.registration && p.registration!=='A verificar' && p.activeIngredients && p.activeIngredients!=='A verificar' && p.mix && p.mix!=='A verificar';
    const use = p?.uses?.some(u => u.crop && u.target && u.ps && u.ps!=='A verificar' && u.doseDisplay && u.doseDisplay!=='A verificar' && u.doseRule?.kind!=='unset' && u.volumeDisplay && u.volumeDisplay!=='A verificar' && u.volumeRule?.kind!=='unset');
    return Boolean(base && use);
  }
  function searchMatch(...vals){ return !ui.search || norm(vals.filter(Boolean).join(' ')).includes(norm(ui.search)); }
  function dosePerHa(a){ const d=num(a.doseApplied), l=num(a.lha); if(d===null||l===null) return null; const u=norm(a.doseUnit); return u.includes('/hl') ? d*(l/100) : u.includes('/ha') ? d : null; }
  function validate(a, ctx={}) {
    const issues=[]; const p=product(a.productId); const u=productUse(p,a); const g=ctx.group;
    if(!p) issues.push({id:'p',severity:'blocking',text:'Debes seleccionar o crear un producto.'});
    if(!String(a.lot||'').trim()) issues.push({id:'lot',severity:'blocking',text:'El lote es obligatorio.'});
    if(!String(a.crop||'').trim()) issues.push({id:'crop',severity:'blocking',text:'El cultivo/uso es obligatorio.'});
    if(!String(a.target||'').trim()) issues.push({id:'target',severity:'blocking',text:'La plaga u objetivo es obligatorio.'});
    if(num(a.doseApplied)===null) issues.push({id:'dose',severity:'blocking',text:'La dosis aplicada debe ser numérica.'});
    if(!String(a.doseUnit||'').trim()) issues.push({id:'unit',severity:'blocking',text:'La unidad de dosis es obligatoria.'});
    if(num(a.lha)===null) issues.push({id:'lha',severity:'blocking',text:'Los litros/ha deben ser numéricos.'});
    if(g?.applications?.some(x => x.productId===a.productId && x.id!==a.id)) issues.push({id:'dup',severity:'blocking',text:'No se permite el mismo producto dos veces en la misma fecha.'});
    if(ctx.date && isFuture(ctx.date) && !ctx.futureConfirmed) issues.push({id:'future',severity:'blocking',text:'La fecha futura requiere doble verificación.'});
    if(p){
      if(p.status!=='verified') issues.push({id:'pending',severity:'warning',text:'La ficha del producto está A verificar.'});
      if(!u) issues.push({id:'use',severity:'warning',text:'La ficha técnica no tiene uso asociado.'});
      if(u){
        const d=num(a.doseApplied), l=num(a.lha), r=u.doseRule||{}, vr=u.volumeRule||{};
        if(r.kind!=='unset' && r.unit && norm(r.unit)!==norm(a.doseUnit)) issues.push({id:'unitMismatch',severity:'blocking',text:`La unidad aplicada no coincide con la regla técnica (${r.unit}).`});
        if(d!==null && r.kind==='single' && r.value!==null && d!==Number(r.value)) issues.push({id:'doseSingle',severity:'blocking',text:`La dosis debe ser ${r.value} ${r.unit}.`});
        if(d!==null && r.kind==='range'){
          if(r.min!==null && d<Number(r.min)) issues.push({id:'doseMin',severity:'blocking',text:`La dosis queda por debajo del mínimo: ${r.min} ${r.unit}.`});
          if(r.max!==null && d>Number(r.max)) issues.push({id:'doseMax',severity:'blocking',text:`La dosis supera el máximo: ${r.max} ${r.unit}.`});
        }
        if(r.limitHa!==null){ const ha=dosePerHa(a); if(ha!==null && ha>Number(r.limitHa)) issues.push({id:'limitHa',severity:'blocking',text:`La equivalencia por hectárea supera el límite ${r.limitHa}.`}); }
        if(l!==null && vr.kind==='single' && vr.value!==null && l!==Number(vr.value)) issues.push({id:'volSingle',severity:'blocking',text:`El volumen debe ser ${vr.value} L/ha.`});
        if(l!==null && vr.kind==='range'){
          if(vr.min!==null && l<Number(vr.min)) issues.push({id:'volMin',severity:'blocking',text:`El volumen queda por debajo de ${vr.min} L/ha.`});
          if(vr.max!==null && l>Number(vr.max)) issues.push({id:'volMax',severity:'blocking',text:`El volumen supera ${vr.max} L/ha.`});
        }
        const max=num(u.maxApplications);
        if(max!==null){
          const already=apps().filter(x=>x.app.productId===a.productId).length;
          const inDraft=g?.applications?.filter(x=>x.productId===a.productId && x.id!==a.id).length || 0;
          if(already+inDraft+1>max) issues.push({id:'maxApps',severity:'blocking',text:`Se supera el máximo de ${max} aplicaciones por campaña.`});
        }
      }
    }
    return issues;
  }
  function blockers(issues){ return issues.filter(i=>i.severity==='blocking'); }
  function alertList(){
    const out=[];
    state.products.filter(p=>!p.archived && p.status!=='verified').forEach(p=>out.push({id:`prod_${p.id}`,tone:'warning',title:`${p.name}: ficha A verificar`,detail:'Faltan datos técnicos obligatorios.',productId:p.id,resolvable:false}));
    apps().forEach(({intervention,app})=>{
      const p=product(app.productId);
      validate(app,{date:intervention.date,futureConfirmed:true}).filter(i=>i.id!=='future').forEach(i=>out.push({id:`val_${intervention.id}_${app.id}_${i.id}`,tone:i.severity==='blocking'?'danger':'warning',title:`${p?.name || app.productNameSnapshot || 'Aplicación'} · ${fmtDate(intervention.date)}`,detail:i.text,resolvable:false}));
      if(String(app.incidence||'').trim()){
        const id=`inc_${intervention.id}_${app.id}`;
        if(!state.resolvedAlerts.includes(id)) out.push({id,tone:'danger',title:`${p?.name || app.productNameSnapshot || 'Aplicación'} · incidencia`,detail:app.incidence,resolvable:true});
      }
    });
    return out.filter(a=>searchMatch(a.title,a.detail));
  }

  function openDb(){ return new Promise((res,rej)=>{ const r=indexedDB.open(DOC_DB,1); r.onupgradeneeded=()=>{ const db=r.result; if(!db.objectStoreNames.contains(DOC_STORE)) db.createObjectStore(DOC_STORE); }; r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
  async function putDoc(id, blob){ const db=await openDb(); return new Promise((res,rej)=>{ const tx=db.transaction(DOC_STORE,'readwrite'); tx.objectStore(DOC_STORE).put(blob,id); tx.oncomplete=()=>{db.close();res();}; tx.onerror=()=>{db.close();rej(tx.error);}; }); }
  async function getDoc(id){ const db=await openDb(); return new Promise((res,rej)=>{ const tx=db.transaction(DOC_STORE,'readonly'); const r=tx.objectStore(DOC_STORE).get(id); r.onsuccess=()=>{db.close();res(r.result||null);}; r.onerror=()=>{db.close();rej(r.error);}; }); }
  async function delDoc(id){ const db=await openDb(); return new Promise((res,rej)=>{ const tx=db.transaction(DOC_STORE,'readwrite'); tx.objectStore(DOC_STORE).delete(id); tx.oncomplete=()=>{db.close();res();}; tx.onerror=()=>{db.close();rej(tx.error);}; }); }

  function renderAll(){ syncView(); renderInicio(); renderNuevo(); renderCuaderno(); renderAlertas(); renderMas(); }
  function syncView(){ refs.nav.forEach(b=>b.classList.toggle('active',b.dataset.nav===ui.view)); Object.entries(refs.views).forEach(([k,v])=>v.classList.toggle('active',k===ui.view)); }
  function setView(v){ ui.view=v; renderAll(); window.scrollTo({top:0,behavior:'smooth'}); }
  function linkViews(root){ $$('[data-open-view]',root).forEach(b=>b.addEventListener('click',()=>setView(b.dataset.openView))); }

  function renderInicio(){
    const last=[...state.interventions].sort((a,b)=>b.date.localeCompare(a.date))[0];
    const alerts=alertList();
    refs.views.inicio.innerHTML=`
      <div class="stack">
        <section class="summary-grid">
          <article class="summary-tile"><span>Fechas registradas</span><strong>${state.interventions.length}</strong></article>
          <article class="summary-tile"><span>Aplicaciones</span><strong>${apps().length}</strong></article>
          <article class="summary-tile"><span>Productos verificados</span><strong>${state.products.filter(p=>p.status==='verified'&&!p.archived).length}</strong></article>
          <article class="summary-tile"><span>Alertas activas</span><strong>${alerts.length}</strong></article>
        </section>
        <section class="card">
          <div class="section-heading"><div><h2>Resumen de campaña</h2><p class="muted">App neutra: sin tratamientos reales incrustados.</p></div></div>
          <div class="info-grid"><div class="soft-box"><span class="meta">Última fecha</span><strong>${last?fmtDate(last.date):'Sin registros'}</strong></div><div class="soft-box"><span class="meta">Borradores</span><strong>${state.drafts.length}</strong></div></div>
          <div class="action-row top-gap"><button class="primary-button" data-open-view="nuevo" type="button">Nuevo tratamiento</button><button class="secondary-button" data-open-view="cuaderno" type="button">Ver cuaderno</button></div>
        </section>
        ${renderDraftPreview()}
        ${renderAlertsPreview(alerts)}
      </div>`;
    linkViews(refs.views.inicio);
    bindAlertCards(refs.views.inicio);
    $$('[data-resume-draft]',refs.views.inicio).forEach(b=>b.addEventListener('click',()=>{ui.activeDraftId=b.dataset.resumeDraft; setView('nuevo');}));
    $$('[data-discard-draft]',refs.views.inicio).forEach(b=>b.addEventListener('click',()=>discardDraft(b.dataset.discardDraft)));
  }
  function renderDraftPreview(){
    if(!state.drafts.length) return `<section class="card"><h2>Continuidad</h2><p class="muted">No hay borradores pendientes.</p></section>`;
    return `<section class="card"><div class="section-heading"><div><h2>Continuidad con borradores</h2><p class="muted">Retoma entradas autoguardadas.</p></div></div><div class="stack">${state.drafts.slice(0,2).map(d=>`<article class="draft-card"><div class="section-heading"><div><h3>${esc(d.title)}</h3><p class="muted">${d.groups.length} fecha(s) · ${draftAppCount(d)} producto(s)</p></div>${badge('Borrador','info')}</div><div class="action-row"><button class="primary-button" data-resume-draft="${d.id}" type="button">Retomar</button><button class="danger-outline-button" data-discard-draft="${d.id}" type="button">Descartar</button></div></article>`).join('')}</div></section>`;
  }
  function renderAlertsPreview(alerts){
    if(!alerts.length) return `<section class="card"><h2>Alertas</h2><p class="muted">No hay alertas activas.</p></section>`;
    return `<section class="card"><div class="section-heading"><div><h2>Alertas prioritarias</h2><p class="muted">Las alertas técnicas no se resuelven si la causa persiste.</p></div><button class="text-button" data-open-view="alertas" type="button">Ver todas</button></div><div class="stack">${alerts.slice(0,3).map(renderAlertCard).join('')}</div></section>`;
  }

  function renderNuevo(){
    const d=draft();
    refs.views.nuevo.innerHTML=`<div class="stack"><section class="card"><div class="section-heading"><div><h2>Nuevo tratamiento</h2><p class="muted">Proceso guiado, secuencial y con autoguardado silencioso.</p></div>${d?badge('Borrador activo','info'):badge('Entrada nueva','success')}</div>${d?renderDraftEditor(d):renderDraftStart()}</section>${renderDraftList()}</div>`;
    bindNuevo();
  }
  function renderDraftStart(){ return `<form id="startDraft" class="stack"><div class="form-grid"><label class="field"><span>Fecha con calendario</span><input class="field-input" name="calendar" type="date" value="${todayIso()}" /></label><label class="field"><span>O escritura manual dd/mm/aaaa</span><input class="field-input" name="manual" type="text" placeholder="${fmtDate(todayIso())}" inputmode="numeric" /></label></div><p class="helper">La fecha futura queda bloqueada inicialmente y exige doble verificación.</p><div class="action-row"><button class="primary-button" type="submit">Comenzar registro</button></div></form>`; }
  function renderDraftEditor(d){
    const g=d.groups.find(x=>x.id===d.currentGroupId)||d.groups[d.groups.length-1];
    if(!g) return renderDraftStart();
    return `<div class="stack"><div class="soft-box"><span class="meta">Fecha activa</span><strong>${fmtDate(g.date)}</strong><p class="muted">Productos en esta fecha: ${g.applications.length}</p></div>${renderDraftApps(g)}${renderAppForm(g)}<div class="action-row divided-actions"><button class="secondary-button" data-add-date type="button">Añadir otra fecha</button><button class="primary-button" data-finalize-draft type="button">Finalizar y registrar</button></div><div class="action-row"><button class="text-button" data-save-draft type="button">Cerrar y dejar en borradores</button><button class="danger-outline-button" data-discard-draft="${d.id}" type="button">Descartar borrador</button></div></div>`;
  }
  function renderDraftApps(g){
    if(!g.applications.length) return `<div class="empty-state">Aún no hay productos añadidos para ${fmtDate(g.date)}.</div>`;
    return `<div class="stack compact-stack">${g.applications.map(a=>{const p=product(a.productId); const issues=validate(a,{group:g,date:g.date,futureConfirmed:g.futureConfirmed}); return `<article class="record-card"><div class="section-heading"><div><h3>${esc(p?.name||a.productNameSnapshot||'Producto')}</h3><p class="muted">Lote ${esc(a.lot||'—')} · ${esc(a.crop||'—')} · ${esc(a.target||'—')}</p></div>${statusBadge(p)}</div><div class="metric-grid"><div class="mini-metric"><span>Dosis</span><strong>${esc(a.doseApplied||'—')} ${esc(a.doseUnit||'')}</strong></div><div class="mini-metric"><span>L/ha</span><strong>${esc(a.lha||'—')}</strong></div></div>${issues.length?`<div class="warning-box">${issues.map(i=>`<p>${esc(i.text)}</p>`).join('')}</div>`:''}<div class="action-row"><button class="text-button" data-remove-draft-app="${a.id}" type="button">Quitar</button></div></article>`;}).join('')}</div>`;
  }
  function renderAppForm(g){
    const productOptions=[...new Map([...recentProducts(),...state.products.filter(p=>!p.archived)].map(p=>[p.id,p])).values()];
    return `<form id="draftAppForm" class="panel nested-panel stack"><div class="section-heading"><div><h3>Añadir producto a ${fmtDate(g.date)}</h3><p class="muted">Productos recientes primero; también admite alta provisional.</p></div></div><label class="field"><span>Producto</span><input class="field-input" id="draftProductName" name="productName" list="prodlist" placeholder="Buscar o escribir nombre comercial" autocomplete="off" required /><datalist id="prodlist">${productOptions.map(p=>`<option value="${esc(p.name)}"></option>`).join('')}</datalist></label><div id="selectedProductStatus" class="helper">Al seleccionar un producto se muestran sus opciones técnicas.</div><div class="form-grid"><label class="field"><span>Lote</span><input class="field-input" name="lot" required /></label><label class="field"><span>Cultivo / uso</span><select class="field-select" id="draftCrop" name="crop"><option value="${esc(state.settings.defaultCrop)}">${esc(state.settings.defaultCrop)}</option></select></label></div><div class="form-grid"><label class="field"><span>Plaga / objetivo</span><select class="field-select" id="draftTarget" name="target"><option value="">Selecciona producto</option></select></label><label class="field"><span>Dosis aplicada</span><input class="field-input" name="doseApplied" type="number" step="0.001" min="0" required /></label></div><div class="form-grid"><label class="field"><span>Unidad dosis</span><select class="field-select" id="draftDoseUnit" name="doseUnit"><option value="">Selecciona producto</option>${units.map(u=>`<option value="${u}">${u}</option>`).join('')}</select></label><label class="field"><span>Litros/ha aplicados</span><input class="field-input" name="lha" type="number" step="0.001" min="0" value="${esc(state.settings.defaultLha)}" required /></label></div><label class="field"><span>Observaciones opcionales</span><textarea class="field-textarea" name="observations"></textarea></label><label class="field"><span>Incidencia opcional</span><textarea class="field-textarea" name="incidence"></textarea></label><div id="technicalHint" class="info-box">Selecciona un producto para ver dosis, volumen, P.S. y máximo de campaña.</div><div id="appValidation"></div><div class="action-row"><button class="primary-button" type="submit">Añadir producto</button></div></form>`;
  }
  function renderDraftList(){
    if(!state.drafts.length) return '';
    return `<section class="card"><div class="section-heading"><div><h2>Borradores guardados</h2><p class="muted">Múltiples borradores disponibles.</p></div></div><div class="stack">${state.drafts.map(d=>`<article class="draft-card ${d.id===ui.activeDraftId?'selected-card':''}"><div class="section-heading"><div><h3>${esc(d.title)}</h3><p class="muted">${d.groups.length} fecha(s) · ${draftAppCount(d)} aplicación(es)</p></div>${d.id===ui.activeDraftId?badge('Activo','success'):badge('Guardado','info')}</div><div class="action-row"><button class="secondary-button" data-resume-draft="${d.id}" type="button">Retomar</button><button class="danger-outline-button" data-discard-draft="${d.id}" type="button">Descartar</button></div></article>`).join('')}</div></section>`;
  }
  function draftAppCount(d){ return d.groups.reduce((s,g)=>s+g.applications.length,0); }
  function recentProducts(){ const ids=[]; [...apps()].reverse().forEach(x=>{if(x.app.productId&&!ids.includes(x.app.productId)) ids.push(x.app.productId);}); return ids.map(product).filter(Boolean); }

  function bindNuevo(){
    $('#startDraft',refs.views.nuevo)?.addEventListener('submit',e=>{e.preventDefault(); const f=new FormData(e.currentTarget); const iso=parseManualDate(f.get('manual')) || String(f.get('calendar')||''); if(!dateObj(iso)) return toast('La fecha no es válida.','danger'); const done=()=>createDraft(iso,isFuture(iso)); isFuture(iso)?futureDoubleConfirm(iso,done):done();});
    $('#draftProductName',refs.views.nuevo)?.addEventListener('input',assistProduct);
    $('#draftProductName',refs.views.nuevo)?.addEventListener('change',assistProduct);
    $('#draftCrop',refs.views.nuevo)?.addEventListener('change',updateTargetOptions);
    $('#draftAppForm',refs.views.nuevo)?.addEventListener('submit',e=>{e.preventDefault(); addDraftApp(e.currentTarget);});
    $$('[data-remove-draft-app]',refs.views.nuevo).forEach(b=>b.addEventListener('click',()=>removeDraftApp(b.dataset.removeDraftApp)));
    $('[data-add-date]',refs.views.nuevo)?.addEventListener('click',addAnotherDate);
    $('[data-finalize-draft]',refs.views.nuevo)?.addEventListener('click',finalizeDraft);
    $('[data-save-draft]',refs.views.nuevo)?.addEventListener('click',()=>{ui.activeDraftId=null; save(); renderAll(); toast('Borrador guardado.');});
    $$('[data-resume-draft]',refs.views.nuevo).forEach(b=>b.addEventListener('click',()=>{ui.activeDraftId=b.dataset.resumeDraft; renderAll();}));
    $$('[data-discard-draft]',refs.views.nuevo).forEach(b=>b.addEventListener('click',()=>discardDraft(b.dataset.discardDraft)));
    assistProduct();
  }
  function createDraft(iso,futureConfirmed){ const d={id:uid('draft'),title:`Borrador ${fmtDate(iso)}`,groups:[{id:uid('grupo'),date:iso,futureConfirmed,applications:[]}],currentGroupId:'',createdAt:nowIso(),updatedAt:nowIso()}; d.currentGroupId=d.groups[0].id; mutate(s=>{s.drafts.unshift(d); ui.activeDraftId=d.id;},'Registro iniciado.'); }
  function assistProduct(){ const input=$('#draftProductName',refs.views.nuevo), status=$('#selectedProductStatus',refs.views.nuevo), crop=$('#draftCrop',refs.views.nuevo), target=$('#draftTarget',refs.views.nuevo), unit=$('#draftDoseUnit',refs.views.nuevo), hint=$('#technicalHint',refs.views.nuevo); if(!input||!status||!crop||!target||!unit||!hint) return; const p=byName(input.value); if(!p){ status.innerHTML=`${badge('Alta provisional','warning')} Se creará ficha A verificar al añadir.`; crop.innerHTML=`<option value="${esc(state.settings.defaultCrop)}">${esc(state.settings.defaultCrop)}</option>`; target.innerHTML='<option value="">Escribe el objetivo tras crear la ficha</option>'; hint.textContent='Producto provisional: validación técnica completa pendiente.'; return; } status.innerHTML=`${statusBadge(p)} ${esc(p.registration)}`; const crops=[...new Set(p.uses.map(u=>u.crop).filter(Boolean))]; crop.innerHTML=(crops.length?crops:[state.settings.defaultCrop]).map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join(''); updateTargetOptions(); const u=p.uses[0]; if(u?.doseRule?.unit) unit.value=u.doseRule.unit; hint.innerHTML=techHint(u); }
  function updateTargetOptions(){ const p=byName($('#draftProductName',refs.views.nuevo)?.value); const crop=$('#draftCrop',refs.views.nuevo), target=$('#draftTarget',refs.views.nuevo), unit=$('#draftDoseUnit',refs.views.nuevo), hint=$('#technicalHint',refs.views.nuevo); if(!p||!crop||!target) return; const uses=p.uses.filter(u=>norm(u.crop)===norm(crop.value)); const list=uses.length?uses:p.uses; target.innerHTML=list.map(u=>`<option value="${esc(u.target||'')}">${esc(u.target||'A verificar')}</option>`).join(''); const u=list[0]||p.uses[0]; if(unit&&u?.doseRule?.unit) unit.value=u.doseRule.unit; if(hint) hint.innerHTML=techHint(u); }
  function techHint(u){ return !u?'Ficha técnica no disponible.':`<strong>Dosis:</strong> ${esc(u.doseDisplay)} · <strong>Volumen:</strong> ${esc(u.volumeDisplay)} · <strong>P.S.:</strong> ${esc(u.ps)} · <strong>Máx. campaña:</strong> ${esc(u.maxApplications??'A verificar')}`; }
  function addDraftApp(form){ const d=draft(); const g=d?.groups.find(x=>x.id===d.currentGroupId); if(!d||!g) return; const fd=new FormData(form); const name=String(fd.get('productName')||'').trim(); if(!name) return toast('Indica un producto.','danger'); let p=byName(name); if(!p) p=normalizeProduct({id:uid('prod'),name,uses:[blankUse()]}); const a=normalizeApp({productId:p.id,productNameSnapshot:p.name,lot:fd.get('lot'),crop:fd.get('crop'),target:fd.get('target'),doseApplied:fd.get('doseApplied'),doseUnit:fd.get('doseUnit'),lha:fd.get('lha'),observations:fd.get('observations'),incidence:fd.get('incidence')}); const issues=validate(a,{group:g,date:g.date,futureConfirmed:g.futureConfirmed}); const bad=blockers(issues); if(bad.length){ $('#appValidation',refs.views.nuevo).innerHTML=`<div class="danger-box">${bad.map(i=>`<p>${esc(i.text)}</p>`).join('')}</div>`; return toast('No se puede añadir: corrige los datos marcados.','danger'); } mutate(s=>{if(!product(p.id)) s.products.push(p); const dd=s.drafts.find(x=>x.id===d.id); const gg=dd.groups.find(x=>x.id===g.id); gg.applications.push(a); dd.updatedAt=nowIso();},issues.length?'Producto añadido con avisos pendientes.':'Producto añadido.'); }
  function removeDraftApp(id){ const d=draft(); if(!d) return; mutate(s=>{const dd=s.drafts.find(x=>x.id===d.id); dd.groups.forEach(g=>g.applications=g.applications.filter(a=>a.id!==id)); dd.updatedAt=nowIso();},'Producto retirado del borrador.'); }
  function addAnotherDate(){ const d=draft(); if(!d) return; modal(`<div class="modal-head"><h2>Añadir otra fecha</h2><button class="icon-button" data-close-modal type="button">×</button></div><form id="addDateForm" class="stack"><label class="field"><span>Fecha con calendario</span><input class="field-input" name="calendar" type="date" value="${todayIso()}" /></label><label class="field"><span>O escritura manual dd/mm/aaaa</span><input class="field-input" name="manual" type="text" placeholder="${fmtDate(todayIso())}" /></label><div class="action-row"><button class="secondary-button" data-close-modal type="button">Cancelar</button><button class="primary-button" type="submit">Añadir fecha</button></div></form>`); $('#addDateForm',refs.modal)?.addEventListener('submit',e=>{e.preventDefault(); const fd=new FormData(e.currentTarget); const iso=parseManualDate(fd.get('manual'))||String(fd.get('calendar')||''); if(!dateObj(iso)) return toast('La fecha no es válida.','danger'); const done=()=>{closeModal(); mutate(s=>{const dd=s.drafts.find(x=>x.id===d.id); const existing=dd.groups.find(g=>g.date===iso); if(existing) dd.currentGroupId=existing.id; else {const g={id:uid('grupo'),date:iso,futureConfirmed:isFuture(iso),applications:[]}; dd.groups.push(g); dd.currentGroupId=g.id;} dd.updatedAt=nowIso();},'Fecha añadida al borrador.');}; isFuture(iso)?(closeModal(),futureDoubleConfirm(iso,done)):done(); }); }
  function discardDraft(id){ confirmBox('Descartar borrador','Esta acción elimina el borrador. Requiere confirmación expresa.',()=>confirmBox('Segunda confirmación','Confirma que deseas borrar definitivamente este borrador.',()=>mutate(s=>{s.drafts=s.drafts.filter(d=>d.id!==id); if(ui.activeDraftId===id) ui.activeDraftId=null;},'Borrador descartado.'),'Descartar definitivamente',true),'Continuar',true); }
  function finalizeDraft(){ const d=draft(); if(!d||!draftAppCount(d)) return toast('No hay aplicaciones para registrar.','danger'); const bad=[]; d.groups.forEach(g=>g.applications.forEach(a=>blockers(validate(a,{group:g,date:g.date,futureConfirmed:g.futureConfirmed})).forEach(i=>bad.push(`${fmtDate(g.date)} · ${i.text}`)))); if(bad.length) return confirmBox('Registro bloqueado',bad.slice(0,5).join(' | '),()=>{},'Entendido',true); const solo=d.groups.filter(g=>g.applications.length>1 && g.applications.some(a=>product(a.productId)?.mix==='SOLO')); if(solo.length) return confirmBox('Producto marcado SOLO',`En ${solo.map(g=>fmtDate(g.date)).join(', ')} hay un producto SOLO junto con otros. Confirma que se aplicaron en cubas distintas.`,()=>commitDraft(d),'Confirmar cubas distintas',true); commitDraft(d); }
  function commitDraft(d){ mutate(s=>{d.groups.forEach(g=>{let i=s.interventions.find(x=>x.date===g.date); if(!i){i=normalizeIntervention({date:g.date}); s.interventions.push(i);} g.applications.forEach(a=>{if(!i.applications.some(x=>x.productId===a.productId)) i.applications.push(normalizeApp(a));}); i.updatedAt=nowIso();}); s.interventions.sort((a,b)=>a.date.localeCompare(b.date)); s.drafts=s.drafts.filter(x=>x.id!==d.id); ui.activeDraftId=null;},'Tratamientos registrados en el cuaderno.'); setView('cuaderno'); }

  const headers=['N.º','Fecha','Nombre del producto','N.º de registro','Lote','Dosis recomendada','Dosis aplicada','Volumen caldo','Litros/ha aplicados','Cultivo','Plaga / patógeno','P.S.','Tratamientos campaña','Principios activos','MEZCLA'];
  function officialRows(list=state.interventions){ const nums=interventionNumbers(); const rows=[]; [...list].sort((a,b)=>a.date.localeCompare(b.date)).forEach(i=>i.applications.forEach(a=>{const p=product(a.productId), u=productUse(p,a); rows.push([nums.get(i.id),fmtDate(i.date),p?.name||a.productNameSnapshot||'—',p?.registration||'A verificar',a.lot||'—',u?.doseDisplay||'A verificar',`${a.doseApplied||'—'} ${a.doseUnit||''}`.trim(),u?.volumeDisplay||'A verificar',`${a.lha||'—'} L/ha`,a.crop||'—',a.target||'—',u?.ps||'A verificar',u?.maxApplications??'A verificar',p?.activeIngredients||'A verificar',p?.mix||'A verificar']);})); return rows; }
  function filteredInterventions(){ return state.interventions.map(i=>({...i,applications:i.applications.filter(a=>searchMatch(i.date,fmtDate(i.date),product(a.productId)?.name,a.productNameSnapshot,a.lot,a.crop,a.target,a.observations,a.incidence))})).filter(i=>i.applications.length).sort((a,b)=>a.date.localeCompare(b.date)); }
  function renderCuaderno(){
    const list=filteredInterventions();
    refs.views.cuaderno.innerHTML=`<div class="stack"><section class="card"><div class="section-heading"><div><h2>Cuaderno</h2><p class="muted">N.º agrupado por fecha/intervención; orden cronológico automático.</p></div></div><div class="segmented-control"><button data-mode="cards" class="${ui.cuadernoMode==='cards'?'active':''}" type="button">Trabajo</button><button data-mode="table" class="${ui.cuadernoMode==='table'?'active':''}" type="button">15 columnas</button><button data-mode="pdf" class="${ui.cuadernoMode==='pdf'?'active':''}" type="button">Vista PDF</button></div><div class="action-row top-gap"><button class="secondary-button" data-export="csv" type="button">CSV</button><button class="secondary-button" data-export="excel" type="button">Excel</button><button class="secondary-button" data-export="pdf-official" type="button">PDF oficial</button><button class="secondary-button" data-export="pdf-compact" type="button">PDF compacto</button></div></section>${list.length?renderCuadernoMode(list):'<section class="card empty-state">No hay registros que mostrar.</section>'}</div>`;
    $$('[data-mode]',refs.views.cuaderno).forEach(b=>b.addEventListener('click',()=>{ui.cuadernoMode=b.dataset.mode; renderCuaderno();}));
    $$('[data-export]',refs.views.cuaderno).forEach(b=>b.addEventListener('click',()=>exportNotebook(b.dataset.export)));
    $$('[data-edit-intervention]',refs.views.cuaderno).forEach(b=>b.addEventListener('click',()=>openInterventionEditor(b.dataset.editIntervention)));
  }
  function renderCuadernoMode(list){ return ui.cuadernoMode==='table'?renderTable(list):ui.cuadernoMode==='pdf'?renderPdfPreview(list):renderCards(list); }
  function renderCards(list){ const nums=interventionNumbers(); return list.map(i=>`<section class="card"><div class="section-heading"><div><h2>N.º ${nums.get(i.id)} · ${fmtDate(i.date)}</h2><p class="muted">${i.applications.length} aplicación(es)</p></div><button class="text-button" data-edit-intervention="${i.id}" type="button">Editar</button></div><div class="stack">${i.applications.map(a=>renderSavedApp(i,a)).join('')}</div></section>`).join(''); }
  function renderSavedApp(i,a){ const p=product(a.productId), u=productUse(p,a), issues=validate(a,{date:i.date,futureConfirmed:true}); return `<article class="record-card ${issues.length?'has-alert':''}"><div class="section-heading"><div><h3>${esc(p?.name||a.productNameSnapshot||'Producto')}</h3><p class="muted">Lote ${esc(a.lot||'—')} · ${esc(a.crop||'—')} · ${esc(a.target||'—')}</p></div>${statusBadge(p)}</div><div class="info-grid"><div class="mini-metric"><span>Dosis recomendada</span><strong>${esc(u?.doseDisplay||'A verificar')}</strong></div><div class="mini-metric"><span>Dosis aplicada</span><strong>${esc(a.doseApplied||'—')} ${esc(a.doseUnit||'')}</strong></div><div class="mini-metric"><span>Volumen caldo</span><strong>${esc(u?.volumeDisplay||'A verificar')}</strong></div><div class="mini-metric"><span>L/ha aplicados</span><strong>${esc(a.lha||'—')}</strong></div></div><div class="meta-row top-gap">${badge(`P.S.: ${u?.ps||'A verificar'}`,u?.ps&&u.ps!=='A verificar'?'info':'warning')}${badge(`MEZCLA: ${p?.mix||'A verificar'}`,p?.mix==='SOLO'?'danger':'neutral')}</div>${a.incidence?`<div class="danger-box top-gap"><strong>Incidencia:</strong> ${esc(a.incidence)}</div>`:''}${issues.length?`<div class="warning-box top-gap">${issues.map(x=>`<p>${esc(x.text)}</p>`).join('')}</div>`:''}${a.observations?`<p class="small-note top-gap"><strong>Observaciones:</strong> ${esc(a.observations)}</p>`:''}</article>`; }
  function renderTable(list){ const rows=officialRows(list); return `<section class="card"><div class="table-scroll"><table class="official-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`; }
  function renderPdfPreview(list){ const rows=officialRows(list); return `<section class="document-card pdf-preview"><div class="pdf-sheet"><h2>Cuaderno de tratamientos · Campaña 2026</h2><p>Vista previa documental completa de 15 columnas.</p><div class="table-scroll"><table class="official-table pdf-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div></section>`; }
  function openInterventionEditor(id){ const i=state.interventions.find(x=>x.id===id); if(!i) return; modal(`<div class="modal-head"><h2>Editar intervención ${fmtDate(i.date)}</h2><button class="icon-button" data-close-modal type="button">×</button></div><div class="stack">${i.applications.map(a=>{const p=product(a.productId); return `<form class="panel nested-panel stack edit-saved-app" data-app="${a.id}"><h3>${esc(p?.name||a.productNameSnapshot||'Producto')}</h3><div class="form-grid"><label class="field"><span>Lote</span><input class="field-input" name="lot" value="${esc(a.lot)}" required /></label><label class="field"><span>Litros/ha</span><input class="field-input" name="lha" type="number" step="0.001" value="${esc(a.lha)}" required /></label></div><div class="form-grid"><label class="field"><span>Dosis aplicada</span><input class="field-input" name="doseApplied" type="number" step="0.001" value="${esc(a.doseApplied)}" required /></label><label class="field"><span>Unidad</span><select class="field-select" name="doseUnit">${units.map(u=>`<option value="${u}" ${u===a.doseUnit?'selected':''}>${u}</option>`).join('')}</select></label></div><label class="field"><span>Observaciones</span><textarea class="field-textarea" name="observations">${esc(a.observations)}</textarea></label><label class="field"><span>Incidencia</span><textarea class="field-textarea" name="incidence">${esc(a.incidence)}</textarea></label><div class="action-row"><button class="primary-button" type="submit">Guardar cambios</button><button class="danger-outline-button" data-delete-saved-app="${a.id}" type="button">Eliminar</button></div></form>`;}).join('')}</div>`,'wide-modal'); $$('.edit-saved-app',refs.modal).forEach(f=>f.addEventListener('submit',e=>{e.preventDefault(); updateSavedApp(id,f.dataset.app,new FormData(f));})); $$('[data-delete-saved-app]',refs.modal).forEach(b=>b.addEventListener('click',()=>confirmBox('Eliminar aplicación','Se retirará esta aplicación del cuaderno.',()=>{closeModal(); mutate(s=>{const ii=s.interventions.find(x=>x.id===id); ii.applications=ii.applications.filter(a=>a.id!==b.dataset.deleteSavedApp); if(!ii.applications.length) s.interventions=s.interventions.filter(x=>x.id!==id);},'Aplicación eliminada.');},'Eliminar',true))); }
  function updateSavedApp(interventionId,appId,fd){ const i=state.interventions.find(x=>x.id===interventionId), old=i?.applications.find(a=>a.id===appId); if(!i||!old) return; const candidate=normalizeApp({...old,lot:fd.get('lot'),lha:fd.get('lha'),doseApplied:fd.get('doseApplied'),doseUnit:fd.get('doseUnit'),observations:fd.get('observations'),incidence:fd.get('incidence'),updatedAt:nowIso()}); const bad=blockers(validate(candidate,{date:i.date,futureConfirmed:true})); if(bad.length) return toast(bad[0].text,'danger'); mutate(s=>{const ii=s.interventions.find(x=>x.id===interventionId); const n=ii.applications.findIndex(a=>a.id===appId); ii.applications[n]=candidate; ii.updatedAt=nowIso();},'Cambios guardados.'); closeModal(); }

  function exportNotebook(type){ const rows=officialRows(); if(!rows.length) return toast('No hay datos para exportar.','danger'); if(type==='csv'){ const csv=[headers,...rows].map(r=>r.map(csvCell).join(';')).join('\n'); return download(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),'cuaderno_tratamientos_v2_0.csv'); } if(type==='excel'){ const x=excelXml(headers,rows); return download(new Blob([x],{type:'application/vnd.ms-excel'}),'cuaderno_tratamientos_v2_0.xls'); } const compact=type==='pdf-compact'; const pdf=simplePdf(compact?'Cuaderno de tratamientos · compacto':'Cuaderno de tratamientos · oficial',pdfLines(rows,compact)); return download(new Blob([pdf],{type:'application/pdf'}),compact?'cuaderno_tratamientos_compacto_v2_0.pdf':'cuaderno_tratamientos_oficial_v2_0.pdf'); }
  function csvCell(v){ return `"${String(v??'').replaceAll('"','""')}"`; }
  function xml(v){ return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;'); }
  function excelXml(h,r){ const cell=v=>`<Cell><Data ss:Type="String">${xml(v)}</Data></Cell>`; return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Cuaderno V2.0"><Table><Row>${h.map(cell).join('')}</Row>${r.map(row=>`<Row>${row.map(cell).join('')}</Row>`).join('')}</Table></Worksheet></Workbook>`; }
  function pdfLines(rows,compact){ if(compact) return rows.map(r=>`${r[1]} | ${r[2]} | Lote ${r[4]} | ${r[6]} | ${r[8]} | ${r[10]}`); const out=[]; rows.forEach(r=>{out.push(`N.º ${r[0]} · ${r[1]} · ${r[2]}`); out.push(`Registro: ${r[3]} | Lote: ${r[4]} | Cultivo: ${r[9]} | Objetivo: ${r[10]}`); out.push(`Dosis recomendada: ${r[5]} | Aplicada: ${r[6]} | Volumen: ${r[7]} | L/ha: ${r[8]}`); out.push(`P.S.: ${r[11]} | Tratamientos campaña: ${r[12]} | Principios: ${r[13]} | Mezcla: ${r[14]}`); out.push(' ');}); return out; }
  function simplePdf(title,lines){ const safe=t=>String(t??'').replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)').replace(/[^\x20-\x7EáéíóúÁÉÍÓÚñÑüÜºª·|/.,:;_+\-= ]/g,' '); const wrapped=[]; [title,'',...lines].forEach(line=>{const s=safe(line); for(let i=0;i<s.length||i===0;i+=92) wrapped.push(s.slice(i,i+92));}); const pages=[]; for(let i=0;i<wrapped.length;i+=48) pages.push(wrapped.slice(i,i+48)); const objs=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [] /Count 0 >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']; const refs=[]; pages.forEach(page=>{const pageNo=objs.length+1, contentNo=pageNo+1; refs.push(`${pageNo} 0 R`); objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNo} 0 R >>`); let y=560; const cmds=['BT','/F1 9 Tf']; page.forEach((line,idx)=>{if(idx===0&&line===title)cmds.push('/F1 14 Tf'); cmds.push(`1 0 0 1 36 ${y} Tm (${safe(line)}) Tj`); if(idx===0&&line===title)cmds.push('/F1 9 Tf'); y-=10.5;}); cmds.push('ET'); const stream=cmds.join('\n'); objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);}); objs[1]=`<< /Type /Pages /Kids [${refs.join(' ')}] /Count ${pages.length} >>`; let pdf='%PDF-1.4\n'; const offsets=[0]; objs.forEach((o,i)=>{offsets.push(pdf.length); pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;}); const x=pdf.length; pdf+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`; offsets.slice(1).forEach(off=>pdf+=`${String(off).padStart(10,'0')} 00000 n \n`); pdf+=`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`; return pdf; }
  function download(blob,name){ const url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1200); }

  function renderAlertas(){ const alerts=alertList(); refs.views.alertas.innerHTML=`<div class="stack"><section class="card"><div class="section-heading"><div><h2>Alertas</h2><p class="muted">A verificar, incidencias abiertas, máximos y revisión documental pendiente.</p></div>${badge(`${alerts.length} activas`,alerts.length?'danger':'success')}</div></section>${alerts.length?`<section class="stack">${alerts.map(renderAlertCard).join('')}</section>`:'<section class="card empty-state">No hay alertas activas.</section>'}</div>`; bindAlertCards(refs.views.alertas); }
  function renderAlertCard(a){ return `<article class="alert-card alert-${esc(a.tone)}"><div class="section-heading"><div><h3>${esc(a.title)}</h3><p class="muted">${esc(a.detail)}</p></div>${badge(a.tone==='danger'?'Alerta':'Revisar',a.tone)}</div><div class="action-row">${a.productId?`<button class="secondary-button" data-edit-product="${a.productId}" type="button">Ver ficha</button>`:''}${a.resolvable?`<button class="primary-button" data-resolve-alert="${a.id}" type="button">Marcar resuelta</button>`:'<button class="ghost-button" type="button" disabled>No resoluble mientras persista la causa</button>'}</div></article>`; }
  function bindAlertCards(root){ $$('[data-edit-product]',root).forEach(b=>b.addEventListener('click',()=>openProductEditor(b.dataset.editProduct,'ficha'))); $$('[data-resolve-alert]',root).forEach(b=>b.addEventListener('click',()=>mutate(s=>{if(!s.resolvedAlerts.includes(b.dataset.resolveAlert))s.resolvedAlerts.push(b.dataset.resolveAlert);},'Incidencia marcada como resuelta.'))); }

  function renderMas(){ const products=state.products.filter(p=>!p.archived && searchMatch(p.name,p.registration,p.activeIngredients,p.mix,p.uses.map(u=>`${u.crop} ${u.target} ${u.ps}`).join(' '))); refs.views.mas.innerHTML=`<div class="stack"><section class="card"><div class="section-heading"><div><h2>Más</h2><p class="muted">Catálogo, borradores, copias e importación, ajustes.</p></div></div></section><section class="card"><div class="section-heading"><div><h2>Catálogo de productos</h2><p class="muted">${products.length} ficha(s) visibles.</p></div><button class="primary-button" id="newProduct" type="button">Nuevo producto</button></div><div class="stack">${products.length?products.map(renderProductCard).join(''):'<div class="empty-state">Aún no hay productos en el catálogo.</div>'}</div></section><section class="card"><div class="section-heading"><div><h2>Borradores</h2><p class="muted">${state.drafts.length} pendiente(s).</p></div></div>${state.drafts.length?`<div class="stack">${state.drafts.map(d=>`<article class="draft-card"><div class="section-heading"><div><h3>${esc(d.title)}</h3><p class="muted">${d.groups.length} fecha(s) · ${draftAppCount(d)} aplicación(es)</p></div></div><div class="action-row"><button class="secondary-button" data-resume-draft="${d.id}" type="button">Retomar</button><button class="danger-outline-button" data-discard-draft="${d.id}" type="button">Descartar</button></div></article>`).join('')}</div>`:'<div class="empty-state">Sin borradores.</div>'}</section><section class="card"><div class="section-heading"><div><h2>Copias e importación</h2><p class="muted">La copia completa incluye fichas, cuaderno, borradores y documentación.</p></div></div><div class="action-row"><button class="primary-button" id="backupDownload" type="button">Descargar copia completa</button><button class="secondary-button" id="backupImport" type="button">Importar copia</button></div><p class="small-note top-gap">Restauración por sustituir o fusionar, con conflictos revisables caso por caso.</p></section><section class="card"><div class="section-heading"><div><h2>Ajustes</h2><p class="muted">Configuración operativa de campaña.</p></div></div><form id="settingsForm" class="stack"><label class="field"><span>Aplicador activo</span><input class="field-input" name="applicator" value="${esc(state.settings.applicator)}" /></label><label class="field"><span>Litros/ha habituales</span><input class="field-input" name="defaultLha" type="number" step="0.001" value="${esc(state.settings.defaultLha)}" /></label><div class="action-row"><button class="primary-button" type="submit">Guardar ajustes</button></div></form></section></div>`; bindMas(); }
  function renderProductCard(p){ return `<article class="product-card ${p.status!=='verified'?'has-alert':''}"><div class="section-heading"><div><h3>${esc(p.name)}</h3><p class="muted">Registro: ${esc(p.registration)} · ${prodCount(p.id)} uso(s) reales</p></div>${statusBadge(p)}</div><div class="meta-row">${badge(`MEZCLA: ${p.mix}`,p.mix==='SOLO'?'danger':'neutral')}${badge(`${p.docs.length} documento(s)`,p.docs.length?'info':'warning')}</div><div class="action-row top-gap"><button class="secondary-button" data-edit-product="${p.id}" data-tab="ficha" type="button">Ver ficha</button><button class="secondary-button" data-edit-product="${p.id}" data-tab="manual" type="button">Editar ficha</button><button class="secondary-button" data-edit-product="${p.id}" data-tab="docs" type="button">Documentación</button></div></article>`; }
  function bindMas(){
    $('#newProduct',refs.views.mas)?.addEventListener('click',()=>openProductEditor(null,'manual'));
    $$('[data-edit-product]',refs.views.mas).forEach(b=>b.addEventListener('click',()=>openProductEditor(b.dataset.editProduct,b.dataset.tab||'ficha')));
    $$('[data-resume-draft]',refs.views.mas).forEach(b=>b.addEventListener('click',()=>{ui.activeDraftId=b.dataset.resumeDraft; setView('nuevo');}));
    $$('[data-discard-draft]',refs.views.mas).forEach(b=>b.addEventListener('click',()=>discardDraft(b.dataset.discardDraft)));
    $('#backupDownload',refs.views.mas)?.addEventListener('click',backupDownload);
    $('#backupImport',refs.views.mas)?.addEventListener('click',()=>refs.backupInput.click());
    $('#settingsForm',refs.views.mas)?.addEventListener('submit',e=>{e.preventDefault(); const fd=new FormData(e.currentTarget), l=num(fd.get('defaultLha')); mutate(s=>{s.settings.applicator=String(fd.get('applicator')||'').trim()||s.settings.applicator; if(l!==null)s.settings.defaultLha=l;},'Ajustes guardados.');});
  }

  function openProductEditor(id,tab='ficha'){
    const existing=id?product(id):null;
    const p=existing?JSON.parse(JSON.stringify(existing)):normalizeProduct({id:uid('prod'),name:'',uses:[blankUse()]});
    ui.tab=tab;
    modal(productModal(p,tab,Boolean(existing)),'wide-modal');
    bindProductEditor(p.id,Boolean(existing));
  }
  function productModal(p,tab,exists){ return `<div class="modal-head"><div><h2>${esc(p.name||'Nueva ficha de producto')}</h2><p class="muted">${exists?'Ficha existente':'Alta provisional / nueva ficha'}</p></div><button class="icon-button" data-close-modal type="button">×</button></div><div class="tab-row"><button class="${tab==='ficha'?'active':''}" data-switch-tab="ficha" type="button">Ver ficha</button><button class="${tab==='manual'?'active':''}" data-switch-tab="manual" type="button">Editar ficha</button><button class="${tab==='docs'?'active':''}" data-switch-tab="docs" type="button">Documentación</button><button class="${tab==='review'?'active':''}" data-switch-tab="review" type="button">Revisión documental</button></div><div class="product-tab-panel">${tab==='ficha'?productFicha(p):tab==='manual'?productManual(p,exists):tab==='docs'?productDocs(p):productReviewIntro(p)}</div>`; }
  function productFicha(p){ return `<div class="stack"><section class="panel nested-panel"><div class="section-heading"><div><h3>Estado de ficha</h3><p class="muted">${p.status==='verified'?'Todos los mínimos obligatorios están resueltos.':'Hay datos obligatorios A verificar.'}</p></div>${statusBadge(p)}</div><div class="info-grid"><div class="mini-metric"><span>N.º registro</span><strong>${esc(p.registration)}</strong></div><div class="mini-metric"><span>Principios activos</span><strong>${esc(p.activeIngredients)}</strong></div><div class="mini-metric"><span>MEZCLA</span><strong>${esc(p.mix)}</strong></div><div class="mini-metric"><span>Aplicaciones registradas</span><strong>${prodCount(p.id)}</strong></div></div></section><section class="panel nested-panel"><h3>Usos técnicos</h3><div class="stack">${p.uses.map(u=>`<article class="soft-box"><strong>${esc(u.crop||'Cultivo A verificar')} · ${esc(u.target||'Objetivo A verificar')}</strong><p class="small-note">Dosis: ${esc(u.doseDisplay)} · Volumen: ${esc(u.volumeDisplay)} · P.S.: ${esc(u.ps)} · Máx. campaña: ${esc(u.maxApplications??'A verificar')}</p></article>`).join('')}</div></section><section class="panel nested-panel"><h3>Fuente</h3>${sourceLines(p)||'<p class="muted">No hay documentación técnica asociada.</p>'}</section><div class="action-row"><button class="primary-button" data-switch-tab="manual" type="button">Editar ficha</button><button class="secondary-button" data-switch-tab="docs" type="button">Documentación técnica</button></div></div>`; }
  function productManual(p,exists){ return `<form id="productForm" class="stack" data-product="${p.id}"><div class="form-grid"><label class="field"><span>Nombre comercial</span><input class="field-input" name="name" value="${esc(p.name==='Producto sin nombre'?'':p.name)}" required /></label><label class="field"><span>N.º de registro</span><input class="field-input" name="registration" value="${esc(p.registration)}" /></label></div><label class="field"><span>Principios activos</span><input class="field-input" name="activeIngredients" value="${esc(p.activeIngredients)}" /></label><label class="field"><span>MEZCLA</span><select class="field-select" name="mix">${['A verificar','——','SOLO'].map(o=>`<option value="${o}" ${p.mix===o?'selected':''}>${o}</option>`).join('')}</select></label><section class="panel nested-panel"><div class="section-heading"><div><h3>Usos autorizados / indicados</h3><p class="muted">Cada uso se guarda por cultivo y objetivo.</p></div><button class="secondary-button" id="addUse" type="button">Añadir uso</button></div><div id="useEditors" class="stack">${p.uses.map((u,n)=>useEditor(u,n)).join('')}</div></section><div class="action-row"><button class="primary-button" type="submit">Guardar ficha</button>${exists?`<button class="danger-outline-button" data-archive="${p.id}" type="button">${p.archived?'Reactivar':'Archivar'}</button>`:''}</div></form>`; }
  function useEditor(u,n){ const dk=u.doseRule?.kind||'unset', vk=u.volumeRule?.kind||'unset'; return `<article class="review-card use-editor" data-use-index="${n}"><div class="section-heading"><h3>Uso ${n+1}</h3><button class="danger-outline-button" data-remove-use="${n}" type="button">Quitar</button></div><div class="form-grid"><label class="field"><span>Cultivo / uso</span><input class="field-input" name="crop_${n}" value="${esc(u.crop)}" /></label><label class="field"><span>Plaga / objetivo</span><input class="field-input" name="target_${n}" value="${esc(u.target)}" /></label></div><div class="form-grid"><label class="field"><span>P.S.</span><input class="field-input" name="ps_${n}" value="${esc(u.ps)}" /></label><label class="field"><span>Máx. aplicaciones campaña</span><input class="field-input" name="max_${n}" type="number" step="1" min="0" value="${u.maxApplications??''}" /></label></div><label class="field"><span>Dosis recomendada visible</span><input class="field-input" name="doseDisplay_${n}" value="${esc(u.doseDisplay)}" /></label><div class="form-grid"><label class="field"><span>Regla de dosis</span><select class="field-select dose-kind" name="doseKind_${n}" data-index="${n}"><option value="unset" ${dk==='unset'?'selected':''}>A verificar</option><option value="single" ${dk==='single'?'selected':''}>Dosis única</option><option value="range" ${dk==='range'?'selected':''}>Mínimo y máximo</option></select></label><label class="field"><span>Unidad dosis</span><select class="field-select" name="doseUnit_${n}"><option value="">A verificar</option>${units.map(x=>`<option value="${x}" ${u.doseRule?.unit===x?'selected':''}>${x}</option>`).join('')}</select></label></div><div class="form-grid"><label class="field dose-single-${n} ${dk==='single'?'':'hidden-field'}"><span>Valor único</span><input class="field-input" name="doseValue_${n}" type="number" step="0.001" value="${u.doseRule?.value??''}" /></label><label class="field dose-range-${n} ${dk==='range'?'':'hidden-field'}"><span>Mínimo</span><input class="field-input" name="doseMin_${n}" type="number" step="0.001" value="${u.doseRule?.min??''}" /></label><label class="field dose-range-${n} ${dk==='range'?'':'hidden-field'}"><span>Máximo</span><input class="field-input" name="doseMax_${n}" type="number" step="0.001" value="${u.doseRule?.max??''}" /></label><label class="field"><span>Límite por hectárea</span><input class="field-input" name="doseLimit_${n}" type="number" step="0.001" value="${u.doseRule?.limitHa??''}" /></label></div><label class="field"><span>Volumen caldo visible</span><input class="field-input" name="volumeDisplay_${n}" value="${esc(u.volumeDisplay)}" /></label><div class="form-grid"><label class="field"><span>Selector volumen caldo</span><select class="field-select volume-kind" name="volumeKind_${n}" data-index="${n}"><option value="unset" ${vk==='unset'?'selected':''}>A verificar</option><option value="single" ${vk==='single'?'selected':''}>Volumen único</option><option value="range" ${vk==='range'?'selected':''}>Volumen mínimo y máximo</option></select></label><label class="field"><span>Unidad</span><input class="field-input" value="L/ha" disabled /></label></div><div class="form-grid"><label class="field volume-single-${n} ${vk==='single'?'':'hidden-field'}"><span>Volumen único L/ha</span><input class="field-input" name="volumeValue_${n}" type="number" step="0.001" value="${u.volumeRule?.value??''}" /></label><label class="field volume-range-${n} ${vk==='range'?'':'hidden-field'}"><span>Mínimo L/ha</span><input class="field-input" name="volumeMin_${n}" type="number" step="0.001" value="${u.volumeRule?.min??''}" /></label><label class="field volume-range-${n} ${vk==='range'?'':'hidden-field'}"><span>Máximo L/ha</span><input class="field-input" name="volumeMax_${n}" type="number" step="0.001" value="${u.volumeRule?.max??''}" /></label></div><div class="form-grid"><label class="field"><span>Intervalo / condiciones</span><input class="field-input" name="interval_${n}" value="${esc(u.interval)}" /></label><label class="field"><span>Estadio</span><input class="field-input" name="stadium_${n}" value="${esc(u.stadium)}" /></label></div><label class="field"><span>Información adicional</span><textarea class="field-textarea" name="extra_${n}">${esc(u.extra)}</textarea></label></article>`; }
  function productDocs(p){ return `<div class="stack"><section class="panel nested-panel"><div class="section-heading"><div><h3>Documentación técnica asociada</h3><p class="muted">Imágenes optimizadas y PDF/documentos consultables.</p></div><button class="primary-button" data-add-docs="${p.id}" type="button">Añadir archivos</button></div>${p.docs.length?`<div class="stack">${p.docs.map(d=>docCard(p.id,d)).join('')}</div>`:'<div class="empty-state">Sin documentación asociada.</div>'}</section><section class="panel nested-panel"><h3>Fuente</h3>${sourceLines(p)||'<p class="muted">No hay documentación técnica asociada.</p>'}</section><div class="action-row"><button class="secondary-button" data-switch-tab="review" type="button">Revisar desde documentación</button></div></div>`; }
  function docCard(productId,d){ const img=String(d.type||'').startsWith('image/'), pdf=d.type==='application/pdf'||/\.pdf$/i.test(d.name||''); return `<article class="document-card"><div class="section-heading"><div><h3>${esc(d.name)}</h3><p class="muted">Aportado el ${fmtDate(d.addedOn)} · ${fmtNum(Math.round((d.size||0)/1024))} KB</p></div>${badge(img?'Imagen':pdf?'PDF':'Documento','info')}</div><div class="action-row">${img?`<button class="secondary-button" data-view-image="${d.id}" data-product-id="${productId}" type="button">Ver imagen ampliada</button>`:''}${pdf?`<button class="secondary-button" data-view-pdf="${d.id}" data-product-id="${productId}" type="button">Ver PDF</button>`:''}<button class="danger-outline-button" data-delete-doc="${d.id}" data-product-id="${productId}" type="button">Eliminar</button></div></article>`; }
  function sourceLines(p){ if(!p.docs.length) return ''; const groups=new Map(); p.docs.forEach(d=>{const k=d.addedOn||todayIso(); if(!groups.has(k))groups.set(k,[]); groups.get(k).push(d.name);}); return [...groups.entries()].sort((a,b)=>b[0].localeCompare(a[0])).map(([date,names])=>`<p class="source-line"><strong>Documentación aportada el ${fmtDate(date)}:</strong> ${esc([...new Set(names)].join(', '))}.</p>`).join(''); }
  function productReviewIntro(p){ return `<div class="stack"><section class="panel nested-panel"><h3>Extracción documental revisable</h3><p class="muted">La app propone datos con evidencia y confianza. No valida automáticamente datos dudosos.</p><div class="action-row"><button class="primary-button" data-run-review="${p.id}" type="button">Analizar documentación asociada</button></div></section><section class="panel nested-panel"><p class="small-note">Se prioriza texto real de PDF cuando está disponible. Las imágenes se conservan y se revisan en visor interno; esta versión no incorpora OCR pesado local.</p></section></div>`; }

  function bindProductEditor(productId,exists){
    $$('[data-switch-tab]',refs.modal).forEach(b=>b.addEventListener('click',()=>{const p=product(productId)||normalizeProduct({id:productId,uses:[blankUse()]}); modal(productModal(p,b.dataset.switchTab,Boolean(product(productId))),'wide-modal'); bindProductEditor(p.id,Boolean(product(p.id)));}));
    $('#addUse',refs.modal)?.addEventListener('click',()=>{const p=collectProductForm($('#productForm',refs.modal),productId,exists); p.uses.push(blankUse()); modal(productModal(p,'manual',exists),'wide-modal'); bindProductEditor(p.id,exists);});
    $$('[data-remove-use]',refs.modal).forEach(b=>b.addEventListener('click',()=>{const p=collectProductForm($('#productForm',refs.modal),productId,exists); if(p.uses.length<=1) return toast('Debe existir al menos un uso técnico.','danger'); p.uses.splice(Number(b.dataset.removeUse),1); modal(productModal(p,'manual',exists),'wide-modal'); bindProductEditor(p.id,exists);}));
    $$('.dose-kind',refs.modal).forEach(s=>s.addEventListener('change',()=>toggleDoseInputs(s.dataset.index,s.value)));
    $$('.volume-kind',refs.modal).forEach(s=>s.addEventListener('change',()=>toggleVolumeInputs(s.dataset.index,s.value)));
    $('#productForm',refs.modal)?.addEventListener('submit',e=>{e.preventDefault(); const p=collectProductForm(e.currentTarget,productId,exists); if(!p.name.trim()||p.name==='Producto sin nombre') return toast('El nombre comercial es obligatorio.','danger'); mutate(s=>{const n=s.products.findIndex(x=>x.id===p.id); if(n>=0)s.products[n]=p; else s.products.push(p);},p.status==='verified'?'Ficha guardada y verificada.':'Ficha guardada A verificar.'); closeModal();});
    $('[data-archive]',refs.modal)?.addEventListener('click',b=>{mutate(s=>{const p=s.products.find(x=>x.id===b.dataset.archive); if(p){p.archived=!p.archived;p.updatedAt=nowIso();}},'Estado del producto actualizado.'); closeModal();});
    $$('[data-add-docs]',refs.modal).forEach(b=>b.addEventListener('click',()=>{ui.pendingDocProductId=b.dataset.addDocs; refs.docsInput.click();}));
    $$('[data-view-image]',refs.modal).forEach(b=>b.addEventListener('click',()=>viewImage(b.dataset.productId,b.dataset.viewImage)));
    $$('[data-view-pdf]',refs.modal).forEach(b=>b.addEventListener('click',()=>viewPdf(b.dataset.productId,b.dataset.viewPdf)));
    $$('[data-delete-doc]',refs.modal).forEach(b=>b.addEventListener('click',()=>deleteDocument(b.dataset.productId,b.dataset.deleteDoc)));
    $('[data-run-review]',refs.modal)?.addEventListener('click',b=>runReview(b.dataset.runReview));
  }
  function toggleDoseInputs(n,kind){ $$('.dose-single-'+n,refs.modal).forEach(x=>x.classList.toggle('hidden-field',kind!=='single')); $$('.dose-range-'+n,refs.modal).forEach(x=>x.classList.toggle('hidden-field',kind!=='range')); }
  function toggleVolumeInputs(n,kind){ $$('.volume-single-'+n,refs.modal).forEach(x=>x.classList.toggle('hidden-field',kind!=='single')); $$('.volume-range-'+n,refs.modal).forEach(x=>x.classList.toggle('hidden-field',kind!=='range')); }
  function collectProductForm(form,id,exists){ const old=product(id), fd=new FormData(form), uses=[]; $$('.use-editor',form).forEach((_,n)=>{const dk=String(fd.get(`doseKind_${n}`)||'unset'), vk=String(fd.get(`volumeKind_${n}`)||'unset'); uses.push(normalizeUse({id:old?.uses?.[n]?.id||uid('uso'),crop:String(fd.get(`crop_${n}`)||'').trim(),target:String(fd.get(`target_${n}`)||'').trim(),ps:String(fd.get(`ps_${n}`)||'').trim()||'A verificar',maxApplications:num(fd.get(`max_${n}`)),doseDisplay:String(fd.get(`doseDisplay_${n}`)||'').trim()||'A verificar',doseRule:{kind:dk,unit:String(fd.get(`doseUnit_${n}`)||'').trim(),value:dk==='single'?num(fd.get(`doseValue_${n}`)):null,min:dk==='range'?num(fd.get(`doseMin_${n}`)):null,max:dk==='range'?num(fd.get(`doseMax_${n}`)):null,limitHa:num(fd.get(`doseLimit_${n}`))},volumeDisplay:String(fd.get(`volumeDisplay_${n}`)||'').trim()||'A verificar',volumeRule:{kind:vk,value:vk==='single'?num(fd.get(`volumeValue_${n}`)):null,min:vk==='range'?num(fd.get(`volumeMin_${n}`)):null,max:vk==='range'?num(fd.get(`volumeMax_${n}`)):null},interval:String(fd.get(`interval_${n}`)||'').trim(),stadium:String(fd.get(`stadium_${n}`)||'').trim(),extra:String(fd.get(`extra_${n}`)||'').trim()}));}); const p=normalizeProduct({...old,id:id||uid('prod'),name:String(fd.get('name')||old?.name||'').trim(),registration:String(fd.get('registration')||'').trim()||'A verificar',activeIngredients:String(fd.get('activeIngredients')||'').trim()||'A verificar',mix:String(fd.get('mix')||'A verificar'),uses:uses.length?uses:[blankUse()],docs:old?.docs||[],archived:old?.archived||false,createdAt:old?.createdAt||nowIso(),updatedAt:nowIso()}); p.status=productIsVerified(p)?'verified':'pending'; return p; }

  async function optimizeImage(file){ return new Promise((res,rej)=>{const img=new Image(), url=URL.createObjectURL(file); img.onload=()=>{try{const max=1800, r=Math.min(1,max/Math.max(img.width,img.height)), canvas=document.createElement('canvas'); canvas.width=Math.round(img.width*r); canvas.height=Math.round(img.height*r); canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height); canvas.toBlob(blob=>{URL.revokeObjectURL(url); blob?res(blob):rej(new Error('No blob'));},file.type==='image/png'?'image/png':'image/jpeg',0.88);}catch(e){URL.revokeObjectURL(url);rej(e);}}; img.onerror=()=>{URL.revokeObjectURL(url);rej(new Error('Imagen no legible'));}; img.src=url;}); }
  async function addDocs(productId,files){ const p=product(productId); if(!p||!files.length) return; const docs=[]; for(const file of files){let blob=file; if(file.type?.startsWith('image/')){try{blob=await optimizeImage(file);}catch{blob=file;}} const d={id:uid('doc'),name:file.name||`documento_${Date.now()}`,type:blob.type||file.type||'application/octet-stream',size:blob.size||file.size||0,addedOn:todayIso(),createdAt:nowIso()}; await putDoc(d.id,blob); docs.push(d);} mutate(s=>{const pp=s.products.find(x=>x.id===productId); pp.docs.push(...docs); pp.updatedAt=nowIso();},'Documentación asociada.'); const fresh=product(productId); modal(productModal(fresh,'docs',true),'wide-modal'); bindProductEditor(productId,true); }
  async function viewImage(productId,docId){ const p=product(productId), d=p?.docs.find(x=>x.id===docId), blob=await getDoc(docId); if(!d||!blob) return toast('No se pudo abrir la imagen.','danger'); const url=URL.createObjectURL(blob); modal(`<div class="modal-head"><h2>Ver imagen ampliada</h2><button class="icon-button" data-close-modal type="button">×</button></div><div class="image-viewer"><img src="${url}" alt="${esc(d.name)}" /></div><div class="action-row"><button class="secondary-button" id="backDocs" type="button">Volver al visor documental</button></div>`,'wide-modal'); $('#backDocs',refs.modal)?.addEventListener('click',()=>{URL.revokeObjectURL(url); const fresh=product(productId); modal(productModal(fresh,'docs',true),'wide-modal'); bindProductEditor(productId,true);}); }
  async function viewPdf(productId,docId){ const p=product(productId), d=p?.docs.find(x=>x.id===docId), blob=await getDoc(docId); if(!d||!blob) return toast('No se pudo abrir el PDF.','danger'); const url=URL.createObjectURL(blob); modal(`<div class="modal-head"><h2>${esc(d.name)}</h2><button class="icon-button" data-close-modal type="button">×</button></div><iframe class="pdf-frame" src="${url}" title="${esc(d.name)}"></iframe><div class="action-row"><button class="secondary-button" id="backDocs" type="button">Volver al visor documental</button></div>`,'wide-modal'); $('#backDocs',refs.modal)?.addEventListener('click',()=>{URL.revokeObjectURL(url); const fresh=product(productId); modal(productModal(fresh,'docs',true),'wide-modal'); bindProductEditor(productId,true);}); }
  function deleteDocument(productId,docId){ confirmBox('Eliminar documentación','El archivo se retirará de la ficha y Fuente se actualizará automáticamente.',async()=>{await delDoc(docId); mutate(s=>{const p=s.products.find(x=>x.id===productId); p.docs=p.docs.filter(d=>d.id!==docId); p.updatedAt=nowIso();},'Documento eliminado.'); const fresh=product(productId); modal(productModal(fresh,'docs',true),'wide-modal'); bindProductEditor(productId,true);},'Eliminar',true); }
  async function runReview(productId){ const p=product(productId); if(!p||!p.docs.length) return toast('No hay documentación para revisar.','danger'); const files=[]; for(const d of p.docs){const blob=await getDoc(d.id); if(blob) files.push(new File([blob],d.name,{type:d.type}));} const text=window.DocumentAssist?.extractTextFromFiles?await window.DocumentAssist.extractTextFromFiles(files):''; const proposals=reviewProposals(p,text); modal(reviewModal(p,proposals,text),'wide-modal'); $('#reviewForm',refs.modal)?.addEventListener('submit',e=>{e.preventDefault(); const fd=new FormData(e.currentTarget); mutate(s=>{const pp=s.products.find(x=>x.id===productId); const u=pp.uses[0]||blankUse(); if(!pp.uses.length) pp.uses.push(u); proposals.forEach((pr,n)=>{if(!fd.get(`accept_${n}`)) return; const value=String(fd.get(`value_${n}`)||'').trim(); if(!value) return; if(pr.scope==='product') pp[pr.key]=value; else u[pr.key]=pr.key==='maxApplications'?num(value):value;}); pp.status=productIsVerified(pp)?'verified':'pending'; pp.updatedAt=nowIso();},'Datos confirmados aplicados.'); closeModal();}); }
  function reviewProposals(p,text){ const t=String(text||'').replace(/\s+/g,' ').trim(), u=p.uses[0]||blankUse(); const reg=t.match(/\b(?:ES[-\s]?)?(\d{4,6})\b/)?.[1]||''; const active=t.match(/(?:composici[oó]n|sustancia activa|principio[s]? activo[s]?)[^.;:]{0,20}[:\-]?\s*([^.;]{4,120})/i)?.[1]?.trim()||''; const solo=/\b(aplicar solo|no mezclar|solo)\b/i.test(t); const ps=t.match(/(?:plazo de seguridad|p\.?\s*s\.?)[^0-9]{0,20}(\d{1,3})\s*d[ií]as?/i)?.[1]||''; const max=t.match(/(?:máx(?:imo)?\.?\s*(?:de)?\s*aplicaciones|n[uú]mero máximo de aplicaciones)[^0-9]{0,20}(\d{1,2})/i)?.[1]||''; const dose=t.match(/(\d+(?:[.,]\d+)?)\s*(?:-|a)\s*(\d+(?:[.,]\d+)?)\s*(g\/h[lL]|kg\/h[lL]|m[lL]\/h[lL]|l\/h[lL]|g\/ha|kg\/ha|m[lL]\/ha|l\/ha)/i)?.[0]||t.match(/(\d+(?:[.,]\d+)?)\s*(g\/h[lL]|kg\/h[lL]|m[lL]\/h[lL]|l\/h[lL]|g\/ha|kg\/ha|m[lL]\/ha|l\/ha)/i)?.[0]||''; const vol=t.match(/(\d+(?:[.,]\d+)?)\s*(?:-|a)\s*(\d+(?:[.,]\d+)?)\s*l\/ha/i)?.[0]||t.match(/(\d+(?:[.,]\d+)?)\s*l\/ha/i)?.[0]||''; return [
    {key:'registration',label:'N.º de registro',proposal:reg||p.registration,evidence:reg?`Coincidencia numérica: ${reg}`:'No se encontró evidencia inequívoca.',confidence:reg?'Media':'Baja',scope:'product'},
    {key:'activeIngredients',label:'Principios activos',proposal:active||p.activeIngredients,evidence:active?active:'No se encontró bloque textual claro.',confidence:active?'Media':'Baja',scope:'product'},
    {key:'mix',label:'MEZCLA',proposal:solo?'SOLO':p.mix,evidence:solo?'Se detecta referencia textual a aplicación sin mezcla.':'No consta evidencia inequívoca de SOLO.',confidence:solo?'Media':'Baja',scope:'product'},
    {key:'ps',label:'P.S.',proposal:ps?`${ps} días`:u.ps,evidence:ps?`${ps} días`:'No se encontró P.S. inequívoco.',confidence:ps?'Media':'Baja',scope:'use'},
    {key:'maxApplications',label:'Máx. aplicaciones campaña',proposal:max||u.maxApplications||'',evidence:max?max:'No se encontró límite inequívoco.',confidence:max?'Media':'Baja',scope:'use'},
    {key:'doseDisplay',label:'Dosis recomendada',proposal:dose||u.doseDisplay,evidence:dose||'No se encontró dosis inequívoca.',confidence:dose?'Media':'Baja',scope:'use'},
    {key:'volumeDisplay',label:'Volumen caldo',proposal:vol||u.volumeDisplay,evidence:vol||'No se encontró volumen inequívoco en L/ha.',confidence:vol?'Media':'Baja',scope:'use'}
  ]; }
  function reviewModal(p,prs,text){ return `<div class="modal-head"><div><h2>Revisión documental · ${esc(p.name)}</h2><p class="muted">Confirma cada recuadro azul o corrige manualmente antes de aplicar.</p></div><button class="icon-button" data-close-modal type="button">×</button></div><form id="reviewForm" class="stack">${prs.map((pr,n)=>`<article class="review-card"><div class="section-heading"><div><h3>${esc(pr.label)}</h3><p class="muted">Confianza: ${esc(pr.confidence)}</p></div>${badge(pr.confidence,pr.confidence==='Media'?'info':'warning')}</div><p class="small-note"><strong>Evidencia:</strong> ${esc(pr.evidence)}</p><label class="field"><span>Propuesta / corrección manual</span><input class="field-input" name="value_${n}" value="${esc(pr.proposal||'')}" /></label><label class="checkbox-card blue-check"><input type="checkbox" name="accept_${n}" /><span>Confirmo este dato</span></label></article>`).join('')}<section class="panel nested-panel"><h3>Texto detectado</h3><p class="small-note">${esc((text||'Sin texto estructurado disponible.').slice(0,1800))}</p></section><div class="action-row"><button class="secondary-button" data-close-modal type="button">Cancelar</button><button class="primary-button" type="submit">Aplicar datos confirmados</button></div></form>`; }

  function blobToDataUrl(blob){ return new Promise((res,rej)=>{const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=()=>rej(r.error); r.readAsDataURL(blob);}); }
  function dataUrlBlob(url){ const [head,body]=String(url).split(','), mime=head.match(/data:(.*?);base64/i)?.[1]||'application/octet-stream', raw=atob(body||''), arr=new Uint8Array(raw.length); for(let i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i); return new Blob([arr],{type:mime}); }
  async function backupDownload(){ const docs=[]; for(const p of state.products){for(const d of p.docs){const blob=await getDoc(d.id); if(blob) docs.push({id:d.id,dataUrl:await blobToDataUrl(blob)});}} const payload={backupType:'CT-APP-V2-COMPLETE',createdAt:nowIso(),appVersion:VERSION,state,docs}; download(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),'copia_completa_app_cuaderno_tratamientos_v2_0.json'); toast('Copia completa descargada.'); }
  async function importBackup(file){ if(!file) return; let payload; try{payload=JSON.parse(await file.text());}catch{return toast('El archivo no es JSON válido.','danger');} if(!payload?.state||!String(payload.backupType||'').startsWith('CT-APP-V2')) return toast('La copia no pertenece a esta app.','danger'); modal(`<div class="modal-head"><h2>Importar copia</h2><button class="icon-button" data-close-modal type="button">×</button></div><p>Elige el modo de restauración.</p><div class="choice-grid"><button class="menu-card" data-import-mode="replace" type="button"><strong>Sustituir</strong><span>Reemplaza todos los datos locales actuales.</span></button><button class="menu-card" data-import-mode="merge" type="button"><strong>Fusionar</strong><span>Conserva lo actual y revisa conflictos producto a producto.</span></button></div>`); $$('[data-import-mode]',refs.modal).forEach(b=>b.addEventListener('click',()=>b.dataset.importMode==='replace'?replaceBackup(payload):mergeBackup(payload))); }
  async function restoreDocs(docs){ for(const d of docs||[]){ if(d?.id&&d?.dataUrl) await putDoc(d.id,dataUrlBlob(d.dataUrl)); } }
  async function replaceBackup(payload){ await restoreDocs(payload.docs); state=migrate(payload.state); state.importHistory.push({date:nowIso(),mode:'replace'}); save(); closeModal(); renderAll(); toast('Copia restaurada por sustitución.'); }
  function mergeBackup(payload){ const incoming=migrate(payload.state); const conflicts=incoming.products.map(p=>({incoming:p,existing:byName(p.name)})).filter(x=>x.existing); if(!conflicts.length) return performMerge(payload,{}); modal(`<div class="modal-head"><h2>Resolver conflictos de productos</h2><button class="icon-button" data-close-modal type="button">×</button></div><form id="conflictForm" class="stack">${conflicts.map((c,n)=>`<article class="review-card"><h3>${esc(c.incoming.name)}</h3><p class="muted">Existe una ficha local con el mismo nombre.</p><label class="choice-line"><input type="radio" name="c_${n}" value="keep" checked /><span>Conservar ficha local</span></label><label class="choice-line"><input type="radio" name="c_${n}" value="replace" /><span>Usar ficha importada</span></label></article>`).join('')}<div class="action-row"><button class="secondary-button" data-close-modal type="button">Cancelar</button><button class="primary-button" type="submit">Fusionar</button></div></form>`,'wide-modal'); $('#conflictForm',refs.modal)?.addEventListener('submit',e=>{e.preventDefault(); const fd=new FormData(e.currentTarget), decisions={}; conflicts.forEach((c,n)=>decisions[norm(c.incoming.name)]=fd.get(`c_${n}`)||'keep'); performMerge(payload,decisions);}); }
  async function performMerge(payload,decisions){ await restoreDocs(payload.docs); const incoming=migrate(payload.state); mutate(s=>{incoming.products.forEach(p=>{const local=s.products.find(x=>norm(x.name)===norm(p.name)); if(!local)s.products.push(p); else if(decisions[norm(p.name)]==='replace'){const n=s.products.findIndex(x=>x.id===local.id); s.products[n]=p;}}); incoming.interventions.forEach(i=>{let local=s.interventions.find(x=>x.date===i.date); if(!local)s.interventions.push(i); else i.applications.forEach(a=>{if(!local.applications.some(x=>x.productId===a.productId&&x.lot===a.lot))local.applications.push(a);});}); incoming.drafts.forEach(d=>{if(!s.drafts.some(x=>x.id===d.id))s.drafts.push(d);}); s.interventions.sort((a,b)=>a.date.localeCompare(b.date)); s.importHistory.push({date:nowIso(),mode:'merge'});},'Copia fusionada.'); closeModal(); }

  function bindGlobal(){
    refs.nav.forEach(b=>b.addEventListener('click',()=>setView(b.dataset.nav)));
    refs.search?.addEventListener('input',e=>{ui.search=e.currentTarget.value; renderAll(); refs.search.focus(); try{refs.search.setSelectionRange(refs.search.value.length,refs.search.value.length);}catch{}});
    refs.docsInput?.addEventListener('change',async e=>{const files=[...(e.currentTarget.files||[])], id=ui.pendingDocProductId; ui.pendingDocProductId=null; e.currentTarget.value=''; if(id&&files.length) await addDocs(id,files);});
    refs.backupInput?.addEventListener('change',async e=>{await importBackup(e.currentTarget.files?.[0]); e.currentTarget.value='';});
    window.addEventListener('beforeinstallprompt',e=>{e.preventDefault(); ui.installPrompt=e; refs.install?.classList.remove('install-hidden');});
    refs.install?.addEventListener('click',async()=>{if(!ui.installPrompt)return; ui.installPrompt.prompt(); await ui.installPrompt.userChoice; ui.installPrompt=null; refs.install.classList.add('install-hidden');});
  }
  function setupSW(){ if(!('serviceWorker' in navigator)) return; window.addEventListener('load',async()=>{try{const reg=await navigator.serviceWorker.register('./sw.js?v=2.0.0',{updateViaCache:'none'}); reg.update();}catch{toast('La app funciona, pero no se pudo activar el modo sin conexión.','warning');}}); }

  bindGlobal(); setupSW(); renderAll();
})();
