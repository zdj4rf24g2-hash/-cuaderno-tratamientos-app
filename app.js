(() => {
  'use strict';

  const APP_VERSION = '2.9';
  const SCHEMA_VERSION = '1.0.0';
  const DB_NAME = 'cuaderno-tratamientos-pwa-v1';
  const DB_STORE = 'state';
  const DB_KEY = 'singleton';
  const EMPTY_CAMPAIGN_ID = '2026';
  const OFFICIAL_COLUMNS = [
    ['ordinal', 'N.º'],
    ['date', 'Fecha'],
    ['productName', 'Nombre del producto'],
    ['registration', 'N.º de registro'],
    ['lot', 'Lote'],
    ['doseReference', 'Dosis recomendada'],
    ['doseApplied', 'Dosis aplicada'],
    ['volumeReference', 'Volumen caldo'],
    ['litersPerHa', 'Litros/ha aplicados'],
    ['crop', 'Cultivo'],
    ['objective', 'Plaga / patógeno'],
    ['safetyPeriod', 'P.S.'],
    ['campaignCount', 'Tratamientos campaña'],
    ['activeIngredients', 'Principios activos'],
    ['mixRule', 'MEZCLA']
  ];

  const IMPORT_KEYS = [
    ['date', 'Fecha'],
    ['productName', 'Nombre del producto'],
    ['registration', 'N.º de registro'],
    ['lot', 'Lote'],
    ['doseReference', 'Dosis recomendada'],
    ['doseApplied', 'Dosis aplicada'],
    ['volumeReference', 'Volumen caldo'],
    ['litersPerHa', 'Litros/ha aplicados'],
    ['crop', 'Cultivo'],
    ['objective', 'Plaga / patógeno'],
    ['safetyPeriod', 'P.S.'],
    ['activeIngredients', 'Principios activos'],
    ['mixRule', 'MEZCLA']
  ];

  const DOCUMENT_REVIEW_FIELDS = [
    { key: 'registration', label: 'N.º de registro', kind: 'text', required: true },
    { key: 'activeIngredients', label: 'Principios activos', kind: 'textarea', required: true },
    { key: 'mixRule', label: 'MEZCLA', kind: 'mix', required: true },
    { key: 'allowedUses', label: 'Cultivo / uso autorizado', kind: 'lines', required: false },
    { key: 'allowedObjectives', label: 'Plaga / patógeno u objetivo', kind: 'lines', required: false },
    { key: 'doseReference', label: 'Dosis recomendada', kind: 'textarea', required: true },
    { key: 'doseRule', label: 'Regla de validación de dosis', kind: 'doseRule', required: true },
    { key: 'volumeReference', label: 'Volumen caldo', kind: 'volumeReferenceStructured', required: true },
    { key: 'safetyPeriod', label: 'P.S.', kind: 'text', required: true },
    { key: 'maxApplications', label: 'Máx. aplicaciones campaña', kind: 'integerOrNoConsta', required: true },
    { key: 'applicationInterval', label: 'Intervalo entre aplicaciones', kind: 'text', required: false },
    { key: 'applicationStage', label: 'Estadio / condiciones de aplicación', kind: 'textarea', required: false }
  ];

  let state;
  let ui = {
    screen: 'home',
    ledgerView: 'mobile',
    ledgerQuery: '',
    ledgerDateFilter: '',
    morePanel: null,
    currentDraftId: null,
    importPreview: null,
    searchQuery: ''
  };

  const els = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheEls();
    bindGlobalEvents();
    state = await loadState();
    ensureStateShape();
    updateCampaignLabel();
    render();
    registerServiceWorker();
  }

  function cacheEls() {
    els.screen = document.getElementById('screen');
    els.globalSearch = document.getElementById('globalSearch');
    els.globalSearchResults = document.getElementById('globalSearchResults');
    els.activeCampaignLabel = document.getElementById('activeCampaignLabel');
    els.toast = document.getElementById('toast');
    els.modalHost = document.getElementById('modalHost');
    els.installHintBtn = document.getElementById('installHintBtn');
    els.navButtons = Array.from(document.querySelectorAll('.nav-item'));
  }

  function bindGlobalEvents() {
    els.navButtons.forEach(btn => {
      btn.addEventListener('click', () => navigate(btn.dataset.screen));
    });

    els.installHintBtn.addEventListener('click', () => {
      showInfoModal(
        'Instalar en iPhone',
        `<p>En Safari, pulsa <strong>Compartir</strong> y después <strong>Añadir a pantalla de inicio</strong>.</p>
         <p class="muted">La app funciona con datos locales en el dispositivo. La carga inicial se importa después desde su archivo separado.</p>`
      );
    });

    els.globalSearch.addEventListener('input', event => {
      ui.searchQuery = event.target.value || '';
      renderGlobalSearchResults();
    });

    els.globalSearchResults.addEventListener('click', event => {
      const btn = event.target.closest('[data-search-target]');
      if (!btn) return;
      const target = btn.dataset.searchTarget;
      const id = btn.dataset.searchId;
      els.globalSearchResults.classList.add('hidden');
      if (target === 'treatment') {
        ui.screen = 'ledger';
        ui.ledgerView = 'mobile';
        ui.ledgerQuery = id ? findTreatment(id)?.productName || '' : '';
      } else if (target === 'product') {
        ui.screen = 'more';
        ui.morePanel = 'catalog';
      } else if (target === 'alert') {
        ui.screen = 'alerts';
      }
      syncNav();
      render();
    });

    els.screen.addEventListener('click', handleScreenClick);
    els.screen.addEventListener('input', handleScreenInput);
    els.screen.addEventListener('change', handleScreenChange);
    els.modalHost.addEventListener('click', handleModalHostClick);
    els.modalHost.addEventListener('change', handleModalHostChange);
  }

  function defaultState() {
    const now = new Date().toISOString();
    return {
      schemaVersion: SCHEMA_VERSION,
      appVersion: APP_VERSION,
      createdAt: now,
      updatedAt: now,
      activeCampaignId: EMPTY_CAMPAIGN_ID,
      campaigns: [{
        id: EMPTY_CAMPAIGN_ID,
        name: 'Campaña 2026',
        active: true,
        applicator: '',
        createdAt: now,
        updatedAt: now
      }],
      products: [],
      treatments: [],
      alerts: [],
      drafts: [],
      history: {
        imports: [],
        restores: [],
        exports: []
      }
    };
  }

  async function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
    });
  }

  async function loadState() {
    try {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const store = tx.objectStore(DB_STORE);
        const req = store.get(DB_KEY);
        req.onsuccess = () => resolve(req.result || defaultState());
        req.onerror = () => reject(req.error);
      });
    } catch (error) {
      console.error(error);
      toast('No se pudo leer el almacenamiento local. Se abre un estado vacío.');
      return defaultState();
    }
  }

  async function saveState() {
    state.updatedAt = new Date().toISOString();
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        const store = tx.objectStore(DB_STORE);
        const req = store.put(state, DB_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (error) {
      console.error(error);
      toast('No se pudo guardar en el dispositivo.');
    }
  }

  function ensureStateShape() {
    const fallback = defaultState();
    state = state && typeof state === 'object' ? state : fallback;
    state.schemaVersion ||= SCHEMA_VERSION;
    state.appVersion = APP_VERSION;
    state.activeCampaignId ||= EMPTY_CAMPAIGN_ID;
    state.campaigns ||= fallback.campaigns;
    state.products ||= [];
    state.products.forEach(ensureProductDocumentShape);
    state.treatments ||= [];
    state.alerts ||= [];
    state.drafts ||= [];
    state.history ||= { imports: [], restores: [], exports: [] };
    state.history.imports ||= [];
    state.history.restores ||= [];
    state.history.exports ||= [];
    if (!state.campaigns.some(c => c.id === state.activeCampaignId)) {
      state.campaigns.unshift(fallback.campaigns[0]);
      state.activeCampaignId = EMPTY_CAMPAIGN_ID;
    }
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js?v=2.9', { updateViaCache: 'none' }).then(registration => registration.update()).catch(error => console.warn('SW no registrado', error));
    }
  }

  function navigate(screen) {
    ui.screen = screen;
    if (screen !== 'more') ui.morePanel = null;
    syncNav();
    render();
    els.screen.focus({ preventScroll: true });
  }

  function syncNav() {
    els.navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.screen === ui.screen));
  }

  function render() {
    syncNav();
    updateCampaignLabel();
    switch (ui.screen) {
      case 'home':
        els.screen.innerHTML = renderHome();
        break;
      case 'new':
        els.screen.innerHTML = renderNew();
        break;
      case 'ledger':
        els.screen.innerHTML = renderLedger();
        break;
      case 'alerts':
        els.screen.innerHTML = renderAlerts();
        break;
      case 'more':
        els.screen.innerHTML = renderMore();
        break;
      default:
        ui.screen = 'home';
        els.screen.innerHTML = renderHome();
    }
  }

  function updateCampaignLabel() {
    const campaign = activeCampaign();
    els.activeCampaignLabel.textContent = campaign?.name?.replace(/^Campaña\s*/i, '') || '2026';
  }

  function activeCampaign() {
    return state.campaigns.find(c => c.id === state.activeCampaignId) || state.campaigns[0];
  }

  function activeTreatments() {
    return state.treatments.filter(t => t.campaignId === state.activeCampaignId);
  }

  function activeAlerts() {
    return state.alerts.filter(a => a.campaignId === state.activeCampaignId && a.status === 'ACTIVE');
  }

  function resolvedAlerts() {
    return state.alerts.filter(a => a.campaignId === state.activeCampaignId && a.status === 'RESOLVED');
  }

  function currentDrafts() {
    return state.drafts.filter(d => d.campaignId === state.activeCampaignId);
  }

  function renderHome() {
    const treatments = activeTreatments();
    const alerts = activeAlerts();
    const drafts = currentDrafts();
    const usedProducts = new Set(treatments.map(t => t.productName)).size;
    const last = treatments.slice().sort(sortTreatmentDesc)[0];
    const lastDateRows = last ? treatments.filter(row => row.date === last.date).sort(sortTreatmentAsc) : [];
    const campaign = activeCampaign();
    return `
      <section class="section-card">
        <div class="section-header">
          <div>
            <h2>Resumen de campaña</h2>
            <p>Datos locales. App pública neutra; la carga real se importa de forma separada.</p>
          </div>
          <span class="tag ${campaign?.applicator ? 'ok' : 'pending'}">${campaign?.applicator ? 'Aplicador configurado' : 'Aplicador pendiente'}</span>
        </div>
        <div class="metric-grid">
          <article class="metric-card"><strong>${treatmentDatesCount(treatments)}</strong><span>Fechas</span></article>
          <article class="metric-card"><strong>${treatments.length}</strong><span>Aplicaciones</span></article>
          <article class="metric-card"><strong>${usedProducts}</strong><span>Productos usados</span></article>
          <article class="metric-card"><strong>${alerts.length}</strong><span>Alertas activas</span></article>
        </div>
      </section>

      <section class="section-card">
        <div class="section-header">
          <div>
            <h2>Acciones rápidas</h2>
            <p>Registro, consulta y carga local.</p>
          </div>
        </div>
        <div class="quick-actions">
          <button class="primary-btn" data-action="go-new">Nuevo tratamiento</button>
          <button class="secondary-btn" data-action="go-ledger">Abrir cuaderno</button>
          <button class="ghost-btn" data-action="go-import">Importar carga</button>
        </div>
      </section>

      <section class="subgrid two">
        <article class="section-card">
          <h2>Último tratamiento</h2>
          ${last ? `
            <div class="latest-treatment-date-row">
              <strong>Fecha</strong>
              <span>${formatDate(last.date)}</span>
            </div>
            <div class="latest-treatment-table" role="table" aria-label="Productos del último tratamiento">
              <div class="latest-treatment-table-head" role="row">
                <strong role="columnheader">Producto</strong>
                <strong role="columnheader">Dosis</strong>
                <strong role="columnheader">Aplicación campaña</strong>
                <strong role="columnheader">Plazo entre tratamientos</strong>
              </div>
              <div class="latest-treatment-list">
                ${lastDateRows.map(renderLatestTreatmentProduct).join('')}
              </div>
            </div>
          ` : renderEmpty('Sin tratamientos registrados', 'Importa la carga inicial o crea el primer tratamiento.')}
        </article>

        <article class="section-card">
          <h2>Borrador abierto</h2>
          ${drafts.length ? `
            <p>${drafts.length} borrador(es) disponibles.</p>
            <div class="button-row" style="margin-top:12px"><button class="secondary-btn" data-action="open-drafts">Retomar</button></div>
          ` : renderEmpty('Sin borradores', 'Los tratamientos en curso se autoguardan aquí.')}
        </article>
      </section>

      <section class="section-card">
        <div class="section-header">
          <div>
            <h2>Alertas prioritarias</h2>
            <p>Pendientes técnicos, incidencias y revisiones abiertas.</p>
          </div>
          ${alerts.length ? `<span class="tag warn">${alerts.length} activas</span>` : `<span class="tag ok">Sin alertas</span>`}
        </div>
        ${alerts.length ? `<div class="alert-list">${alerts.slice(0, 3).map(renderAlertCardMini).join('')}</div>` : renderEmpty('No hay alertas activas', 'Las alertas resueltas conservan trazabilidad histórica.')}
        ${alerts.length ? `<div class="button-row" style="margin-top:12px"><button class="ghost-btn" data-action="go-alerts">Ver todas</button></div>` : ''}
      </section>
    `;
  }

  function renderLatestTreatmentProduct(row) {
    const application = latestTreatmentApplicationDisplay(row);
    const interval = latestTreatmentIntervalDisplay(row, application);
    return `
      <div class="latest-treatment-row" role="row">
        <strong class="latest-treatment-product-name" role="cell">${escapeHtml(row.productName || '—')}</strong>
        <span class="latest-treatment-dose" role="cell">${escapeHtml(row.doseApplied || '—')}</span>
        <strong class="latest-treatment-application" role="cell">${escapeHtml(application)}</strong>
        <strong class="latest-treatment-interval" role="cell">${escapeHtml(interval)}</strong>
      </div>
    `;
  }

  function latestTreatmentApplicationDisplay(row) {
    const display = campaignCountDisplay(row);
    return display === '1/1' ? 'ÚNICO' : display;
  }

  function latestTreatmentIntervalDisplay(row, applicationDisplay = latestTreatmentApplicationDisplay(row)) {
    const product = findProduct(row.productId);
    const interval = String(product?.applicationInterval || '').trim();
    if (interval) return interval;
    const max = row.snapshot?.maxApplications ?? product?.maxApplications;
    if (applicationDisplay === 'ÚNICO' || Number(max) === 1) return 'No procede';
    return 'A verificar';
  }

  function renderNew() {
    const drafts = currentDrafts();
    const draft = ui.currentDraftId ? drafts.find(d => d.id === ui.currentDraftId) : null;
    if (!draft) {
      return `
        <section class="section-card">
          <div class="section-header">
            <div>
              <h2>Nuevo tratamiento</h2>
              <p>El flujo se autoguarda. Puedes iniciar uno nuevo o retomar un borrador.</p>
            </div>
          </div>
          <div class="button-row">
            <button class="primary-btn" data-action="start-draft">Comenzar</button>
            ${drafts.length ? `<button class="secondary-btn" data-action="open-drafts">Ver borradores (${drafts.length})</button>` : ''}
          </div>
        </section>
        ${drafts.length ? `<section class="section-card"><h2>Borradores disponibles</h2><div class="product-list">${drafts.map(renderDraftChoice).join('')}</div></section>` : ''}
      `;
    }
    return renderDraftBuilder(draft);
  }

  function renderDraftChoice(draft) {
    const firstDate = draft.groups?.[0]?.date ? formatDate(draft.groups[0].date) : 'Fecha pendiente';
    const productCount = (draft.groups || []).reduce((sum, group) => sum + (group.products || []).length, 0);
    return `
      <article class="draft-card">
        <div class="section-header">
          <div>
            <h3>Borrador ${escapeHtml(firstDate)}</h3>
            <p>${productCount} producto(s) incorporados.</p>
          </div>
          <span class="tag pending">Autoguardado</span>
        </div>
        <div class="button-row">
          <button class="secondary-btn" data-action="resume-draft" data-id="${escapeAttr(draft.id)}">Retomar</button>
          <button class="danger-btn" data-action="discard-draft" data-id="${escapeAttr(draft.id)}">Descartar</button>
        </div>
      </article>
    `;
  }

  function renderDraftBuilder(draft) {
    const campaign = activeCampaign();
    const groupIndex = draft.currentGroupIndex || 0;
    const group = draft.groups[groupIndex] || draft.groups[0];
    const pending = draft.pendingProduct || emptyPendingProduct();
    const exactProduct = findProductByName(pending.productName);
    const objectives = exactProduct?.allowedObjectives || [];
    const uses = exactProduct?.allowedUses || [];
    const productOptions = recentProductsFirst().map(p => `<option value="${escapeAttr(p.name)}"></option>`).join('');
    const dateText = group?.date ? isoToTextDate(group.date) : (group?.dateText || '');
    const datePicker = group?.date || '';
    const products = group?.products || [];
    const allGroups = draft.groups || [];

    return `
      <section class="section-card">
        <div class="section-header">
          <div>
            <h2>Registro guiado</h2>
            <p>Autoguardado activo. Borrador ${escapeHtml(draft.id.slice(-6))}.</p>
          </div>
          <span class="tag pending">${allGroups.length} fecha(s)</span>
        </div>
        <div class="inline-fields two">
          <div class="field">
            <span>Fecha manual dd/mm/aaaa</span>
            <input id="draftDateText" data-draft-field="dateText" value="${escapeAttr(dateText)}" inputmode="numeric" placeholder="dd/mm/aaaa">
          </div>
          <div class="field">
            <span>Calendario</span>
            <input id="draftDatePicker" data-draft-field="datePicker" type="date" value="${escapeAttr(datePicker)}">
          </div>
        </div>
        <div class="field">
          <span>Aplicador activo</span>
          <input data-draft-field="applicator" value="${escapeAttr(draft.applicator ?? campaign?.applicator ?? '')}" placeholder="Nombre del aplicador">
          <small>Se guarda con este tratamiento. El valor por campaña puede ajustarse en Más &gt; Ajustes.</small>
        </div>
        <div class="button-row" style="margin-top:12px">
          ${allGroups.map((g, idx) => `<button class="pill-btn ${idx === groupIndex ? 'active' : ''}" data-action="switch-draft-group" data-index="${idx}">${g.date ? formatDate(g.date) : `Fecha ${idx + 1}`}</button>`).join('')}
        </div>
      </section>

      <section class="section-card">
        <div class="section-header">
          <div>
            <h2>Producto de la fecha activa</h2>
            <p>Selecciona un producto verificado o crea uno provisional A verificar.</p>
          </div>
          ${exactProduct ? `<span class="tag ${exactProduct.verificationStatus === 'VERIFIED' ? 'ok' : 'pending'}">${exactProduct.verificationStatus === 'VERIFIED' ? 'Verificado' : 'A verificar'}</span>` : `<span class="tag pending">Provisional</span>`}
        </div>
        <datalist id="productSuggestions">${productOptions}</datalist>
        <div class="field">
          <span>Producto</span>
          <input list="productSuggestions" data-pending-field="productName" value="${escapeAttr(pending.productName || '')}" placeholder="Nombre comercial">
        </div>
        <div class="inline-fields two">
          <div class="field">
            <span>Lote</span>
            <input data-pending-field="lot" value="${escapeAttr(pending.lot || '')}" placeholder="Número de lote o NO PROCEDE">
          </div>
          <div class="field">
            <span>Litros/ha aplicados</span>
            <input data-pending-field="litersPerHa" value="${escapeAttr(pending.litersPerHa || '')}" inputmode="decimal" placeholder="Ej. 400">
          </div>
        </div>
        <div class="field">
          <span>Cultivo / uso</span>
          ${uses.length ? `<select data-pending-field="crop">${renderOptions(uses, pending.crop)}</select>` : `<input data-pending-field="crop" value="${escapeAttr(pending.crop || 'Vid de vinificación')}" placeholder="Cultivo / uso">`}
        </div>
        <div class="field">
          <span>Plaga / patógeno / objetivo</span>
          ${objectives.length > 1 ? `<select data-pending-field="objective">${renderOptions(objectives, pending.objective)}</select>` : objectives.length === 1 ? `<input data-pending-field="objective" value="${escapeAttr(pending.objective || objectives[0])}" readonly>` : `<input data-pending-field="objective" value="${escapeAttr(pending.objective || '')}" placeholder="Objetivo">`}
        </div>
        <div class="field">
          <span>Dosis aplicada</span>
          <input data-pending-field="doseApplied" value="${escapeAttr(pending.doseApplied || '')}" placeholder="Ej. 2 kg/ha, 150 cc/hL">
          ${exactProduct ? `<small>Referencia: ${escapeHtml(exactProduct.doseReference || 'A verificar')}</small>` : `<small>Producto provisional: la dosis quedará A verificar.</small>`}
        </div>
        <div class="field">
          <span>Observaciones opcionales</span>
          <textarea data-pending-field="observations" placeholder="Observaciones">${escapeHtml(pending.observations || '')}</textarea>
        </div>
        <label class="checkbox-row">
          <input type="checkbox" data-pending-field="hasIncidence" ${pending.hasIncidence ? 'checked' : ''}>
          <span>Registrar incidencia / advertencia</span>
        </label>
        ${pending.hasIncidence ? `<div class="field"><span>Detalle de incidencia</span><textarea data-pending-field="incidenceText">${escapeHtml(pending.incidenceText || '')}</textarea></div>` : ''}
        <div class="button-row" style="margin-top:12px">
          <button class="primary-btn" data-action="add-product-to-draft">Añadir producto</button>
          <button class="secondary-btn" data-action="add-draft-group">Nueva fecha</button>
        </div>
      </section>

      <section class="section-card">
        <div class="section-header">
          <div>
            <h2>Resumen provisional</h2>
            <p>Productos incorporados en la fecha activa.</p>
          </div>
          <span class="tag">${products.length} producto(s)</span>
        </div>
        ${products.length ? `<div class="product-list">${products.map((p, idx) => renderDraftProduct(p, idx)).join('')}</div>` : renderEmpty('Aún no hay productos', 'Añade el primer producto de esta fecha.')}
        <div class="button-row" style="margin-top:14px">
          <button class="primary-btn" data-action="finish-draft">FIN / Guardar tratamiento</button>
          <button class="danger-btn" data-action="discard-draft" data-id="${escapeAttr(draft.id)}">Descartar borrador</button>
        </div>
      </section>
    `;
  }

  function renderDraftProduct(item, idx) {
    return `
      <article class="draft-product ${item.verificationStatus === 'PENDING' || item.incidence ? 'warning' : ''}">
        <div class="section-header">
          <div>
            <h3>${escapeHtml(item.productName)}</h3>
            <p>${escapeHtml(item.doseApplied || 'Dosis pendiente')} · ${escapeHtml(String(item.litersPerHa || '—'))} L/ha</p>
          </div>
          <span class="tag ${item.verificationStatus === 'PENDING' ? 'pending' : item.incidence ? 'warn' : 'ok'}">${item.verificationStatus === 'PENDING' ? 'A verificar' : item.incidence ? 'Incidencia' : 'Listo'}</span>
        </div>
        <div class="button-row">
          <button class="ghost-btn" data-action="remove-draft-product" data-index="${idx}">Quitar</button>
        </div>
      </article>
    `;
  }

  function renderLedger() {
    const filtered = filteredLedgerTreatments();
    const view = ui.ledgerView;
    return `
      <section class="section-card ledger-toolbar">
        <div class="section-header">
          <div>
            <h2>Cuaderno</h2>
            <p>Vista móvil, tabla completa y presentación tipo PDF.</p>
          </div>
        </div>
        <div class="inline-fields two">
          <div class="field">
            <span>Buscar en cuaderno</span>
            <input data-ledger-field="query" value="${escapeAttr(ui.ledgerQuery)}" placeholder="Producto, lote, observación…">
          </div>
          <div class="field">
            <span>Filtrar fecha</span>
            <input data-ledger-field="date" type="date" value="${escapeAttr(ui.ledgerDateFilter)}">
          </div>
        </div>
        <div class="tabs">
          <button class="tab-btn ${view === 'mobile' ? 'active' : ''}" data-action="ledger-view" data-view="mobile">Móvil</button>
          <button class="tab-btn ${view === 'table' ? 'active' : ''}" data-action="ledger-view" data-view="table">Tabla completa</button>
          <button class="tab-btn ${view === 'pdf' ? 'active' : ''}" data-action="ledger-view" data-view="pdf">Vista tipo PDF</button>
        </div>
        <div class="button-row">
          <button class="secondary-btn" data-action="export-official-pdf">PDF oficial</button>
          <button class="ghost-btn" data-action="export-compact-pdf">PDF compacto</button>
          <button class="ghost-btn" data-action="export-xls">Excel .xls</button>
          <button class="ghost-btn" data-action="export-csv">CSV</button>
        </div>
      </section>
      ${filtered.length ? renderLedgerView(filtered, view) : renderEmpty('Sin resultados en el cuaderno', 'Ajusta los filtros o importa la carga inicial.')}
    `;
  }

  function renderLedgerView(treatments, view) {
    if (view === 'table') return `<section class="scroll-table">${buildOfficialTable(treatments)}</section>`;
    if (view === 'pdf') return `<section class="pdf-sheet printable-view">${buildPdfSheet(treatments)}</section>`;
    const groups = groupTreatmentsByDate(treatments);
    return groups.map(group => `
      <section class="ledger-group">
        <div class="section-header">
          <div>
            <h3>N.º ${group.ordinal} · ${formatDate(group.date)}</h3>
            <p>${group.rows.length} producto(s)</p>
          </div>
        </div>
        <div class="product-list">
          ${group.rows.map(renderLedgerCard).join('')}
        </div>
      </section>
    `).join('');
  }

  function renderLedgerCard(row) {
    const warning = row.verificationStatus === 'PENDING' || containsPending(row.registration) || containsPending(row.safetyPeriod) || Boolean(row.incidence);
    return `
      <article class="ledger-row-card ${warning ? 'warning' : ''}">
        <div class="section-header">
          <div>
            <h3>${escapeHtml(row.productName)}</h3>
            <p>${escapeHtml(row.doseApplied || '—')} · ${escapeHtml(String(row.litersPerHa ?? '—'))} L/ha · ${escapeHtml(row.objective || '—')}</p>
          </div>
          <span class="tag ${warning ? 'warn' : 'ok'}">${warning ? 'Advertencia' : 'Correcto'}</span>
        </div>
        <div class="kv-grid">
          <div class="kv"><strong>Lote</strong><span>${escapeHtml(row.lot || '—')}</span></div>
          <div class="kv"><strong>P.S.</strong><span>${escapeHtml(row.safetyPeriod || '—')}</span></div>
          <div class="kv"><strong>Campaña</strong><span>${escapeHtml(campaignCountDisplay(row))}</span></div>
          <div class="kv"><strong>MEZCLA</strong><span>${escapeHtml(row.mixRule || '----')}</span></div>
        </div>
        ${row.incidence ? `<div class="warning-block" style="margin-top:10px">${escapeHtml(row.incidence)}</div>` : ''}
        <div class="button-row" style="margin-top:12px">
          <button class="ghost-btn" data-action="edit-treatment" data-id="${escapeAttr(row.id)}">Editar</button>
        </div>
      </article>
    `;
  }

  function renderAlerts() {
    const active = activeAlerts();
    const resolved = resolvedAlerts();
    return `
      <section class="section-card">
        <div class="section-header">
          <div>
            <h2>Alertas activas</h2>
            <p>Pendientes técnicos, incidencias, máximos y revisiones documentales.</p>
          </div>
          <span class="tag ${active.length ? 'warn' : 'ok'}">${active.length}</span>
        </div>
        ${active.length ? `<div class="alert-list">${active.map(renderAlertCard).join('')}</div>` : renderEmpty('Sin alertas activas', 'Las alertas resueltas se conservan en el historial.')}
      </section>
      <section class="section-card">
        <div class="section-header"><div><h2>Historial resuelto</h2><p>Trazabilidad conservada.</p></div><span class="tag">${resolved.length}</span></div>
        ${resolved.length ? `<div class="alert-list">${resolved.map(renderResolvedAlertCard).join('')}</div>` : renderEmpty('Sin alertas resueltas', 'Aún no hay resoluciones registradas.')}
      </section>
    `;
  }

  function renderAlertCard(alert) {
    return `
      <article class="alert-card">
        <div class="section-header">
          <div>
            <h3>${escapeHtml(alert.title || alert.type)}</h3>
            <p>${escapeHtml(alert.description || '')}</p>
          </div>
          <span class="tag warn">${escapeHtml(labelAlertType(alert.type))}</span>
        </div>
        <div class="button-row">
          <button class="primary-btn" data-action="resolve-alert" data-id="${escapeAttr(alert.id)}">Marcar resuelta</button>
        </div>
      </article>
    `;
  }

  function renderAlertCardMini(alert) {
    return `
      <article class="alert-card">
        <h3>${escapeHtml(alert.title || alert.type)}</h3>
        <p>${escapeHtml(alert.description || '')}</p>
      </article>
    `;
  }

  function renderResolvedAlertCard(alert) {
    return `
      <article class="alert-card" style="border-left-color:#a9bfd6">
        <div class="section-header">
          <div>
            <h3>${escapeHtml(alert.title || alert.type)}</h3>
            <p>${escapeHtml(alert.description || '')}</p>
            <p class="muted">Resuelta: ${alert.resolvedAt ? formatDateTime(alert.resolvedAt) : '—'}</p>
          </div>
          <span class="tag ok">Resuelta</span>
        </div>
      </article>
    `;
  }

  function renderMore() {
    switch (ui.morePanel) {
      case 'catalog': return renderCatalog();
      case 'drafts': return renderDraftsPanel();
      case 'copies': return renderCopiesPanel();
      case 'settings': return renderSettingsPanel();
      case 'import': return renderImportPanel();
      default:
        return `
          <section class="section-card">
            <div class="section-header"><div><h2>Más</h2><p>Catálogo, borradores, copias, importación y ajustes.</p></div></div>
            <div class="more-grid">
              <button class="more-tile" data-action="open-more" data-panel="catalog"><strong>Catálogo</strong><span>Productos, verificación y ficha técnica.</span></button>
              <button class="more-tile" data-action="open-more" data-panel="drafts"><strong>Borradores</strong><span>Retomar o descartar procesos.</span></button>
              <button class="more-tile" data-action="open-more" data-panel="import"><strong>Importar</strong><span>Carga inicial, CSV, XLS y JSON.</span></button>
              <button class="more-tile" data-action="open-more" data-panel="copies"><strong>Copias</strong><span>Exportar copia y restaurar.</span></button>
              <button class="more-tile" data-action="open-more" data-panel="settings"><strong>Ajustes</strong><span>Campaña, aplicador y autocomprobación.</span></button>
            </div>
          </section>
        `;
    }
  }

  function renderCatalog() {
    const products = state.products.slice().sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return `
      ${renderBackToMore('Catálogo de productos', 'Verificados, pendientes, activos y archivados.')}
      <section class="section-card">
        ${products.length ? `<div class="product-list">${products.map(renderProductCard).join('')}</div>` : renderEmpty('Catálogo vacío', 'Importa la carga inicial o crea productos provisionales desde Nuevo.')}
      </section>
    `;
  }

  function renderProductCard(product) {
    return `
      <article class="product-card ${product.verificationStatus === 'PENDING' ? 'warning' : ''}">
        <div class="section-header">
          <div>
            <h3>${escapeHtml(product.name)}</h3>
            <p>${escapeHtml(product.registration || 'Sin registro')}</p>
          </div>
          <span class="tag ${product.verificationStatus === 'VERIFIED' ? 'ok' : 'pending'}">${product.verificationStatus === 'VERIFIED' ? 'Verificado' : 'A verificar'}</span>
        </div>
        <div class="product-meta">
          <span class="tag">Máx.: ${product.maxApplications ?? 'NO CONSTA'}</span>
          <span class="tag">MEZCLA: ${escapeHtml(product.mixRule || '----')}</span>
          <span class="tag">Docs: ${(product.documents || []).length}</span>
        </div>
        <div class="button-row" style="margin-top:12px">
          <button class="ghost-btn" data-action="view-product" data-id="${escapeAttr(product.id)}">Ver ficha</button>
          <button class="secondary-btn" data-action="edit-product" data-id="${escapeAttr(product.id)}">Editar ficha</button>
        </div>
      </article>
    `;
  }

  function renderDraftsPanel() {
    const drafts = currentDrafts();
    return `
      ${renderBackToMore('Borradores', 'Autoguardado silencioso y recuperación de procesos.')}
      <section class="section-card">
        ${drafts.length ? `<div class="product-list">${drafts.map(renderDraftChoice).join('')}</div>` : renderEmpty('Sin borradores', 'Los tratamientos en curso aparecerán aquí.')}
      </section>
    `;
  }

  function renderCopiesPanel() {
    return `
      ${renderBackToMore('Copias y restauración', 'Copia completa versionada, restauración por sustituir o fusionar.')}
      <section class="section-card">
        <div class="button-row vertical">
          <button class="primary-btn" data-action="download-backup">Descargar copia completa JSON</button>
          <label class="secondary-btn" style="display:block;text-align:center">Restaurar copia JSON<input id="restoreFile" type="file" accept=".json,application/json" class="hidden" data-action-change="restore-file"></label>
        </div>
        <p class="muted">La restauración permite sustituir o fusionar. Los conflictos en fusión se resuelven antes de sobrescribir.</p>
      </section>
    `;
  }

  function renderSettingsPanel() {
    const campaign = activeCampaign();
    return `
      ${renderBackToMore('Ajustes', 'Campaña, aplicador y autocomprobación funcional.')}
      <section class="section-card">
        <div class="field">
          <span>Campaña activa</span>
          <input value="${escapeAttr(campaign?.name || 'Campaña 2026')}" readonly>
        </div>
        <div class="field">
          <span>Aplicador por defecto de la campaña</span>
          <input id="campaignApplicator" value="${escapeAttr(campaign?.applicator || '')}" placeholder="Nombre del aplicador">
        </div>
        <div class="button-row" style="margin-top:12px">
          <button class="primary-btn" data-action="save-applicator">Guardar aplicador</button>
          <button class="ghost-btn" data-action="run-self-check">Ejecutar autocomprobación</button>
        </div>
      </section>
      <section class="section-card">
        <h2>Versión</h2>
        <div class="kv-grid">
          <div class="kv"><strong>App</strong><span>${APP_VERSION}</span></div>
          <div class="kv"><strong>Esquema</strong><span>${SCHEMA_VERSION}</span></div>
          <div class="kv"><strong>Tratamientos</strong><span>${activeTreatments().length}</span></div>
          <div class="kv"><strong>Alertas activas</strong><span>${activeAlerts().length}</span></div>
        </div>
      </section>
    `;
  }

  function renderImportPanel() {
    const preview = ui.importPreview;
    return `
      ${renderBackToMore('Importación', 'Carga inicial estructurada, CSV, XLS compatible y JSON.')}
      <section class="section-card">
        <label class="primary-btn" style="display:block;text-align:center">Seleccionar archivo<input id="importFile" type="file" accept=".json,.csv,.xls,.xlsx,application/json,text/csv,application/vnd.ms-excel" class="hidden" data-action-change="import-file"></label>
        <p class="muted">La carga privada de tratamientos debe importarse localmente. La app pública no la contiene.</p>
      </section>
      ${preview ? renderImportPreview(preview) : ''}
    `;
  }

  function renderImportPreview(preview) {
    if (preview.kind === 'structured') {
      const data = preview.data;
      return `
        <section class="section-card">
          <div class="section-header"><div><h2>Vista previa de carga estructurada</h2><p>${escapeHtml(data.sourceDocument || 'Archivo JSON')}</p></div><span class="tag ok">Compatible</span></div>
          <div class="metric-grid">
            <article class="metric-card"><strong>${data.products?.length || 0}</strong><span>Productos</span></article>
            <article class="metric-card"><strong>${data.treatments?.length || 0}</strong><span>Aplicaciones</span></article>
            <article class="metric-card"><strong>${data.alerts?.length || 0}</strong><span>Alertas</span></article>
            <article class="metric-card"><strong>${data.summary?.treatmentDates ?? treatmentDatesCount(data.treatments || [])}</strong><span>Fechas</span></article>
          </div>
          <div class="button-row" style="margin-top:14px">
            <button class="primary-btn" data-action="apply-structured-import" data-mode="replace">Importar sustituyendo datos locales</button>
            <button class="secondary-btn" data-action="apply-structured-import" data-mode="merge">Importar fusionando</button>
          </div>
        </section>
      `;
    }
    if (preview.kind === 'tabular') {
      return `
        <section class="section-card">
          <div class="section-header"><div><h2>Vista previa tabular</h2><p>${preview.rows.length} fila(s) leídas. Mapea columnas antes de importar.</p></div><span class="tag pending">Revisar</span></div>
          <div class="import-preview">${buildPreviewTable(preview.headers, preview.rows.slice(0, 5))}</div>
          <div class="import-mapping" style="margin-top:14px">
            ${IMPORT_KEYS.map(([key, label]) => `
              <div class="field">
                <span>${escapeHtml(label)}</span>
                <select data-import-map="${escapeAttr(key)}">
                  <option value="">— No importar —</option>
                  ${preview.headers.map(header => `<option value="${escapeAttr(header)}" ${preview.mapping?.[key] === header ? 'selected' : ''}>${escapeHtml(header)}</option>`).join('')}
                </select>
              </div>
            `).join('')}
          </div>
          <div class="button-row" style="margin-top:14px">
            <button class="primary-btn" data-action="apply-tabular-import">Importar filas mapeadas</button>
          </div>
        </section>
      `;
    }
    return '';
  }

  function renderBackToMore(title, subtitle) {
    return `
      <section class="section-card">
        <div class="section-header">
          <div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div>
          <button class="ghost-btn compact" data-action="back-more">Volver</button>
        </div>
      </section>
    `;
  }

  function renderEmpty(title, text) {
    return `<div class="empty-card"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div>`;
  }

  function handleScreenClick(event) {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'go-new') return navigate('new');
    if (action === 'go-ledger') return navigate('ledger');
    if (action === 'go-alerts') return navigate('alerts');
    if (action === 'go-import') { ui.screen = 'more'; ui.morePanel = 'import'; syncNav(); return render(); }
    if (action === 'open-drafts') { ui.screen = 'more'; ui.morePanel = 'drafts'; syncNav(); return render(); }
    if (action === 'open-more') { ui.morePanel = btn.dataset.panel; return render(); }
    if (action === 'back-more') { ui.morePanel = null; return render(); }
    if (action === 'start-draft') return startDraft();
    if (action === 'resume-draft') { ui.currentDraftId = btn.dataset.id; ui.screen = 'new'; syncNav(); return render(); }
    if (action === 'discard-draft') return discardDraft(btn.dataset.id);
    if (action === 'switch-draft-group') return switchDraftGroup(Number(btn.dataset.index));
    if (action === 'add-draft-group') return addDraftGroup();
    if (action === 'add-product-to-draft') return addProductToDraft();
    if (action === 'remove-draft-product') return removeDraftProduct(Number(btn.dataset.index));
    if (action === 'finish-draft') return finishDraft();
    if (action === 'ledger-view') { ui.ledgerView = btn.dataset.view; return render(); }
    if (action === 'export-official-pdf') return exportOfficialPdf();
    if (action === 'export-compact-pdf') return exportCompactPdf();
    if (action === 'export-xls') return exportXls();
    if (action === 'export-csv') return exportCsv();
    if (action === 'resolve-alert') return resolveAlert(btn.dataset.id);
    if (action === 'view-product') return showProductModal(btn.dataset.id);
    if (action === 'edit-product') return showProductEditChoice(btn.dataset.id);
    if (action === 'save-applicator') return saveCampaignApplicator();
    if (action === 'run-self-check') return runSelfCheck();
    if (action === 'download-backup') return downloadBackup();
    if (action === 'apply-structured-import') return applyStructuredImport(btn.dataset.mode);
    if (action === 'apply-tabular-import') return applyTabularImport();
    if (action === 'edit-treatment') return showEditTreatmentModal(btn.dataset.id);
  }

  function handleModalHostClick(event) {
    const btn = event.target.closest('[data-modal-action]');
    if (!btn) return;
    const action = btn.dataset.modalAction;
    if (action === 'view-product-doc') return showProductDocumentViewer(btn.dataset.productId, btn.dataset.docId);
    if (action === 'zoom-product-doc-image') return showProductImageZoomViewer(btn.dataset.productId, btn.dataset.docId);
    if (action === 'delete-product-doc') return deleteProductDocument(btn.dataset.productId, btn.dataset.docId);
    if (action === 'add-product-docs') {
      els.modalHost.innerHTML = '';
      return showProductDocumentIntakeModal(btn.dataset.productId);
    }
  }

  function handleModalHostChange(event) {
    if (event.target.matches('[data-dose-ui-mode], [data-dose-fixed-unit], [data-dose-range-unit], [data-dose-concentration-kind], [data-dose-concentration-unit]')) {
      return syncReviewDoseRulePanels(event.target.closest('[data-dose-review-editor]'));
    }
    if (event.target.matches('[data-volume-ui-mode]')) {
      return syncReviewVolumeReferencePanels(event.target.closest('[data-review-volume-editor="volumeReference"]'));
    }
    const reviewVolumeField = event.target.dataset.reviewVolumeField;
    if (reviewVolumeField === 'volumeReference.mode') {
      return syncReviewVolumeReferencePanels(event.target.closest('[data-review-volume-editor="volumeReference"]'));
    }
    const reviewVolumeRuleField = event.target.dataset.reviewRuleField;
    if (reviewVolumeRuleField === 'volumeRule.mode') {
      return syncReviewVolumeRulePanels(event.target.closest('[data-review-rule="volumeRule"]'), event.target.value || '');
    }
    if (event.target.matches('[data-edit-volume-ui-mode]')) {
      return syncEditProductVolumePanels(event.target.closest('[data-edit-volume-editor]'));
    }
  }

  function handleScreenInput(event) {
    const draftField = event.target.dataset.draftField;
    const pendingField = event.target.dataset.pendingField;
    const ledgerField = event.target.dataset.ledgerField;
    if (draftField) updateDraftField(draftField, event.target);
    if (pendingField) updatePendingField(pendingField, event.target);
    if (ledgerField === 'query') { ui.ledgerQuery = event.target.value || ''; renderLedgerResultsWithoutLosingFocus(); }
    if (ledgerField === 'date') { ui.ledgerDateFilter = event.target.value || ''; render(); }
  }

  function handleScreenChange(event) {
    const changeAction = event.target.dataset.actionChange;
    if (changeAction === 'import-file') return readImportFile(event.target.files?.[0]);
    if (changeAction === 'restore-file') return readRestoreFile(event.target.files?.[0]);
    const pendingField = event.target.dataset.pendingField;
    const draftField = event.target.dataset.draftField;
    if (draftField) updateDraftField(draftField, event.target);
    if (pendingField) updatePendingField(pendingField, event.target);
    const importMap = event.target.dataset.importMap;
    if (importMap && ui.importPreview?.kind === 'tabular') {
      ui.importPreview.mapping ||= {};
      ui.importPreview.mapping[importMap] = event.target.value || '';
    }
  }

  function renderLedgerResultsWithoutLosingFocus() {
    const focused = document.activeElement;
    const selection = focused && typeof focused.selectionStart === 'number' ? [focused.selectionStart, focused.selectionEnd] : null;
    render();
    const replacement = els.screen.querySelector('[data-ledger-field="query"]');
    if (replacement) {
      replacement.focus({ preventScroll: true });
      if (selection) replacement.setSelectionRange(selection[0], selection[1]);
    }
  }

  function startDraft() {
    const now = new Date().toISOString();
    const campaign = activeCampaign();
    const draft = {
      id: `d_${cryptoRandom()}`,
      campaignId: state.activeCampaignId,
      applicator: campaign?.applicator || '',
      groups: [{ id: `g_${cryptoRandom()}`, date: '', dateText: '', products: [] }],
      currentGroupIndex: 0,
      pendingProduct: emptyPendingProduct(),
      createdAt: now,
      updatedAt: now
    };
    state.drafts.push(draft);
    ui.currentDraftId = draft.id;
    saveState();
    render();
  }

  function emptyPendingProduct() {
    return {
      productName: '',
      lot: '',
      doseApplied: '',
      litersPerHa: '',
      crop: 'Vid de vinificación',
      objective: '',
      observations: '',
      hasIncidence: false,
      incidenceText: ''
    };
  }

  function currentDraft() {
    return state.drafts.find(d => d.id === ui.currentDraftId);
  }

  function currentDraftGroup(draft = currentDraft()) {
    return draft?.groups?.[draft.currentGroupIndex || 0];
  }

  async function discardDraft(id) {
    const first = await confirmDialog('Descartar borrador', 'Primera confirmación: se perderá este borrador.', 'Continuar', 'Cancelar');
    if (!first) return;
    const second = await confirmDialog('Confirmación final', 'Segunda confirmación: el borrador se eliminará definitivamente.', 'Descartar', 'Cancelar');
    if (!second) return;
    state.drafts = state.drafts.filter(d => d.id !== id);
    if (ui.currentDraftId === id) ui.currentDraftId = null;
    await saveState();
    toast('Borrador descartado.');
    render();
  }

  function switchDraftGroup(index) {
    const draft = currentDraft();
    if (!draft || !draft.groups[index]) return;
    draft.currentGroupIndex = index;
    draft.updatedAt = new Date().toISOString();
    saveState();
    render();
  }

  function addDraftGroup() {
    const draft = currentDraft();
    if (!draft) return;
    const group = currentDraftGroup(draft);
    if (!group?.date) {
      toast('Completa la fecha actual antes de abrir una nueva.');
      return;
    }
    draft.groups.push({ id: `g_${cryptoRandom()}`, date: '', dateText: '', products: [] });
    draft.currentGroupIndex = draft.groups.length - 1;
    draft.pendingProduct = emptyPendingProduct();
    draft.updatedAt = new Date().toISOString();
    saveState();
    render();
  }

  async function updateDraftField(field, target) {
    const draft = currentDraft();
    if (!draft) return;
    const group = currentDraftGroup(draft);
    if (field === 'dateText') {
      group.dateText = target.value || '';
      const parsed = textDateToIso(group.dateText);
      if (parsed) group.date = parsed;
    }
    if (field === 'datePicker') {
      group.date = target.value || '';
      group.dateText = group.date ? isoToTextDate(group.date) : '';
      if (group.date) {
        const dateTextInput = els.screen.querySelector('[data-draft-field="dateText"]');
        if (dateTextInput) dateTextInput.value = group.dateText;
      }
    }
    if (field === 'applicator') draft.applicator = target.value || '';
    draft.updatedAt = new Date().toISOString();
    await saveState();
  }

  async function updatePendingField(field, target) {
    const draft = currentDraft();
    if (!draft) return;
    draft.pendingProduct ||= emptyPendingProduct();
    if (field === 'hasIncidence') {
      draft.pendingProduct.hasIncidence = Boolean(target.checked);
      if (!target.checked) draft.pendingProduct.incidenceText = '';
      await saveState();
      render();
      return;
    }
    draft.pendingProduct[field] = target.value || '';
    if (field === 'productName') {
      const product = findProductByName(target.value || '');
      if (product) {
        if (!draft.pendingProduct.objective && product.allowedObjectives?.length === 1) draft.pendingProduct.objective = product.allowedObjectives[0];
        if (!draft.pendingProduct.crop && product.allowedUses?.length === 1) draft.pendingProduct.crop = product.allowedUses[0];
      }
    }
    draft.updatedAt = new Date().toISOString();
    await saveState();
  }

  async function addProductToDraft() {
    const draft = currentDraft();
    const group = currentDraftGroup(draft);
    if (!draft || !group) return;
    const dateOk = await validateGroupDate(group);
    if (!dateOk) return;
    const p = { ...(draft.pendingProduct || emptyPendingProduct()) };
    if (!p.productName?.trim()) return toast('Indica el producto.');
    if (!p.lot?.trim()) return toast('Indica el lote o NO PROCEDE.');
    if (!p.doseApplied?.trim()) return toast('Indica la dosis aplicada.');
    if (!p.litersPerHa?.trim()) return toast('Indica los litros/ha aplicados.');
    if (!p.crop?.trim()) return toast('Indica cultivo / uso.');
    if (!p.objective?.trim()) return toast('Indica plaga, patógeno u objetivo.');
    if (group.products.some(item => normalizeText(item.productName) === normalizeText(p.productName))) {
      return toast('Ese producto ya está registrado en la misma fecha.');
    }

    let product = findProductByName(p.productName);
    if (!product) {
      const ok = await confirmDialog('Producto provisional', 'No existe en el catálogo. Se creará como A verificar.', 'Crear provisional', 'Cancelar');
      if (!ok) return;
      product = createProvisionalProduct(p.productName, p.crop, p.objective);
      state.products.push(product);
    }

    const validation = validateEntryAgainstProduct(product, p.doseApplied, p.litersPerHa);
    let incidence = p.hasIncidence ? (p.incidenceText || 'Incidencia registrada manualmente.') : '';
    if (!validation.ok) {
      const keep = await confirmDialog(
        'Validación técnica',
        `<p>${validation.messages.map(escapeHtml).join('<br>')}</p><p>¿Conservar el dato como incidencia controlada?</p>`,
        'Conservar con incidencia',
        'Corregir'
      );
      if (!keep) return;
      incidence = [incidence, ...validation.messages].filter(Boolean).join(' | ');
    }

    const entry = buildDraftProductEntry(product, p, incidence);
    group.products.push(entry);
    draft.pendingProduct = emptyPendingProduct();
    draft.updatedAt = new Date().toISOString();
    await saveState();
    toast('Producto añadido al borrador.');
    render();
  }

  function buildDraftProductEntry(product, pending, incidence) {
    return {
      tempId: `dp_${cryptoRandom()}`,
      productId: product.id,
      productName: product.name,
      registration: product.registration || 'A verificar',
      lot: pending.lot.trim(),
      doseReference: product.doseReference || 'A verificar',
      doseApplied: pending.doseApplied.trim(),
      volumeReference: product.volumeReference || 'A verificar',
      litersPerHa: normalizeNumericString(pending.litersPerHa),
      crop: pending.crop.trim(),
      objective: pending.objective.trim(),
      safetyPeriod: product.safetyPeriod || 'A verificar',
      activeIngredients: product.activeIngredients || 'A verificar',
      mixRule: product.mixRule || 'A verificar',
      verificationStatus: product.verificationStatus || 'PENDING',
      observations: pending.observations?.trim() || '',
      incidence: incidence || '',
      snapshot: buildSnapshot(product)
    };
  }

  async function removeDraftProduct(index) {
    const draft = currentDraft();
    const group = currentDraftGroup(draft);
    if (!group?.products?.[index]) return;
    group.products.splice(index, 1);
    draft.updatedAt = new Date().toISOString();
    await saveState();
    render();
  }

  async function finishDraft() {
    const draft = currentDraft();
    if (!draft) return;
    for (const group of draft.groups) {
      const dateOk = await validateGroupDate(group);
      if (!dateOk) return;
      if (!group.products?.length) return toast(`La fecha ${group.date ? formatDate(group.date) : 'pendiente'} no tiene productos.`);
      const hasSolo = group.products.some(p => p.mixRule === 'SOLO');
      if (hasSolo && group.products.length > 1) {
        const ok = await confirmDialog(
          'Regla SOLO',
          `Hay un producto marcado SOLO en ${formatDate(group.date)} junto con otros productos. Confirma que se aplicó en cubas distintas o mediante una gestión equivalente.`,
          'Confirmar gestión separada',
          'Cancelar'
        );
        if (!ok) return;
      }
    }

    const now = new Date().toISOString();
    const campaign = activeCampaign();
    const createdTreatments = [];
    const createdAlerts = [];
    for (const group of draft.groups) {
      for (const entry of group.products) {
        const treatment = {
          id: `t_${cryptoRandom()}`,
          campaignId: state.activeCampaignId,
          date: group.date,
          applicator: draft.applicator || campaign?.applicator || '',
          productId: entry.productId,
          productName: entry.productName,
          registration: entry.registration,
          lot: entry.lot,
          doseReference: entry.doseReference,
          doseApplied: entry.doseApplied,
          volumeReference: entry.volumeReference,
          litersPerHa: Number(entry.litersPerHa) || entry.litersPerHa,
          crop: entry.crop,
          objective: entry.objective,
          safetyPeriod: entry.safetyPeriod,
          activeIngredients: entry.activeIngredients,
          mixRule: entry.mixRule,
          verificationStatus: entry.verificationStatus,
          observations: entry.observations,
          incidence: entry.incidence,
          snapshot: entry.snapshot,
          createdAt: now,
          updatedAt: now
        };
        createdTreatments.push(treatment);
        if (treatment.verificationStatus === 'PENDING' || containsPending(treatment.registration) || containsPending(treatment.doseReference) || containsPending(treatment.volumeReference) || containsPending(treatment.safetyPeriod)) {
          createdAlerts.push(buildAlert('A_VERIFY', `Tratamiento A verificar: ${treatment.productName}`, `Registro del ${formatDate(treatment.date)} con campos pendientes técnicos.`, treatment.productId, treatment.id));
        }
        if (treatment.incidence) {
          createdAlerts.push(buildAlert('INCIDENT', `Incidencia: ${treatment.productName}`, treatment.incidence, treatment.productId, treatment.id));
        }
      }
    }
    state.treatments.push(...createdTreatments);
    state.alerts.push(...createdAlerts);
    state.drafts = state.drafts.filter(d => d.id !== draft.id);
    ui.currentDraftId = null;
    await saveState();
    toast('Tratamiento guardado.');
    ui.screen = 'ledger';
    ui.ledgerView = 'mobile';
    syncNav();
    render();
  }

  async function validateGroupDate(group) {
    const iso = group.date || textDateToIso(group.dateText || '');
    if (!iso) {
      toast('Indica una fecha válida en formato dd/mm/aaaa o calendario.');
      return false;
    }
    group.date = iso;
    if (isFutureDate(iso)) {
      const first = await confirmDialog('Fecha futura', `La fecha ${formatDate(iso)} es posterior a hoy. Primera confirmación requerida.`, 'Continuar', 'Corregir');
      if (!first) return false;
      const second = await confirmDialog('Doble verificación', 'Segunda confirmación: conservar fecha futura bajo advertencia.', 'Confirmar fecha futura', 'Cancelar');
      if (!second) return false;
    }
    return true;
  }

  function createProvisionalProduct(name, crop, objective) {
    const now = new Date().toISOString();
    return {
      id: `p_${cryptoRandom()}`,
      name: name.trim(),
      registration: 'A verificar',
      verificationStatus: 'PENDING',
      doseReference: 'A verificar',
      doseRule: { mode: 'pending' },
      volumeReference: 'A verificar',
      volumeRule: { mode: 'pending' },
      safetyPeriod: 'A verificar',
      maxApplications: null,
      activeIngredients: 'A verificar',
      mixRule: 'A verificar',
      applicationInterval: '',
      applicationStage: '',
      allowedUses: crop ? [crop.trim()] : [],
      allowedObjectives: objective ? [objective.trim()] : [],
      nonPhytosanitary: false,
      archived: false,
      verifiedAt: null,
      source: 'Alta provisional desde la app',
      notes: '',
      createdAt: now,
      updatedAt: now
    };
  }

  function buildSnapshot(product) {
    return {
      doseReference: product.doseReference || 'A verificar',
      volumeReference: product.volumeReference || 'A verificar',
      safetyPeriod: product.safetyPeriod || 'A verificar',
      activeIngredients: product.activeIngredients || 'A verificar',
      mixRule: product.mixRule || 'A verificar',
      verificationStatus: product.verificationStatus || 'PENDING',
      registration: product.registration || 'A verificar',
      maxApplications: product.maxApplications ?? null,
      doseRule: deepClone(product.doseRule || { mode: 'pending' }),
      volumeRule: deepClone(product.volumeRule || { mode: 'pending' })
    };
  }

  function validateEntryAgainstProduct(product, doseApplied, litersPerHa) {
    if (!product || product.verificationStatus !== 'VERIFIED') return { ok: true, messages: [] };
    const dose = parseDose(doseApplied);
    const liters = Number(normalizeNumericString(litersPerHa));
    const messages = [];
    if (!dose || !Number.isFinite(dose.value)) messages.push('No se puede interpretar la dosis aplicada.');
    if (!Number.isFinite(liters) || liters <= 0) messages.push('Los litros/ha no son válidos.');
    if (messages.length) return { ok: false, messages };

    const rule = product.doseRule || { mode: 'pending' };
    const volumeRule = product.volumeRule || { mode: 'pending' };
    if (volumeRule.mode === 'fixed' && !nearlyEqual(liters, Number(volumeRule.value))) {
      messages.push(`Litros/ha distintos del volumen único: ${liters} frente a ${volumeRule.value} ${volumeRule.unit}.`);
    }
    if (volumeRule.mode === 'range' && (liters < volumeRule.min || liters > volumeRule.max)) {
      messages.push(`Litros/ha fuera de rango: ${liters} frente a ${volumeRule.min}-${volumeRule.max} ${volumeRule.unit}.`);
    }

    const normalized = normalizeDoseForRule(dose, rule);
    switch (rule.mode) {
      case 'fixed': {
        const expected = Number(rule.value);
        if (!nearlyEqual(normalized.ruleValue, expected)) messages.push(`Dosis distinta de la dosis única: ${normalized.ruleValue ?? dose.value} frente a ${expected} ${rule.displayUnit}.`);
        break;
      }
      case 'range': {
        const comparable = doseToComparableValue(dose, rule.displayUnit);
        if (!Number.isFinite(comparable) || comparable < rule.min || comparable > rule.max) {
          messages.push(`Dosis fuera de rango: ${formatDecimal(comparable)} ${rule.displayUnit} frente a ${rule.min}-${rule.max} ${rule.displayUnit}.`);
        }
        break;
      }
      case 'concentration_range_with_ha_limit': {
        const concPercent = doseToPercentPer100L(dose, liters);
        const perHa = doseToPerHaValue(dose, rule.perHaLimitUnit);
        if (!Number.isFinite(concPercent) || concPercent < rule.min || concPercent > rule.max) {
          messages.push(`Concentración calculada fuera de rango: ${formatDecimal(concPercent)} % frente a ${rule.min}-${rule.max} %.`);
        }
        if (!Number.isFinite(perHa) || perHa > rule.perHaLimit) {
          messages.push(`Límite por hectárea superado o no verificable: ${formatDecimal(perHa)} ${rule.perHaLimitUnit} frente a máximo ${rule.perHaLimit} ${rule.perHaLimitUnit}.`);
        }
        break;
      }
      case 'concentration_hl_range_with_ha_limit': {
        const conc = doseToConcentrationPerHl(dose, liters, rule.displayUnit);
        const perHa = doseToPerHaValue(dose, rule.perHaLimitUnit);
        if (!Number.isFinite(conc) || conc < rule.min || conc > rule.max) {
          messages.push(`Concentración calculada fuera de rango: ${formatDecimal(conc)} ${rule.displayUnit} frente a ${rule.min}-${rule.max} ${rule.displayUnit}.`);
        }
        if (!Number.isFinite(perHa) || perHa > rule.perHaLimit) {
          messages.push(`Límite por hectárea superado o no verificable: ${formatDecimal(perHa)} ${rule.perHaLimitUnit} frente a máximo ${rule.perHaLimit} ${rule.perHaLimitUnit}.`);
        }
        break;
      }
      case 'concentration_fixed_with_ha_limit': {
        const concPercent = doseToPercentPer100L(dose, liters);
        const perHa = doseToPerHaValue(dose, rule.perHaLimitUnit);
        if (!Number.isFinite(concPercent) || !nearlyEqual(concPercent, rule.value)) {
          messages.push(`Concentración calculada distinta de la referencia: ${formatDecimal(concPercent)} % frente a ${rule.value} %.`);
        }
        if (!Number.isFinite(perHa) || perHa > rule.perHaLimit) {
          messages.push(`Límite por hectárea superado o no verificable: ${formatDecimal(perHa)} ${rule.perHaLimitUnit} frente a máximo ${rule.perHaLimit} ${rule.perHaLimitUnit}.`);
        }
        break;
      }
      case 'concentration_hl_range': {
        const conc = doseToDeclaredConcentration(dose, rule.displayUnit);
        if (!Number.isFinite(conc) || conc < rule.min || conc > rule.max) {
          messages.push(`Dosis fuera de rango: ${formatDecimal(conc)} ${rule.displayUnit} frente a ${rule.min}-${rule.max} ${rule.displayUnit}.`);
        }
        break;
      }
      default:
        break;
    }

    return { ok: messages.length === 0, messages };
  }

  function parseDose(raw) {
    const text = String(raw || '').trim().replace(/,/g, '.');
    const match = text.match(/(-?\d+(?:\.\d+)?)\s*(.*)$/i);
    if (!match) return null;
    return { value: Number(match[1]), unit: normalizeUnit(match[2] || '') };
  }

  function normalizeUnit(unit) {
    return String(unit || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace('litros', 'l')
      .replace('l/ha', 'l/ha')
      .replace('kg/ha', 'kg/ha')
      .replace('cc/ha', 'cc/ha')
      .replace('ml/ha', 'cc/ha')
      .replace('g/100l', 'g/100l')
      .replace('g/hl', 'g/hl')
      .replace('cc/hl', 'cc/hl')
      .replace('ml/hl', 'cc/hl')
      .replace('%', '%');
  }

  function normalizeDoseForRule(dose, rule) {
    if (!dose || !rule) return { ruleValue: null };
    if (rule.mode === 'fixed') {
      if (rule.displayUnit === 'L/ha' && dose.unit === 'cc/ha') return { ruleValue: dose.value / 1000 };
      if (rule.displayUnit === 'kg/ha' && dose.unit === 'g/ha') return { ruleValue: dose.value / 1000 };
      return { ruleValue: dose.value };
    }
    return { ruleValue: dose.value };
  }

  function doseToPerHaValue(dose, targetUnit) {
    if (!dose) return NaN;
    if (targetUnit === 'kg/ha') {
      if (dose.unit === 'kg/ha') return dose.value;
      if (dose.unit === 'g/ha') return dose.value / 1000;
    }
    if (targetUnit === 'L/ha') {
      if (dose.unit === 'l/ha') return dose.value;
      if (dose.unit === 'cc/ha') return dose.value / 1000;
    }
    return NaN;
  }

  function doseToComparableValue(dose, displayUnit) {
    if (!dose) return NaN;
    const display = normalizeUnit(displayUnit);
    if (display === 'kg/ha') {
      if (dose.unit === 'kg/ha') return dose.value;
      if (dose.unit === 'g/ha') return dose.value / 1000;
    }
    if (display === 'l/ha') {
      if (dose.unit === 'l/ha') return dose.value;
      if (dose.unit === 'cc/ha') return dose.value / 1000;
    }
    if (display === 'g/ha') {
      if (dose.unit === 'g/ha') return dose.value;
      if (dose.unit === 'kg/ha') return dose.value * 1000;
    }
    if (display === 'cc/ha') {
      if (dose.unit === 'cc/ha') return dose.value;
      if (dose.unit === 'l/ha') return dose.value * 1000;
    }
    if (display === '%') return dose.unit === '%' ? dose.value : NaN;
    return doseToDeclaredConcentration(dose, displayUnit);
  }

  function doseToPercentPer100L(dose, litersPerHa) {
    if (!dose || !Number.isFinite(litersPerHa) || litersPerHa <= 0) return NaN;
    if (dose.unit === '%') return dose.value;
    if (dose.unit === 'kg/ha') return dose.value / litersPerHa * 100;
    if (dose.unit === 'l/ha') return dose.value / litersPerHa * 100;
    if (dose.unit === 'cc/ha') return (dose.value / 1000) / litersPerHa * 100;
    return NaN;
  }

  function doseToConcentrationPerHl(dose, litersPerHa, displayUnit) {
    if (!dose || !Number.isFinite(litersPerHa) || litersPerHa <= 0) return NaN;
    if (displayUnit.toLowerCase().includes('g') && dose.unit === 'kg/ha') return dose.value * 1000 / litersPerHa * 100;
    if (displayUnit.toLowerCase().includes('g') && dose.unit === 'g/ha') return dose.value / litersPerHa * 100;
    if (displayUnit.toLowerCase().includes('cc') && dose.unit === 'l/ha') return dose.value * 1000 / litersPerHa * 100;
    if (displayUnit.toLowerCase().includes('cc') && dose.unit === 'cc/ha') return dose.value / litersPerHa * 100;
    if ((displayUnit === 'g/hL' || displayUnit === 'g/100 L') && dose.unit === 'g/hl') return dose.value;
    if ((displayUnit === 'cc/hL' || displayUnit === 'cc/100 L') && dose.unit === 'cc/hl') return dose.value;
    return NaN;
  }

  function doseToDeclaredConcentration(dose, displayUnit) {
    if (!dose) return NaN;
    const display = String(displayUnit || '').toLowerCase();
    if (display.includes('g') && dose.unit === 'g/hl') return dose.value;
    if (display.includes('cc') && dose.unit === 'cc/hl') return dose.value;
    return NaN;
  }

  function nearlyEqual(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return Math.abs(a - b) <= Math.max(0.0001, Math.abs(b) * 0.0005);
  }

  function findProductByName(name) {
    const needle = normalizeText(name);
    return state.products.find(product => normalizeText(product.name) === needle);
  }

  function findProduct(id) {
    return state.products.find(p => p.id === id);
  }

  function findTreatment(id) {
    return state.treatments.find(t => t.id === id);
  }

  function recentProductsFirst() {
    const usage = new Map();
    activeTreatments().slice().sort(sortTreatmentDesc).forEach((row, idx) => {
      if (!usage.has(row.productName)) usage.set(row.productName, idx);
    });
    return state.products.slice().sort((a, b) => {
      const ai = usage.has(a.name) ? usage.get(a.name) : Number.MAX_SAFE_INTEGER;
      const bi = usage.has(b.name) ? usage.get(b.name) : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name, 'es');
    });
  }

  function filteredLedgerTreatments() {
    const q = normalizeText(ui.ledgerQuery);
    return activeTreatments().filter(row => {
      if (ui.ledgerDateFilter && row.date !== ui.ledgerDateFilter) return false;
      if (!q) return true;
      const haystack = normalizeText([
        row.productName, row.registration, row.lot, row.doseApplied, row.crop, row.objective,
        row.safetyPeriod, row.activeIngredients, row.mixRule, row.observations, row.incidence
      ].join(' '));
      return haystack.includes(q);
    }).sort(sortTreatmentAsc);
  }

  function renderGlobalSearchResults() {
    const q = normalizeText(ui.searchQuery);
    if (!q) {
      els.globalSearchResults.innerHTML = '';
      els.globalSearchResults.classList.add('hidden');
      return;
    }
    const treatments = activeTreatments().filter(row => normalizeText([
      row.productName, row.registration, row.lot, row.objective, row.observations, row.incidence
    ].join(' ')).includes(q)).slice(0, 5);
    const products = state.products.filter(product => normalizeText([
      product.name, product.registration, product.activeIngredients, product.notes
    ].join(' ')).includes(q)).slice(0, 5);
    const alerts = activeAlerts().filter(alert => normalizeText([
      alert.title, alert.description, alert.type
    ].join(' ')).includes(q)).slice(0, 5);
    const items = [
      ...treatments.map(row => `<button class="search-result" data-search-target="treatment" data-search-id="${escapeAttr(row.id)}"><strong>Tratamiento: ${escapeHtml(row.productName)}</strong><small>${formatDate(row.date)} · ${escapeHtml(row.objective || '')}</small></button>`),
      ...products.map(product => `<button class="search-result" data-search-target="product" data-search-id="${escapeAttr(product.id)}"><strong>Producto: ${escapeHtml(product.name)}</strong><small>${escapeHtml(product.registration || '')}</small></button>`),
      ...alerts.map(alert => `<button class="search-result" data-search-target="alert" data-search-id="${escapeAttr(alert.id)}"><strong>Alerta: ${escapeHtml(alert.title || alert.type)}</strong><small>${escapeHtml(alert.description || '')}</small></button>`)
    ];
    els.globalSearchResults.innerHTML = items.length ? items.join('') : `<div class="search-result"><strong>Sin coincidencias</strong><small>No hay resultados para la búsqueda.</small></div>`;
    els.globalSearchResults.classList.remove('hidden');
  }

  function treatmentDatesCount(rows) {
    return new Set((rows || []).map(row => row.date)).size;
  }

  function sortTreatmentAsc(a, b) {
    return `${a.date}|${a.createdAt || ''}|${a.id}`.localeCompare(`${b.date}|${b.createdAt || ''}|${b.id}`);
  }

  function sortTreatmentDesc(a, b) {
    return sortTreatmentAsc(b, a);
  }

  function groupTreatmentsByDate(rows) {
    const sorted = rows.slice().sort(sortTreatmentAsc);
    const ordinals = ordinalMapForRows(activeTreatments());
    const map = new Map();
    sorted.forEach(row => {
      if (!map.has(row.date)) map.set(row.date, { date: row.date, ordinal: ordinals.get(row.date), rows: [] });
      map.get(row.date).rows.push(row);
    });
    return Array.from(map.values());
  }

  function ordinalMapForRows(rows) {
    const dates = Array.from(new Set(rows.map(row => row.date))).sort();
    return new Map(dates.map((date, idx) => [date, idx + 1]));
  }

  function campaignCountDisplay(row) {
    if (row.verificationStatus === 'PENDING' || containsPending(row.snapshot?.maxApplications) || containsPending(row.registration)) return 'A verificar';
    const product = findProduct(row.productId);
    const max = row.snapshot?.maxApplications ?? product?.maxApplications;
    if (max === null || max === undefined || max === '' || String(max).toUpperCase() === 'NO CONSTA') return 'NO CONSTA';
    const same = activeTreatments().slice().sort(sortTreatmentAsc).filter(t => t.productId === row.productId);
    const idx = same.findIndex(t => t.id === row.id);
    return idx >= 0 ? `${idx + 1}/${max}` : `—/${max}`;
  }

  function buildOfficialTable(rows) {
    const ordinals = ordinalMapForRows(activeTreatments());
    const head = OFFICIAL_COLUMNS.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('');
    const body = rows.slice().sort(sortTreatmentAsc).map(row => {
      const values = officialValues(row, ordinals);
      return `<tr>${OFFICIAL_COLUMNS.map(([key]) => {
        const val = values[key];
        const warning = isWarningCell(row, key, val);
        return `<td class="${warning ? 'warning-cell' : ''} ${['productName','activeIngredients','doseReference','volumeReference'].includes(key) ? 'text-left' : ''}">${escapeHtml(String(val ?? '—'))}</td>`;
      }).join('')}</tr>`;
    }).join('');
    return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  function buildPdfSheet(rows) {
    const campaign = activeCampaign();
    return `
      <div class="pdf-title">CUADERNO DE TRATAMIENTOS. ${escapeHtml(campaign?.name?.toUpperCase() || 'CAMPAÑA 2026')}</div>
      <div class="pdf-applicator">Nombre del aplicador: ${escapeHtml(campaign?.applicator || 'PENDIENTE')}</div>
      <div class="scroll-table"><div class="pdf-table">${buildOfficialTable(rows)}</div></div>
      <p class="caption">Exportación local desde la app Cuaderno de Tratamientos.</p>
    `;
  }

  function officialValues(row, ordinals) {
    return {
      ordinal: ordinals.get(row.date) || '—',
      date: formatDate(row.date),
      productName: row.productName || '—',
      registration: row.registration || '—',
      lot: row.lot || '—',
      doseReference: row.doseReference || '—',
      doseApplied: row.doseApplied || '—',
      volumeReference: row.volumeReference || '—',
      litersPerHa: row.litersPerHa ?? '—',
      crop: row.crop || '—',
      objective: row.objective || '—',
      safetyPeriod: row.safetyPeriod || '—',
      campaignCount: campaignCountDisplay(row),
      activeIngredients: row.activeIngredients || '—',
      mixRule: row.mixRule || '----'
    };
  }

  function isWarningCell(row, key, value) {
    if (row.incidence) return true;
    if (row.verificationStatus === 'PENDING') return true;
    return containsPending(value) || (key === 'mixRule' && String(value) === 'A verificar');
  }

  function containsPending(value) {
    return /a verificar|pendiente/i.test(String(value ?? ''));
  }

  async function resolveAlert(id) {
    const alert = state.alerts.find(a => a.id === id);
    if (!alert) return;
    if (alert.type === 'A_VERIFY' && alertStillPending(alert)) {
      showInfoModal(
        'No se puede resolver todavía',
        '<p>Esta alerta sigue vinculada a campos <strong>A verificar</strong>. Completa la ficha del producto o el tratamiento correspondiente. La alerta se resolverá automáticamente cuando ya no quede pendiente técnico.</p>'
      );
      return;
    }
    const ok = await confirmDialog('Resolver alerta', `¿Marcar como resuelta: ${escapeHtml(alert.title || alert.type)}?`, 'Resolver', 'Cancelar');
    if (!ok) return;
    markAlertResolved(alert, 'MANUAL');
    await saveState();
    toast('Alerta resuelta.');
    render();
  }

  function markAlertResolved(alert, mode = 'AUTO') {
    if (!alert || alert.status === 'RESOLVED') return;
    alert.status = 'RESOLVED';
    alert.resolvedAt = new Date().toISOString();
    alert.resolutionMode = mode;
  }

  function alertStillPending(alert) {
    const product = alert.relatedProductId ? findProduct(alert.relatedProductId) : null;
    const treatment = alert.relatedTreatmentId ? findTreatment(alert.relatedTreatmentId) : null;
    if (treatment) return treatmentHasTechnicalPending(treatment);
    if (product) return productHasTechnicalPending(product);
    return false;
  }

  function labelAlertType(type) {
    const labels = {
      A_VERIFY: 'A verificar',
      INCIDENT: 'Incidencia',
      MAX_REACHED: 'Máximo alcanzado',
      MAX_FORCED: 'Máximo forzado',
      DOC_REVIEW: 'Revisión documental'
    };
    return labels[type] || type || 'Alerta';
  }

  function buildAlert(type, title, description, relatedProductId, relatedTreatmentId) {
    return {
      id: `a_${cryptoRandom()}`,
      campaignId: state.activeCampaignId,
      type,
      status: 'ACTIVE',
      title,
      description,
      relatedProductId: relatedProductId || null,
      relatedTreatmentId: relatedTreatmentId || null,
      createdAt: new Date().toISOString(),
      resolvedAt: null
    };
  }

  async function showProductModal(id) {
    const product = findProduct(id);
    if (!product) return;
    ensureProductDocumentShape(product);
    const body = `
      <div class="kv-grid">
        <div class="kv"><strong>Registro</strong><span>${escapeHtml(product.registration || '—')}</span></div>
        <div class="kv"><strong>Estado</strong><span>${escapeHtml(product.verificationStatus || '—')}</span></div>
        <div class="kv"><strong>Dosis</strong><span>${escapeHtml(product.doseReference || '—')}</span></div>
        <div class="kv"><strong>Regla dosis</strong><span>${escapeHtml(product.doseRule?.mode || 'pending')}</span></div>
        <div class="kv"><strong>Volumen caldo</strong><span>${escapeHtml(product.volumeReference || '—')}</span></div>
        <div class="kv"><strong>Regla volumen</strong><span>${escapeHtml(product.volumeRule?.mode || 'pending')}</span></div>
        <div class="kv"><strong>P.S.</strong><span>${escapeHtml(product.safetyPeriod || '—')}</span></div>
        <div class="kv"><strong>Máx. campaña</strong><span>${escapeHtml(String(product.maxApplications ?? 'NO CONSTA'))}</span></div>
        <div class="kv"><strong>Principios activos</strong><span>${escapeHtml(product.activeIngredients || '—')}</span></div>
        <div class="kv"><strong>MEZCLA</strong><span>${escapeHtml(product.mixRule || '----')}</span></div>
        <div class="kv"><strong>Usos autorizados</strong><span>${escapeHtml(renderInlineList(product.allowedUses, '—'))}</span></div>
        <div class="kv"><strong>Objetivos</strong><span>${escapeHtml(renderInlineList(product.allowedObjectives, '—'))}</span></div>
        <div class="kv"><strong>Intervalo</strong><span>${escapeHtml(product.applicationInterval || '—')}</span></div>
        <div class="kv"><strong>Estadio / condiciones</strong><span>${escapeHtml(product.applicationStage || '—')}</span></div>
        <div class="kv"><strong>Fuente</strong>${renderProductSource(product)}</div>
      </div>
      ${renderProductDocumentsSection(product)}
    `;
    const decision = await choiceDialog(product.name, body, [
      { id: 'edit', label: 'Editar / completar ficha', className: 'secondary-btn' },
      { id: 'close', label: 'Cerrar', className: 'primary-btn' }
    ], true);
    if (decision === 'edit') {
      els.modalHost.innerHTML = '';
      return showProductEditChoice(id);
    }
    els.modalHost.innerHTML = '';
  }

  async function showProductEditChoice(id) {
    const product = findProduct(id);
    if (!product) return;
    const decision = await choiceDialog(`Completar ficha: ${product.name}`, `
      <p>Selecciona el método de trabajo.</p>
      <div class="notice" style="margin-top:12px">
        <strong>A) Completar manualmente.</strong>
        <p>Abre el formulario técnico completo para escribir o corregir cada campo.</p>
      </div>
      <div class="notice" style="margin-top:12px">
        <strong>B) Completar desde documentación.</strong>
        <p>Permite aportar fotos de envase, etiqueta o PDF. La app guardará la documentación en la ficha, intentará extraer datos con evidencia suficiente y mantendrá como <strong>A verificar</strong> lo dudoso o incompleto.</p>
      </div>
    `, [
      { id: 'manual', label: 'A) Completar manualmente', className: 'secondary-btn' },
      { id: 'documents', label: 'B) Completar desde documentación', className: 'primary-btn' },
      { id: 'cancel', label: 'Cancelar', className: 'ghost-btn' }
    ]);
    if (decision === 'manual') return showEditProductModal(id);
    if (decision === 'documents') return showProductDocumentIntakeModal(id);
  }

  async function showProductDocumentIntakeModal(id) {
    const product = findProduct(id);
    if (!product) return;
    const body = `
      <div class="notice">
        <strong>Documentación técnica asociada.</strong>
        <p>Se admiten imágenes y PDF. Las imágenes se optimizan localmente para mantener un formato legible y ligero. Los documentos quedarán guardados en la ficha del producto y en la copia completa JSON.</p>
      </div>
      <div class="notice extraction-guidance" style="margin-top:12px">
        <strong>Flujo recomendado para mejorar la lectura.</strong>
        <p>1) Foto de identificación/composición. 2) Foto nítida de la tabla de usos, dosis, volumen y P.S. 3) PDF o ficha técnica si existe. La app cruza la información y presenta una propuesta revisable antes de aplicar cambios.</p>
      </div>
      <div class="field"><span>Tipo de documentación principal</span><select id="productDocumentRole">${renderSimpleOptions([
        ['mixed', 'Conjunto mixto: envase + tabla + PDF'],
        ['identity', 'Identificación / composición'],
        ['use_table', 'Tabla de usos, dosis, volumen y P.S.'],
        ['technical_pdf', 'Ficha técnica / registro / PDF'],
        ['other', 'Otro documento']
      ], 'mixed')}</select></div>
      <div class="field"><span>Fotos / PDF</span><input id="productDocumentFiles" type="file" accept=".pdf,application/pdf,image/*" multiple></div>
      <div class="field"><span>Nota de fuente opcional</span><textarea id="productDocumentNote" placeholder="Ej.: etiqueta envase 2026, ficha técnica fabricante, registro oficial..."></textarea></div>
      <p class="muted">La app ya no vuelca texto OCR bruto en la ficha. Primero genera una <strong>propuesta de extracción por campos</strong>; solo se aplicará tras revisión.</p>
    `;
    const decision = await choiceDialog(`Aportar documentación: ${product.name}`, body, [
      { id: 'analyze', label: 'Guardar y analizar', className: 'primary-btn' },
      { id: 'cancel', label: 'Cancelar', className: 'ghost-btn' }
    ], true);
    if (decision !== 'analyze') { els.modalHost.innerHTML = ''; return; }
    const files = Array.from(document.getElementById('productDocumentFiles')?.files || []);
    const note = document.getElementById('productDocumentNote')?.value?.trim() || '';
    const role = document.getElementById('productDocumentRole')?.value || 'mixed';
    els.modalHost.innerHTML = '';
    if (!files.length) {
      toast('Selecciona al menos una imagen o PDF.');
      return showProductDocumentIntakeModal(id);
    }
    return processProductDocuments(product, files, note, role);
  }

  async function showEditProductModal(id) {
    const product = findProduct(id);
    if (!product) return;
    ensureProductDocumentShape(product);
    const doseRule = product.doseRule || { mode: 'pending' };
    const volumeRule = product.volumeRule || { mode: 'pending' };
    const body = `
      <div id="editProductFeedback" class="warning-block hidden"></div>
      <div class="notice">
        <strong>Edición manual.</strong>
        <p>Los documentos técnicos asociados a esta ficha: <strong>${(product.documents || []).length}</strong>. Puedes cerrar y volver a elegir la vía documental si prefieres completar desde fotos o PDF.</p>
      </div>
      <div class="field"><span>Producto</span><input id="editProductNameReadonly" value="${escapeAttr(product.name || '')}" readonly></div>
      <div class="inline-fields two">
        <div class="field"><span>N.º de registro</span><input id="editProductRegistration" value="${escapeAttr(product.registration || '')}" placeholder="Registro o SIN REGISTRO"></div>
        <div class="field"><span>Estado técnico</span><select id="editProductVerificationStatus">${renderSimpleOptions([
          ['PENDING', 'A verificar'],
          ['VERIFIED', 'Verificado']
        ], product.verificationStatus || 'PENDING')}</select></div>
      </div>
      <div class="field"><span>Dosis recomendada</span><textarea id="editProductDoseReference" placeholder="Texto visible en cuaderno">${escapeHtml(product.doseReference || '')}</textarea></div>
      <div class="field"><span>Tipo de regla de dosis para validación</span><select id="editProductDoseMode">${renderSimpleOptions([
        ['pending', 'A verificar'],
        ['fixed', 'Dosis única por ha'],
        ['range', 'Rango mínimo–máximo por ha'],
        ['concentration_range_with_ha_limit', 'Rango % + límite por ha'],
        ['concentration_hl_range_with_ha_limit', 'Rango g/hL o cc/hL + límite por ha'],
        ['concentration_fixed_with_ha_limit', 'Concentración % única + límite por ha'],
        ['concentration_hl_range', 'Rango g/hL o cc/hL sin límite por ha']
      ], doseRule.mode || 'pending')}</select></div>
      <div class="inline-fields two">
        <div class="field"><span>Unidad visible dosis</span><input id="editDoseDisplayUnit" value="${escapeAttr(doseRule.displayUnit || '')}" placeholder="kg/ha, %, g/hL, cc/hL..."></div>
        <div class="field"><span>Unidad esperada aplicada</span><input id="editDoseExpectedAppliedUnit" value="${escapeAttr(doseRule.expectedAppliedUnit || '')}" placeholder="kg/ha, cc/ha, g/hL..."></div>
      </div>
      <div class="inline-fields two">
        <div class="field"><span>Valor único dosis</span><input id="editDoseValue" value="${escapeAttr(ruleInputValue(doseRule.value))}" inputmode="decimal" placeholder="Solo modos de valor único"></div>
        <div class="field"><span>Mínimo dosis</span><input id="editDoseMin" value="${escapeAttr(ruleInputValue(doseRule.min))}" inputmode="decimal" placeholder="Solo modos con rango"></div>
      </div>
      <div class="inline-fields two">
        <div class="field"><span>Máximo dosis</span><input id="editDoseMax" value="${escapeAttr(ruleInputValue(doseRule.max))}" inputmode="decimal" placeholder="Solo modos con rango"></div>
        <div class="field"><span>Límite por ha</span><input id="editDosePerHaLimit" value="${escapeAttr(ruleInputValue(doseRule.perHaLimit))}" inputmode="decimal" placeholder="Si la etiqueta lo fija"></div>
      </div>
      <div class="field"><span>Unidad límite por ha</span><input id="editDosePerHaLimitUnit" value="${escapeAttr(doseRule.perHaLimitUnit || '')}" placeholder="kg/ha o L/ha"></div>
      <hr class="separator">
      ${renderEditProductVolumeEditor(product, volumeRule)}
      <div class="inline-fields two">
        <div class="field"><span>Cultivo / usos autorizados</span><textarea id="editProductAllowedUses" placeholder="Uno por línea">${escapeHtml((product.allowedUses || []).join('\n'))}</textarea></div>
        <div class="field"><span>Plagas / objetivos autorizados</span><textarea id="editProductAllowedObjectives" placeholder="Uno por línea">${escapeHtml((product.allowedObjectives || []).join('\n'))}</textarea></div>
      </div>
      <div class="inline-fields two">
        <div class="field"><span>Intervalo entre aplicaciones</span><input id="editProductApplicationInterval" value="${escapeAttr(product.applicationInterval || '')}" placeholder="Ej.: 7-10 días"></div>
        <div class="field"><span>Estadio / condiciones de aplicación</span><textarea id="editProductApplicationStage" placeholder="Ej.: BBCH 13/14-85">${escapeHtml(product.applicationStage || '')}</textarea></div>
      </div>
      <div class="inline-fields two">
        <div class="field"><span>P.S.</span><input id="editProductSafetyPeriod" value="${escapeAttr(product.safetyPeriod || '')}" placeholder="28 días o NO PROCEDE"></div>
        <div class="field"><span>Máx. aplicaciones campaña</span><input id="editProductMaxApplications" value="${escapeAttr(maxApplicationsInput(product.maxApplications))}" inputmode="numeric" placeholder="Número o NO CONSTA"></div>
      </div>
      <div class="field"><span>Principios activos</span><textarea id="editProductActiveIngredients" placeholder="Principios activos">${escapeHtml(product.activeIngredients || '')}</textarea></div>
      <div class="inline-fields two">
        <div class="field"><span>MEZCLA</span><select id="editProductMixRule">${renderSimpleOptions([
          ['A verificar', 'A verificar'],
          ['----', 'Sin obligación de SOLO'],
          ['SOLO', 'SOLO']
        ], product.mixRule || 'A verificar')}</select></div>
        <div class="field"><span>Fecha de verificación</span><input id="editProductVerifiedAt" type="date" value="${escapeAttr(verifiedDateInput(product.verifiedAt))}"></div>
      </div>
      <div class="field"><span>Fuente / referencia documental</span><textarea id="editProductSource" placeholder="Etiqueta, registro oficial, ficha técnica...">${escapeHtml(cleanProductSourceBase(product.source || ''))}</textarea></div>
      <p class="muted">Al guardar una ficha verificada, la app actualizará automáticamente en el cuaderno solo los campos técnicos que estén “A verificar” y resolverá las alertas técnicas que ya no procedan.</p>
    `;
    const decision = await choiceDialog(`Editar ficha: ${product.name}`, body, [
      { id: 'save', label: 'Guardar ficha', className: 'primary-btn' },
      { id: 'cancel', label: 'Cancelar', className: 'ghost-btn' }
    ], true);
    if (decision !== 'save') { els.modalHost.innerHTML = ''; return; }

    const payload = readProductEditPayload(product);
    const validationErrors = validateProductEditPayload(payload);
    if (validationErrors.length) {
      showProductEditFeedback(validationErrors);
      return;
    }
    els.modalHost.innerHTML = '';
    applyProductEditPayload(product, payload);
    const updatedRows = propagateProductVerificationToTreatments(product);
    const resolvedAlerts = reconcileAlertsForProduct(product);
    await saveState();
    toast(`Ficha guardada. ${updatedRows} registro(s) del cuaderno actualizado(s). ${resolvedAlerts} alerta(s) resuelta(s).`);
    render();
  }

  function readProductEditPayload(product) {
    const read = id => document.getElementById(id)?.value?.trim() ?? '';
    const verificationStatus = read('editProductVerificationStatus') || product.verificationStatus || 'PENDING';
    const doseMode = read('editProductDoseMode') || 'pending';
    const editVolume = readEditProductVolumePayload();
    return {
      registration: read('editProductRegistration'),
      verificationStatus,
      doseReference: read('editProductDoseReference'),
      doseRule: buildDoseRuleFromEdit({
        mode: doseMode,
        displayUnit: read('editDoseDisplayUnit'),
        expectedAppliedUnit: read('editDoseExpectedAppliedUnit'),
        value: readNumericEdit('editDoseValue'),
        min: readNumericEdit('editDoseMin'),
        max: readNumericEdit('editDoseMax'),
        perHaLimit: readNumericEdit('editDosePerHaLimit'),
        perHaLimitUnit: read('editDosePerHaLimitUnit')
      }),
      volumeReference: editVolume.reference,
      volumeRule: editVolume.rule,
      allowedUses: parseLinesInput(read('editProductAllowedUses')),
      allowedObjectives: parseLinesInput(read('editProductAllowedObjectives')),
      applicationInterval: read('editProductApplicationInterval'),
      applicationStage: read('editProductApplicationStage'),
      safetyPeriod: read('editProductSafetyPeriod'),
      maxApplications: parseMaxApplicationsEdit(read('editProductMaxApplications')),
      activeIngredients: read('editProductActiveIngredients'),
      mixRule: read('editProductMixRule') || 'A verificar',
      verifiedAt: read('editProductVerifiedAt'),
      source: read('editProductSource')
    };
  }

  function buildDoseRuleFromEdit(input) {
    const base = {
      mode: input.mode || 'pending',
      displayUnit: input.displayUnit || '',
      expectedAppliedUnit: input.expectedAppliedUnit || ''
    };
    if (base.mode === 'pending') return { mode: 'pending' };
    if (base.mode === 'fixed') return { ...base, value: input.value };
    if (base.mode === 'range') return { ...base, min: input.min, max: input.max };
    if (base.mode === 'concentration_range_with_ha_limit' || base.mode === 'concentration_hl_range_with_ha_limit') {
      return { ...base, min: input.min, max: input.max, perHaLimit: input.perHaLimit, perHaLimitUnit: input.perHaLimitUnit || '' };
    }
    if (base.mode === 'concentration_fixed_with_ha_limit') {
      return { ...base, value: input.value, perHaLimit: input.perHaLimit, perHaLimitUnit: input.perHaLimitUnit || '' };
    }
    if (base.mode === 'concentration_hl_range') return { ...base, min: input.min, max: input.max };
    return { mode: 'pending' };
  }

  function buildVolumeRuleFromEdit(input) {
    if (input.mode === 'not_listed') return { mode: 'not_listed' };
    if (input.mode === 'fixed') return { mode: 'fixed', unit: 'L/ha', value: input.value };
    if (input.mode === 'range') return { mode: 'range', unit: 'L/ha', min: input.min, max: input.max };
    return { mode: 'pending' };
  }

  function validateProductEditPayload(payload) {
    const errors = [];
    if (!payload.registration) errors.push('Indica el número de registro o SIN REGISTRO.');
    if (!payload.doseReference) errors.push('Completa la dosis recomendada visible en cuaderno.');
    if (!payload.volumeReference) errors.push('Completa el volumen de caldo o escribe NO CONSTA.');
    if (!payload.safetyPeriod) errors.push('Completa el P.S. o escribe NO PROCEDE.');
    if (!payload.activeIngredients) errors.push('Completa los principios activos.');
    if (!payload.mixRule) errors.push('Selecciona la regla MEZCLA.');
    if (!payload.source) errors.push('Indica una fuente o referencia documental.');
    if (payload.maxApplications === 'INVALID') errors.push('Máx. aplicaciones debe ser un número o NO CONSTA.');

    if (payload.verificationStatus === 'VERIFIED') {
      if (containsPending(payload.registration)) errors.push('No se puede verificar con registro A verificar.');
      if (containsPending(payload.doseReference)) errors.push('No se puede verificar con dosis recomendada A verificar.');
      if (containsPending(payload.volumeReference)) errors.push('No se puede verificar con volumen caldo A verificar.');
      if (containsPending(payload.safetyPeriod)) errors.push('No se puede verificar con P.S. A verificar.');
      if (containsPending(payload.activeIngredients)) errors.push('No se puede verificar con principios activos A verificar.');
      if (containsPending(payload.mixRule)) errors.push('No se puede verificar con MEZCLA A verificar.');
      if (payload.doseRule.mode === 'pending') errors.push('Selecciona una regla de validación de dosis antes de verificar.');
      if (payload.volumeRule.mode === 'pending') errors.push('Selecciona una regla de volumen o marca NO CONSTA antes de verificar.');
      errors.push(...validateDoseRulePayload(payload.doseRule));
      errors.push(...validateVolumeRulePayload(payload.volumeRule));
    }
    return errors;
  }

  function validateDoseRulePayload(rule) {
    const errors = [];
    const hasNumber = value => Number.isFinite(value);
    if (rule.mode === 'pending') return errors;
    if (!rule.displayUnit) errors.push('Indica la unidad visible de la regla de dosis.');
    if (!rule.expectedAppliedUnit) errors.push('Indica la unidad esperada para la dosis aplicada.');
    if (rule.mode === 'fixed' && !hasNumber(rule.value)) errors.push('La dosis única necesita un valor numérico.');
    if (rule.mode === 'range' && (!hasNumber(rule.min) || !hasNumber(rule.max))) errors.push('El rango por hectárea necesita mínimo y máximo numéricos.');
    if ((rule.mode === 'concentration_range_with_ha_limit' || rule.mode === 'concentration_hl_range_with_ha_limit' || rule.mode === 'concentration_hl_range') && (!hasNumber(rule.min) || !hasNumber(rule.max))) {
      errors.push('La regla de rango necesita mínimo y máximo numéricos.');
    }
    if (rule.mode === 'concentration_fixed_with_ha_limit' && !hasNumber(rule.value)) errors.push('La concentración única necesita un valor numérico.');
    if ((rule.mode === 'concentration_range_with_ha_limit' || rule.mode === 'concentration_hl_range_with_ha_limit' || rule.mode === 'concentration_fixed_with_ha_limit') && (!hasNumber(rule.perHaLimit) || !rule.perHaLimitUnit)) {
      errors.push('La regla con límite por ha necesita valor y unidad del límite.');
    }
    if (hasNumber(rule.min) && hasNumber(rule.max) && rule.min > rule.max) errors.push('El mínimo de dosis no puede superar al máximo.');
    return errors;
  }

  function validateVolumeRulePayload(rule) {
    const errors = [];
    if (rule.mode === 'fixed' && !Number.isFinite(rule.value)) {
      errors.push('El volumen único necesita un valor numérico.');
    }
    if (rule.mode === 'range') {
      if (!Number.isFinite(rule.min) || !Number.isFinite(rule.max)) errors.push('El rango de volumen necesita mínimo y máximo numéricos.');
      if (Number.isFinite(rule.min) && Number.isFinite(rule.max) && rule.min > rule.max) errors.push('El mínimo de volumen no puede superar al máximo.');
    }
    return errors;
  }

  function showProductEditFeedback(errors) {
    const box = document.getElementById('editProductFeedback');
    if (!box) return toast(errors[0] || 'Revisa la ficha.');
    box.innerHTML = `<strong>No se puede guardar todavía.</strong><ul class="list-clean" style="margin-top:8px">${errors.map(error => `<li>${escapeHtml(error)}</li>`).join('')}</ul>`;
    box.classList.remove('hidden');
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function applyProductEditPayload(product, payload) {
    product.registration = payload.registration;
    product.verificationStatus = payload.verificationStatus;
    product.doseReference = payload.doseReference;
    product.doseRule = payload.doseRule;
    product.volumeReference = payload.volumeReference;
    product.volumeRule = payload.volumeRule;
    product.allowedUses = payload.allowedUses;
    product.allowedObjectives = payload.allowedObjectives;
    product.applicationInterval = payload.applicationInterval;
    product.applicationStage = payload.applicationStage;
    product.safetyPeriod = payload.safetyPeriod;
    product.maxApplications = payload.maxApplications;
    product.activeIngredients = payload.activeIngredients;
    product.mixRule = payload.mixRule;
    product.verifiedAt = payload.verificationStatus === 'VERIFIED' ? (payload.verifiedAt || todayLocalIso()) : (payload.verifiedAt || null);
    product.source = payload.source;
    product.updatedAt = new Date().toISOString();
  }

  function propagateProductVerificationToTreatments(product) {
    let updated = 0;
    state.treatments.forEach(row => {
      if (row.productId !== product.id) return;
      let changed = false;
      changed = applyIfTechnicalPending(row, 'registration', product.registration) || changed;
      changed = applyIfTechnicalPending(row, 'doseReference', product.doseReference) || changed;
      changed = applyIfTechnicalPending(row, 'volumeReference', product.volumeReference) || changed;
      changed = applyIfTechnicalPending(row, 'safetyPeriod', product.safetyPeriod) || changed;
      changed = applyIfTechnicalPending(row, 'activeIngredients', product.activeIngredients) || changed;
      changed = applyIfTechnicalPending(row, 'mixRule', product.mixRule) || changed;
      if (row.verificationStatus === 'PENDING' && product.verificationStatus === 'VERIFIED') {
        row.verificationStatus = 'VERIFIED';
        changed = true;
      }
      row.snapshot ||= buildSnapshot(product);
      changed = applySnapshotIfTechnicalPending(row.snapshot, 'registration', product.registration) || changed;
      changed = applySnapshotIfTechnicalPending(row.snapshot, 'doseReference', product.doseReference) || changed;
      changed = applySnapshotIfTechnicalPending(row.snapshot, 'volumeReference', product.volumeReference) || changed;
      changed = applySnapshotIfTechnicalPending(row.snapshot, 'safetyPeriod', product.safetyPeriod) || changed;
      changed = applySnapshotIfTechnicalPending(row.snapshot, 'activeIngredients', product.activeIngredients) || changed;
      changed = applySnapshotIfTechnicalPending(row.snapshot, 'mixRule', product.mixRule) || changed;
      if ((row.snapshot.verificationStatus === 'PENDING' || containsPending(row.snapshot.verificationStatus)) && product.verificationStatus === 'VERIFIED') {
        row.snapshot.verificationStatus = 'VERIFIED';
        changed = true;
      }
      if ((row.snapshot.registration === product.registration || !containsPending(row.snapshot.registration)) && product.verificationStatus === 'VERIFIED') {
        if (containsPending(row.snapshot?.doseRule?.mode) || row.snapshot?.doseRule?.mode === 'pending') {
          row.snapshot.doseRule = deepClone(product.doseRule);
          changed = true;
        }
        if (containsPending(row.snapshot?.volumeRule?.mode) || row.snapshot?.volumeRule?.mode === 'pending') {
          row.snapshot.volumeRule = deepClone(product.volumeRule);
          changed = true;
        }
        if (row.snapshot.maxApplications === null || row.snapshot.maxApplications === undefined || containsPending(row.snapshot.maxApplications)) {
          row.snapshot.maxApplications = product.maxApplications;
          changed = true;
        }
      }
      if (product.verificationStatus === 'VERIFIED') {
        const technicalValidation = validateEntryAgainstProduct(product, row.doseApplied, row.litersPerHa);
        if (!technicalValidation.ok) {
          const validationMessage = `Validación tras verificar ficha: ${technicalValidation.messages.join(' | ')}`;
          const mergedIncidence = mergeUniqueIncidence(row.incidence, validationMessage);
          if (mergedIncidence !== row.incidence) {
            row.incidence = mergedIncidence;
            changed = true;
          }
          ensureIncidentAlertForTreatment(row, product, validationMessage);
        }
      }
      const cleanedIncidence = removeResolvedTechnicalPendingIncidence(row.incidence, row);
      if (cleanedIncidence !== row.incidence) {
        row.incidence = cleanedIncidence;
        changed = true;
      }
      if (changed) {
        row.updatedAt = new Date().toISOString();
        updated += 1;
      }
    });
    return updated;
  }

  function applyIfTechnicalPending(target, key, newValue) {
    if (!target || !containsPending(target[key])) return false;
    target[key] = newValue;
    return true;
  }

  function applySnapshotIfTechnicalPending(snapshot, key, newValue) {
    if (!snapshot || !containsPending(snapshot[key])) return false;
    snapshot[key] = newValue;
    return true;
  }

  function removeResolvedTechnicalPendingIncidence(incidence, row) {
    const text = String(incidence || '').trim();
    if (!text) return '';
    if (treatmentHasTechnicalPending(row)) return text;
    const parts = text.split('|').map(part => part.trim()).filter(Boolean);
    const filtered = parts.filter(part => !/pendiente t[eé]cnico|datos a verificar|campos pendientes t[eé]cnicos/i.test(part));
    return filtered.join(' | ');
  }

  function mergeUniqueIncidence(existing, addition) {
    const parts = String(existing || '').split('|').map(part => part.trim()).filter(Boolean);
    if (addition && !parts.includes(addition)) parts.push(addition);
    return parts.join(' | ');
  }

  function ensureIncidentAlertForTreatment(row, product, description) {
    const alreadyActive = state.alerts.some(alert => alert.status === 'ACTIVE' && alert.type === 'INCIDENT' && alert.relatedTreatmentId === row.id && alert.description === description);
    if (alreadyActive) return;
    state.alerts.push(buildAlert('INCIDENT', `Incidencia tras verificar ficha: ${row.productName}`, description, product.id, row.id));
  }

  function productHasTechnicalPending(product) {
    if (!product || product.verificationStatus !== 'VERIFIED') return true;
    if (containsPending(product.registration) || containsPending(product.doseReference) || containsPending(product.volumeReference) || containsPending(product.safetyPeriod) || containsPending(product.activeIngredients) || containsPending(product.mixRule)) return true;
    if (!product.doseRule || product.doseRule.mode === 'pending') return true;
    if (!product.volumeRule || product.volumeRule.mode === 'pending') return true;
    return false;
  }

  function treatmentHasTechnicalPending(row) {
    if (!row || row.verificationStatus === 'PENDING') return true;
    return containsPending(row.registration) || containsPending(row.doseReference) || containsPending(row.volumeReference) || containsPending(row.safetyPeriod) || containsPending(row.activeIngredients) || containsPending(row.mixRule);
  }

  function reconcileAlertsForProduct(product) {
    let resolved = 0;
    state.alerts.forEach(alert => {
      if (alert.status !== 'ACTIVE' || alert.type !== 'A_VERIFY' || alert.relatedProductId !== product.id) return;
      const treatment = alert.relatedTreatmentId ? findTreatment(alert.relatedTreatmentId) : null;
      const canResolve = treatment ? !treatmentHasTechnicalPending(treatment) : !productHasTechnicalPending(product);
      if (!canResolve) return;
      markAlertResolved(alert, 'AUTO_PRODUCT_VERIFICATION');
      resolved += 1;
    });
    return resolved;
  }

  function ensureProductDocumentShape(product) {
    if (!product || typeof product !== 'object') return;
    product.documents ||= [];
    if (!Array.isArray(product.documents)) product.documents = [];
    product.allowedUses ||= [];
    if (!Array.isArray(product.allowedUses)) product.allowedUses = product.allowedUses ? [String(product.allowedUses)] : [];
    product.allowedObjectives ||= [];
    if (!Array.isArray(product.allowedObjectives)) product.allowedObjectives = product.allowedObjectives ? [String(product.allowedObjectives)] : [];
    product.applicationInterval ||= '';
    product.applicationStage ||= '';
  }

  function renderProductDocumentsSection(product) {
    ensureProductDocumentShape(product);
    const docs = product.documents || [];
    return `
      <section class="document-section">
        <div class="section-header compact-header">
          <div>
            <h3>Documentación técnica asociada</h3>
            <p>${docs.length ? `${docs.length} documento(s) guardado(s) como respaldo de la ficha.` : 'Sin documentación técnica adjunta.'}</p>
          </div>
        </div>
        ${docs.length ? `<div class="document-list">${docs.map(doc => renderProductDocumentRow(product, doc)).join('')}</div>` : ''}
        <div class="button-row" style="margin-top:12px">
          <button type="button" class="secondary-btn" data-modal-action="add-product-docs" data-product-id="${escapeAttr(product.id)}">Aportar documentación</button>
        </div>
      </section>
    `;
  }

  function renderProductDocumentRow(product, doc) {
    const typeLabel = doc.mimeType === 'application/pdf' ? 'PDF' : 'Imagen';
    return `
      <article class="document-row">
        <div>
          <strong>${escapeHtml(doc.name || 'Documento técnico')}</strong>
          <p class="muted">${typeLabel} · ${escapeHtml(formatBytes(doc.sizeStored || doc.sizeOriginal || 0))}${doc.optimized ? ' · optimizado' : ''}</p>
        </div>
        <div class="mini-actions">
          <button type="button" class="ghost-btn compact" data-modal-action="view-product-doc" data-product-id="${escapeAttr(product.id)}" data-doc-id="${escapeAttr(doc.id)}">Ver</button>
          <button type="button" class="danger-btn compact" data-modal-action="delete-product-doc" data-product-id="${escapeAttr(product.id)}" data-doc-id="${escapeAttr(doc.id)}">Eliminar</button>
        </div>
      </article>
    `;
  }

  async function showProductDocumentViewer(productId, docId) {
    const product = findProduct(productId);
    ensureProductDocumentShape(product);
    const doc = product?.documents?.find(item => item.id === docId);
    if (!doc) return toast('No se encontró el documento.');
    const body = doc.mimeType === 'application/pdf'
      ? `<div class="doc-preview"><iframe class="doc-frame" src="${escapeAttr(doc.dataUrl)}" title="${escapeAttr(doc.name || 'PDF técnico')}"></iframe></div><p class="muted">Si el visor del iPhone no lo muestra, abre el PDF desde el enlace inferior.</p><p><a class="secondary-link" href="${escapeAttr(doc.dataUrl)}" target="_blank" rel="noopener">Abrir documento aparte</a></p>`
      : `<div class="doc-preview image"><img src="${escapeAttr(doc.dataUrl)}" alt="${escapeAttr(doc.name || 'Documento técnico')}"></div><p><button type="button" class="secondary-btn" data-modal-action="zoom-product-doc-image" data-product-id="${escapeAttr(product.id)}" data-doc-id="${escapeAttr(doc.id)}">Ver imagen ampliada</button></p><p class="muted">La ampliación se abre dentro de la app para evitar pantallas en blanco en iPhone.</p>`;
    await choiceDialog(doc.name || 'Documento técnico', body, [
      { id: 'close', label: 'Cerrar', className: 'primary-btn' }
    ]);
  }

  async function showProductImageZoomViewer(productId, docId) {
    const product = findProduct(productId);
    ensureProductDocumentShape(product);
    const doc = product?.documents?.find(item => item.id === docId);
    if (!doc) return toast('No se encontró la imagen.');
    if (doc.mimeType === 'application/pdf') return showProductDocumentViewer(productId, docId);
    const body = `
      <div class="doc-preview image image-zoom-preview">
        <img src="${escapeAttr(doc.dataUrl)}" alt="${escapeAttr(doc.name || 'Documento técnico ampliado')}">
      </div>
      <p class="muted">Vista ampliada dentro de la app. Puedes hacer zoom propio del iPhone sobre la pantalla si necesitas inspeccionar el texto.</p>
    `;
    const decision = await choiceDialog(`${doc.name || 'Documento técnico'} · ampliada`, body, [
      { id: 'back', label: 'Volver', className: 'primary-btn' }
    ]);
    if (decision === 'back') return showProductDocumentViewer(productId, docId);
  }

  async function deleteProductDocument(productId, docId) {
    const product = findProduct(productId);
    ensureProductDocumentShape(product);
    const doc = product?.documents?.find(item => item.id === docId);
    if (!doc) return;
    const ok = await confirmDialog('Eliminar documento', `¿Eliminar <strong>${escapeHtml(doc.name || 'este documento')}</strong> de la ficha?`, 'Eliminar', 'Cancelar');
    if (!ok) return showProductModal(productId);
    product.documents = product.documents.filter(item => item.id !== docId);
    product.source = cleanProductSourceBase(product.source);
    product.updatedAt = new Date().toISOString();
    await saveState();
    toast('Documento eliminado de la ficha.');
    return showProductModal(productId);
  }

  function showBusyModal(title, text) {
    els.modalHost.innerHTML = `
      <div class="modal-backdrop" role="dialog" aria-modal="true">
        <section class="modal-card">
          <h2>${escapeHtml(title)}</h2>
          <div class="modal-body">
            <div class="notice"><strong id="busyModalText">${escapeHtml(text)}</strong></div>
            <p class="muted" id="busyModalDetail">La operación se realiza localmente en el dispositivo.</p>
          </div>
        </section>
      </div>
    `;
  }

  function updateBusyModal(text, detail = '') {
    const main = document.getElementById('busyModalText');
    const sub = document.getElementById('busyModalDetail');
    if (main) main.textContent = text || '';
    if (sub && detail) sub.textContent = detail;
  }

  async function processProductDocuments(product, files, note, role = 'mixed') {
    ensureProductDocumentShape(product);
    showBusyModal('Analizando documentación', 'Preparando documentos…');
    const docs = [];
    const extractedTexts = [];
    const warnings = [];
    let ocrWorker = null;
    const getOcrWorker = async () => {
      if (ocrWorker) return ocrWorker;
      updateBusyModal('Cargando OCR…', 'La primera vez puede tardar porque se prepara el motor de lectura.');
      const Tesseract = await loadTesseractLibrary();
      ocrWorker = await Tesseract.createWorker('spa+eng', 1, {
        logger: message => {
          if (message?.status) updateBusyModal('Leyendo texto…', `${message.status}${Number.isFinite(message.progress) ? ` · ${Math.round(message.progress * 100)}%` : ''}`);
        }
      });
      return ocrWorker;
    };
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        updateBusyModal(`Guardando documento ${index + 1}/${files.length}…`, file.name || 'Documento técnico');
        const stored = await normalizeProductDocumentFile(file);
        const doc = {
          id: `doc_${cryptoRandom()}`,
          name: file.name || `documento_${index + 1}`,
          mimeType: stored.mimeType,
          role,
          sizeOriginal: file.size || 0,
          sizeStored: stored.sizeStored,
          optimized: stored.optimized,
          dataUrl: stored.dataUrl,
          createdAt: new Date().toISOString(),
          extractedAt: null,
          extractionSummary: '',
          sourceNote: note || ''
        };
        docs.push(doc);
        updateBusyModal(`Extrayendo texto ${index + 1}/${files.length}…`, doc.name);
        try {
          const text = await extractTextFromProductDocument(file, stored, getOcrWorker);
          if (text && text.trim()) {
            extractedTexts.push(`DOCUMENTO: ${doc.name}
${text}`);
            doc.extractedAt = new Date().toISOString();
            doc.extractionSummary = trimText(text, 800);
          } else {
            warnings.push(`${doc.name}: no se detectó texto útil.`);
          }
        } catch (error) {
          console.error(error);
          warnings.push(`${doc.name}: no se pudo extraer texto automáticamente.`);
        }
      }
    } finally {
      if (ocrWorker) {
        try { await ocrWorker.terminate(); } catch (error) { console.warn(error); }
      }
    }

    product.documents.push(...docs);
    product.source = cleanProductSourceBase(product.source);
    product.updatedAt = new Date().toISOString();
    await saveState();

    const combinedText = extractedTexts.join('\n\n');
    const suggestions = buildProductSuggestionsFromDocumentText(product, combinedText);
    els.modalHost.innerHTML = '';
    return showDocumentExtractionReview(product, docs, suggestions, warnings);
  }

  async function showDocumentExtractionReview(product, docs, suggestions, warnings) {
    const entries = suggestionEntries(suggestions);
    const confident = entries.filter(entry => entry.confidence === 'alta').length;
    const moderate = entries.filter(entry => entry.confidence === 'media').length;
    const body = `
      <div class="notice">
        <strong>Documentación guardada: ${docs.length}</strong>
        <p>Se ha asociado a la ficha de ${escapeHtml(product.name)}. Revisa <strong>campo por campo</strong>: puedes aceptar la propuesta automática o sustituirla por tu dato manual dentro del mismo recuadro.</p>
      </div>
      <div class="notice extraction-guidance" style="margin-top:12px">
        <strong>Lectura estructurada.</strong>
        <p>Propuestas con confianza alta: <strong>${confident}</strong>. Propuestas con confianza media o revisión: <strong>${moderate}</strong>. Todo lo que no marques o no completes seguirá como <strong>A verificar</strong>.</p>
      </div>
      <section class="document-review-cards">
        ${DOCUMENT_REVIEW_FIELDS.map(field => renderDocumentReviewFieldCard(product, suggestions, field)).join('')}
      </section>
      ${warnings.length ? `<div class="warning-block" style="margin-top:12px"><strong>Avisos de extracción</strong><ul class="list-clean" style="margin-top:8px">${warnings.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : ''}
    `;
    const decision = await choiceDialog('Revisión documental campo por campo', body, [
      { id: 'apply', label: 'Aplicar campos marcados', className: 'primary-btn' },
      { id: 'manual', label: 'Abrir edición manual completa', className: 'secondary-btn' },
      { id: 'close', label: 'Cerrar sin aplicar', className: 'ghost-btn' }
    ], true);
    if (decision === 'manual') return showEditProductModal(product.id);
    if (decision !== 'apply') { els.modalHost.innerHTML = ''; return render(); }
    const reviewPayload = collectDocumentReviewPayload(product, suggestions);
    if (!reviewPayload.selectedKeys.length) {
      toast('No hay campos marcados para aplicar.');
      return showDocumentExtractionReview(product, docs, suggestions, warnings);
    }
    const validationErrors = validateDocumentReviewPayload(reviewPayload);
    if (validationErrors.length) {
      toast(validationErrors[0]);
      return showDocumentExtractionReview(product, docs, suggestions, warnings);
    }
    const applied = applyDocumentReviewValuesToProduct(product, reviewPayload.values, reviewPayload.selectedKeys);
    const updatedRows = propagateProductVerificationToTreatments(product);
    const resolvedAlerts = reconcileAlertsForProduct(product);
    product.updatedAt = new Date().toISOString();
    await saveState();
    els.modalHost.innerHTML = '';
    return showDocumentExtractionSummary(product, docs, applied, pendingLabelsForProduct(product), warnings, updatedRows, resolvedAlerts);
  }

  async function showDocumentExtractionSummary(product, docs, applied, pendingLabels, warnings, updatedRows, resolvedAlerts) {
    const body = `
      <div class="notice">
        <strong>Documentación guardada: ${docs.length}</strong>
        <p>Se ha asociado a la ficha de ${escapeHtml(product.name)}.</p>
      </div>
      <div class="subgrid" style="margin-top:12px">
        <section class="subcard compact-subcard">
          <h3>Datos aplicados tras revisión</h3>
          ${applied.length ? `<p>${applied.map(escapeHtml).join(' · ')}</p>` : '<p class="muted">No se aplicó ningún campo.</p>'}
        </section>
        <section class="subcard compact-subcard">
          <h3>Campos que siguen A verificar</h3>
          ${pendingLabels.length ? `<p>${pendingLabels.map(escapeHtml).join(' · ')}</p>` : '<p class="muted">No quedan campos técnicos pendientes detectados por este análisis.</p>'}
        </section>
      </div>
      ${warnings.length ? `<div class="warning-block" style="margin-top:12px"><strong>Avisos de extracción</strong><ul class="list-clean" style="margin-top:8px">${warnings.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : ''}
      <p class="muted">Cuaderno actualizado en ${updatedRows} registro(s). Alertas resueltas automáticamente: ${resolvedAlerts}.</p>
    `;
    const decision = await choiceDialog('Resultado de la aplicación', body, [
      { id: 'review', label: 'Revisar ficha manualmente', className: 'primary-btn' },
      { id: 'close', label: 'Cerrar', className: 'ghost-btn' }
    ]);
    if (decision === 'review') return showEditProductModal(product.id);
    render();
  }

  function cleanProductSourceBase(value) {
    const lines = String(value || '')
      .split(/\r?\n/)
      .map(line => line
        .replace(/\s*[·-]?\s*Documentaci[oó]n asociada:\s*.*$/i, '')
        .replace(/^Documentaci[oó]n asociada:\s*.*$/i, '')
        .trim())
      .filter(Boolean);
    return Array.from(new Set(lines)).join('\n');
  }

  function renderProductSource(product) {
    ensureProductDocumentShape(product);
    const base = cleanProductSourceBase(product.source);
    const baseLines = base
      ? base.split(/\r?\n/).map(line => `<div>${escapeHtml(line)}</div>`).join('')
      : '';
    const docLines = renderProductDocumentSourceGroups(product.documents || []);
    if (!baseLines && !docLines) return '<span>—</span>';
    return `<div class="product-source-list">${baseLines}${docLines}</div>`;
  }

  function renderProductDocumentSourceGroups(docs) {
    const groups = new Map();
    (docs || []).forEach(doc => {
      const day = documentContributionDate(doc);
      const names = groups.get(day) || [];
      const name = String(doc?.name || 'Documento técnico').trim() || 'Documento técnico';
      if (!names.includes(name)) names.push(name);
      groups.set(day, names);
    });
    return Array.from(groups.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([day, names]) => `<div><strong>${escapeHtml(formatDate(day))}</strong>: ${names.map(escapeHtml).join(', ')}</div>`)
      .join('');
  }

  function documentContributionDate(doc) {
    const raw = String(doc?.createdAt || '').slice(0, 10);
    return isIsoDate(raw) ? raw : todayLocalIso();
  }

  async function normalizeProductDocumentFile(file) {
    const mime = file?.type || inferMimeFromName(file?.name || '');
    if (mime.startsWith('image/')) return compressImageFileForStorage(file);
    if (mime === 'application/pdf') {
      const dataUrl = await readFileAsDataUrl(file);
      return { dataUrl, mimeType: 'application/pdf', optimized: false, sizeStored: estimateDataUrlBytes(dataUrl) };
    }
    throw new Error('Formato no admitido');
  }

  function inferMimeFromName(name) {
    const lower = String(name || '').toLowerCase();
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    return '';
  }

  async function compressImageFileForStorage(file) {
    const original = await readFileAsDataUrl(file);
    const image = await loadImageFromDataUrl(original);
    const maxSide = 2200;
    const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width || 1, image.naturalHeight || image.height || 1));
    const width = Math.max(1, Math.round((image.naturalWidth || image.width || 1) * ratio));
    const height = Math.max(1, Math.round((image.naturalHeight || image.height || 1) * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    ctx.drawImage(image, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
    return { dataUrl, mimeType: 'image/jpeg', optimized: true, sizeStored: estimateDataUrlBytes(dataUrl) };
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo.'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(file);
    });
  }

  function loadImageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('No se pudo procesar la imagen.'));
      image.src = dataUrl;
    });
  }

  function estimateDataUrlBytes(dataUrl) {
    const text = String(dataUrl || '');
    const base64 = text.includes(',') ? text.split(',').pop() : text;
    if (!base64) return 0;
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor(base64.length * 0.75) - padding);
  }

  async function extractTextFromProductDocument(file, stored, getOcrWorker) {
    if (stored.mimeType === 'application/pdf') return extractTextFromPdfFile(file, getOcrWorker);
    if (stored.mimeType.startsWith('image/')) return extractTextFromImageDataUrl(stored.dataUrl, getOcrWorker);
    return '';
  }

  let pdfJsLoaderPromise = null;
  async function loadPdfJsLibrary() {
    if (!pdfJsLoaderPromise) {
      pdfJsLoaderPromise = import('https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/build/pdf.min.mjs').then(module => {
        module.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/build/pdf.worker.min.mjs';
        return module;
      });
    }
    return pdfJsLoaderPromise;
  }

  let tesseractLoaderPromise = null;
  function loadTesseractLibrary() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (!tesseractLoaderPromise) {
      tesseractLoaderPromise = loadExternalScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js').then(() => {
        if (!window.Tesseract) throw new Error('Tesseract.js no quedó disponible.');
        return window.Tesseract;
      });
    }
    return tesseractLoaderPromise;
  }

  function loadExternalScript(src) {
    return new Promise((resolve, reject) => {
      const existing = Array.from(document.scripts).find(script => script.src === src);
      if (existing && existing.dataset.loaded === 'true') return resolve();
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error(`No se pudo cargar ${src}`)), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.dynamicLib = 'true';
      script.addEventListener('load', () => { script.dataset.loaded = 'true'; resolve(); }, { once: true });
      script.addEventListener('error', () => reject(new Error(`No se pudo cargar ${src}`)), { once: true });
      document.head.appendChild(script);
    });
  }

  async function extractTextFromImageDataUrl(dataUrl, getOcrWorker) {
    const worker = await getOcrWorker();
    const result = await worker.recognize(dataUrl);
    return result?.data?.text || '';
  }

  async function extractTextFromPdfFile(file, getOcrWorker) {
    const pdfjsLib = await loadPdfJsLibrary();
    const data = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    const maxPagesText = Math.min(pdf.numPages || 0, 10);
    const textParts = [];
    for (let pageNumber = 1; pageNumber <= maxPagesText; pageNumber += 1) {
      updateBusyModal(`Leyendo PDF: página ${pageNumber}/${maxPagesText}…`, file.name || 'PDF técnico');
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = (content.items || []).map(item => item.str || '').join(' ').replace(/\s+/g, ' ').trim();
      if (text) textParts.push(text);
    }
    const digitalText = textParts.join('\n\n').trim();
    if (digitalText.length >= 180) return digitalText;

    const maxPagesOcr = Math.min(pdf.numPages || 0, 4);
    const ocrParts = [];
    for (let pageNumber = 1; pageNumber <= maxPagesOcr; pageNumber += 1) {
      updateBusyModal(`OCR de PDF: página ${pageNumber}/${maxPagesOcr}…`, file.name || 'PDF técnico');
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.7 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: false });
      await page.render({ canvasContext: ctx, viewport }).promise;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.90);
      const ocrText = await extractTextFromImageDataUrl(dataUrl, getOcrWorker);
      if (ocrText && ocrText.trim()) ocrParts.push(ocrText.trim());
    }
    return [digitalText, ocrParts.join('\n\n')].filter(Boolean).join('\n\n');
  }

  function buildProductSuggestionsFromDocumentText(product, text) {
    const source = normalizeExtractionText(text);
    const suggestions = { pendingLabels: [], meta: {} };
    if (!source) {
      suggestions.pendingLabels = pendingLabelsForProduct(product);
      return suggestions;
    }

    const context = getProductExtractionContext(product);
    const tableEvidence = extractStructuredUseTableEvidence(source, context);

    addDocumentSuggestion(suggestions, 'registration', extractRegistrationFromText(source), {
      label: 'N.º de registro',
      confidence: 'alta',
      evidence: 'Patrón de registro ES-xxxxx detectado.'
    });

    const activeIngredients = extractActiveIngredientsFromText(text);
    addDocumentSuggestion(suggestions, 'activeIngredients', activeIngredients, {
      label: 'Principios activos',
      confidence: activeIngredients ? 'alta' : 'media',
      evidence: activeIngredients ? 'Línea de composición localizada.' : ''
    });

    const mixRule = extractMixRuleFromText(source);
    addDocumentSuggestion(suggestions, 'mixRule', mixRule, {
      label: 'MEZCLA',
      confidence: mixRule ? 'alta' : 'media',
      evidence: mixRule === 'SOLO' ? 'Texto equivalente a no combinar con otros productos.' : ''
    });

    const extractedUses = extractAuthorizedUsesFromText(source, context);
    addDocumentSuggestion(suggestions, 'allowedUses', extractedUses, {
      label: 'Cultivo / uso autorizado',
      confidence: extractedUses.length ? 'media' : 'media',
      evidence: extractedUses.length ? 'Uso detectado en la documentación; conviene revisar la denominación exacta.' : ''
    });

    const extractedObjectives = extractAuthorizedObjectivesFromText(source, context);
    addDocumentSuggestion(suggestions, 'allowedObjectives', extractedObjectives, {
      label: 'Plaga / patógeno u objetivo',
      confidence: extractedObjectives.length ? 'media' : 'media',
      evidence: extractedObjectives.length ? 'Objetivo detectado en la documentación; conviene revisar la denominación exacta.' : ''
    });

    const extractedInterval = tableEvidence?.applicationInterval || extractApplicationIntervalFromText(source);
    addDocumentSuggestion(suggestions, 'applicationInterval', extractedInterval, {
      label: 'Intervalo entre aplicaciones',
      confidence: tableEvidence?.applicationInterval ? tableEvidence.confidence : 'media',
      evidence: tableEvidence?.applicationInterval ? tableEvidence.evidenceLabel : 'Dato localizado fuera de una fila de cultivo inequívoca.'
    });

    const extractedStage = tableEvidence?.applicationStage || extractApplicationStageFromText(source);
    addDocumentSuggestion(suggestions, 'applicationStage', extractedStage, {
      label: 'Estadio / condiciones de aplicación',
      confidence: tableEvidence?.applicationStage ? tableEvidence.confidence : 'media',
      evidence: tableEvidence?.applicationStage ? tableEvidence.evidenceLabel : 'Dato localizado fuera de una fila de cultivo inequívoca.'
    });

    if (tableEvidence?.doseValue !== null && tableEvidence?.doseValue !== undefined && tableEvidence?.doseUnit) {
      const doseValueText = formatDocNumber(tableEvidence.doseValue);
      const doseUnit = tableEvidence.doseUnit;
      addDocumentSuggestion(suggestions, 'doseReference', `${doseValueText} ${doseUnit}\nÚNICO`, {
        label: 'Dosis recomendada',
        confidence: tableEvidence.confidence,
        evidence: tableEvidence.evidenceLabel
      });
      addDocumentSuggestion(suggestions, 'doseRule', {
        mode: 'fixed',
        displayUnit: doseUnit,
        expectedAppliedUnit: doseUnit,
        value: Number(tableEvidence.doseValue)
      }, {
        label: 'Regla de validación de dosis',
        confidence: tableEvidence.confidence,
        evidence: tableEvidence.evidenceLabel
      });
    } else {
      const doseFallback = extractDoseEvidenceFromText(text);
      if (doseFallback?.reference && doseFallback?.rule) {
        addDocumentSuggestion(suggestions, 'doseReference', doseFallback.reference, {
          label: 'Dosis recomendada',
          confidence: 'media',
          evidence: 'Dato localizado fuera de una fila de cultivo inequívoca.'
        });
        addDocumentSuggestion(suggestions, 'doseRule', doseFallback.rule, {
          label: 'Regla de validación de dosis',
          confidence: 'media',
          evidence: 'Requiere revisión antes de aplicar.'
        });
      }
    }

    if (tableEvidence?.volumeMin !== null && tableEvidence?.volumeMin !== undefined && tableEvidence?.volumeMax !== null && tableEvidence?.volumeMax !== undefined) {
      addDocumentSuggestion(suggestions, 'volumeReference', `Mín. ${formatDocNumber(tableEvidence.volumeMin)} L/ha\nMáx. ${formatDocNumber(tableEvidence.volumeMax)} L/ha`, {
        label: 'Volumen caldo',
        confidence: tableEvidence.confidence,
        evidence: tableEvidence.evidenceLabel
      });
      addDocumentSuggestion(suggestions, 'volumeRule', {
        mode: 'range',
        unit: 'L/ha',
        min: Number(tableEvidence.volumeMin),
        max: Number(tableEvidence.volumeMax)
      }, {
        label: 'Regla de validación de volumen',
        confidence: tableEvidence.confidence,
        evidence: tableEvidence.evidenceLabel
      });
    } else {
      const volumeFallback = extractVolumeEvidenceFromText(text);
      if (volumeFallback?.reference && volumeFallback?.rule) {
        addDocumentSuggestion(suggestions, 'volumeReference', volumeFallback.reference, {
          label: 'Volumen caldo',
          confidence: 'media',
          evidence: 'Dato localizado fuera de una fila de cultivo inequívoca.'
        });
        addDocumentSuggestion(suggestions, 'volumeRule', volumeFallback.rule, {
          label: 'Regla de validación de volumen',
          confidence: 'media',
          evidence: 'Requiere revisión antes de aplicar.'
        });
      }
    }

    const safetyPeriod = tableEvidence?.safetyPeriod || extractSafetyPeriodFromText(source);
    addDocumentSuggestion(suggestions, 'safetyPeriod', safetyPeriod, {
      label: 'P.S.',
      confidence: tableEvidence?.safetyPeriod ? tableEvidence.confidence : 'media',
      evidence: tableEvidence?.safetyPeriod ? tableEvidence.evidenceLabel : 'Dato detectado fuera de una fila de cultivo inequívoca.'
    });

    const maxApplications = Number.isFinite(tableEvidence?.maxApplications)
      ? tableEvidence.maxApplications
      : extractMaxApplicationsFromText(source);
    if (Number.isFinite(maxApplications)) {
      addDocumentSuggestion(suggestions, 'maxApplications', Number(maxApplications), {
        label: 'Máx. aplicaciones campaña',
        confidence: Number.isFinite(tableEvidence?.maxApplications) ? tableEvidence.confidence : 'media',
        evidence: Number.isFinite(tableEvidence?.maxApplications) ? tableEvidence.evidenceLabel : 'Dato detectado fuera de una fila de cultivo inequívoca.'
      });
    }

    suggestions.pendingLabels = pendingLabelsAfterSuggestions(product, suggestions);
    return suggestions;
  }

  function addDocumentSuggestion(suggestions, key, value, meta) {
    const isEmpty = value === null || value === undefined || value === '';
    if (isEmpty) return;
    suggestions[key] = value;
    suggestions.meta[key] = {
      label: meta?.label || key,
      confidence: meta?.confidence === 'alta' ? 'alta' : 'media',
      evidence: meta?.evidence || ''
    };
  }

  function suggestionEntries(suggestions) {
    return Object.keys(suggestions?.meta || {}).map(key => {
      const meta = suggestions.meta[key] || {};
      return {
        key,
        label: meta.label || key,
        confidence: meta.confidence === 'alta' ? 'alta' : 'media',
        evidence: meta.evidence || '',
        summary: summarizeSuggestionValue(suggestions[key])
      };
    });
  }

  function summarizeSuggestionValue(value) {
    if (Array.isArray(value)) return value.join(' · ');
    if (value && typeof value === 'object') {
      if (value.mode === 'fixed') return `${formatDocNumber(value.value)} ${value.displayUnit || value.expectedAppliedUnit || value.unit || ''}`.trim();
      if (value.mode === 'range') return `${formatDocNumber(value.min)}–${formatDocNumber(value.max)} ${value.displayUnit || value.expectedAppliedUnit || value.unit || ''}`.trim();
      if (value.mode === 'concentration_range_with_ha_limit') return `${formatDocNumber(value.min)}–${formatDocNumber(value.max)} % · límite ${formatDocNumber(value.perHaLimit)} ${value.perHaLimitUnit || ''}`.trim();
      if (value.mode === 'concentration_hl_range_with_ha_limit') return `${formatDocNumber(value.min)}–${formatDocNumber(value.max)} ${value.displayUnit || ''} · límite ${formatDocNumber(value.perHaLimit)} ${value.perHaLimitUnit || ''}`.trim();
      if (value.mode === 'concentration_fixed_with_ha_limit') return `${formatDocNumber(value.value)} % · límite ${formatDocNumber(value.perHaLimit)} ${value.perHaLimitUnit || ''}`.trim();
      if (value.mode === 'concentration_hl_range') return `${formatDocNumber(value.min)}–${formatDocNumber(value.max)} ${value.displayUnit || ''}`.trim();
      return JSON.stringify(value);
    }
    return trimText(String(value ?? ''), 120);
  }

  function getProductExtractionContext(product) {
    const rows = state.treatments.filter(row => normalizeComparableText(row.productName) === normalizeComparableText(product.name));
    const crops = rows.map(row => row.crop || '').filter(Boolean);
    const objectives = rows.map(row => row.objective || '').filter(Boolean);
    const prefersVine = crops.some(value => /VID/i.test(value)) || objectives.some(value => /MILDIO\s+DE\s+LA\s+VID/i.test(normalizeExtractionText(value)));
    return { crops, objectives, prefersVine };
  }

  function normalizeComparableText(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  }

  function normalizeExtractionText(text) {
    return String(text || '').replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  function extractStructuredUseTableEvidence(text, context) {
    const normalized = normalizeComparableText(text);
    if (!normalized) return null;
    const anchors = context?.prefersVine
      ? ['MILDIO DE LA VID', 'PLASMOPARA VITICOLA', ' VID ']
      : [' VID ', 'MILDIO DE LA VID', 'PLASMOPARA VITICOLA'];
    let segment = '';
    for (const anchor of anchors) {
      const idx = normalized.indexOf(anchor.trim());
      if (idx >= 0) {
        segment = normalized.slice(Math.max(0, idx - 35), idx + 260);
        break;
      }
    }
    if (!segment) return null;

    const doseMatch = segment.match(/\b(\d+(?:[.,]\d+)?)\s*(KG|G|L|ML|CC)\s*\/\s*HA\b/i)
      || segment.match(/\b(0[.,]\d{1,4}|\d+[.,]\d{1,4})\b(?=[\s\S]{0,40}(?:\b\d{1,2}\b|200|300|400|500|1000))/i);
    const doseValue = doseMatch ? Number(String(doseMatch[1]).replace(',', '.')) : null;
    const doseUnit = doseMatch?.[2] ? `${String(doseMatch[2]).toLowerCase()}/ha`.replace('ml', 'cc') : 'kg/ha';

    const volumeMatch = segment.match(/\b(\d{2,4})\s*(?:-|–|A)\s*(\d{2,4})\b(?=[\s\S]{0,24}(?:BBCH|\b\d{1,3}\b))/i)
      || segment.match(/\b(\d{2,4})\s*(?:-|–|A)\s*(\d{2,4})\b/i);
    const volumeMin = volumeMatch ? Number(volumeMatch[1]) : null;
    const volumeMax = volumeMatch ? Number(volumeMatch[2]) : null;

    const afterDose = doseMatch ? segment.slice(segment.indexOf(doseMatch[0]) + doseMatch[0].length) : segment;
    const applicationsMatch = afterDose.match(/\b(\d{1,2})\s*(?:\(|\[|(?:\d{1,2}\s*[-–]\s*\d{1,2})|INTERVALO|\b(?:7|10)\b)/i)
      || segment.match(/\b(\d{1,2})\s*\(\s*\d{1,2}(?:\s*[-–]\s*\d{1,2})?\s*\)/i);
    const maxApplications = applicationsMatch ? Number(applicationsMatch[1]) : null;
    const intervalMatch = afterDose.match(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\b/);
    const applicationInterval = intervalMatch ? `${intervalMatch[1]}-${intervalMatch[2]} días` : '';
    const stageMatch = segment.match(/BBCH\s*([0-9]{1,2}(?:\s*\/\s*[0-9]{1,2})?(?:\s*[-–]\s*[0-9]{1,2})?)/i);
    const applicationStage = stageMatch ? `BBCH ${stageMatch[1].replace(/\s+/g, '')}` : '';

    let safetyPeriod = '';
    if (volumeMatch) {
      const tail = segment.slice(segment.indexOf(volumeMatch[0]) + volumeMatch[0].length);
      const nums = [...tail.matchAll(/\b(\d{1,3})\b/g)].map(match => Number(match[1])).filter(value => Number.isFinite(value));
      const candidate = nums.length ? nums[nums.length - 1] : null;
      if (candidate !== null && candidate >= 1 && candidate <= 120) safetyPeriod = `${candidate} días`;
    }

    const score = [doseValue !== null, volumeMin !== null && volumeMax !== null, Number.isFinite(maxApplications), Boolean(safetyPeriod)].filter(Boolean).length;
    if (score < 2) return null;
    return {
      doseValue,
      doseUnit,
      volumeMin,
      volumeMax,
      maxApplications,
      safetyPeriod,
      applicationInterval,
      applicationStage,
      confidence: score >= 4 ? 'alta' : 'media',
      evidenceLabel: context?.prefersVine ? 'Fila de vid localizada en la tabla de usos y dosis.' : 'Fila de uso localizada en la tabla técnica.'
    };
  }

  function formatDocNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value ?? '');
    return Number.isInteger(number) ? String(number) : String(number).replace('.', ',');
  }

  function extractRegistrationFromText(text) {
    const patterns = [
      /(?:N[.º°O]?\s*)?(?:N[ÚU]M(?:ERO)?\s*)?(?:DE\s*)?REGISTRO[^A-Z0-9]{0,28}(ES-\d{5}|\d{5})/i,
      /\bES-\d{5}\b/i
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return (match[1] || match[0]).toUpperCase();
    }
    return '';
  }

  function extractSafetyPeriodFromText(text) {
    const match = text.match(/(?:PLAZO\s+DE\s+SEGURIDAD|P\.?\s*S\.?)\s*[:\-]?\s*(NO\s+PROCEDE|NO\s+APLICA|\d{1,3}\s*D[ÍI]AS?)/i);
    if (!match) return '';
    const value = match[1].replace(/\s+/g, ' ').trim();
    if (/NO\s+(?:PROCEDE|APLICA)/i.test(value)) return 'NO PROCEDE';
    return value.replace(/D[ÍI]AS?/i, 'días');
  }

  function extractMaxApplicationsFromText(text) {
    const patterns = [
      /(?:M[ÁA]X(?:IMO)?\.?\s*)?(\d{1,2})\s+(?:APLICACIONES|TRATAMIENTOS)(?:\s+(?:POR|EN)\s+CAMPA[ÑN]A)?/i,
      /(?:N[ÚU]MERO\s+M[ÁA]XIMO\s+DE\s+)?(?:APLICACIONES|TRATAMIENTOS)\s*(?:[:\-]?\s*)?(\d{1,2})/i
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const value = Number(match[1]);
        if (Number.isFinite(value)) return value;
      }
    }
    return null;
  }

  function extractActiveIngredientsFromText(text) {
    const lines = String(text || '').split(/\n+/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const compositionIndex = lines.findIndex(line => /COMPOSICI[ÓO]N|SUSTANCIA\s+ACTIVA|PRINCIPIOS?\s+ACTIVOS?/i.test(line));
    const candidates = [];
    if (compositionIndex >= 0) {
      candidates.push(lines[compositionIndex].replace(/^.*?(?:COMPOSICI[ÓO]N|SUSTANCIA\s+ACTIVA|PRINCIPIOS?\s+ACTIVOS?)\s*[:\-]?\s*/i, '').trim());
      candidates.push(lines[compositionIndex + 1] || '');
    }
    candidates.push(...lines.filter(line => /\b\d+(?:[.,]\d+)?\s*%\s*(?:P\/P|P\/V)?|\b\d+\s*G\/KG\b/i.test(line)));
    const best = candidates.map(line => line.trim()).find(line => line && /%|G\/KG|G\/L/i.test(line.toUpperCase()) && !/REACCI[ÓO]N|ATENCI[ÓO]N|PELIGRO|CONTENIDO|UFI/i.test(line));
    if (!best) return '';
    const cleanMatch = best.match(/^(.+?\(\s*\d+(?:[.,]\d+)?\s*g\s*\/\s*(?:kg|l)\s*\))/i);
    return trimText(cleanMatch ? cleanMatch[1] : best, 180);
  }

  function extractMixRuleFromText(text) {
    if (/DEBE\s+APLICARSE\s+SOLO|APLICAR(?:SE)?\s+SOLO|NO\s+(?:DEBE\s+)?MEZCLAR(?:SE)?|NO\s+MEZCLAR\s+CON|NO\s+SE\s+USAR[ÁA]\s+EN\s+COMBINACI[ÓO]N\s+CON\s+OTROS\s+PRODUCTOS/i.test(text)) return 'SOLO';
    return '';
  }

  function extractDoseEvidenceFromText(text) {
    const lines = String(text || '').split(/\n+/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const selected = lines.filter(line => /DOSIS|KG\/HA|G\/HL|CC\/HL|ML\/HL|L\/HA|%/i.test(line)).slice(0, 2);
    if (!selected.length) return null;
    const reference = trimText(selected.join(' · '), 200);
    const source = reference.replace(/,/g, '.');
    const fixed = source.match(/(?:DOSIS[^0-9]{0,24})?(\d+(?:\.\d+)?)\s*(KG|G|L|ML|CC)\s*\/\s*HA\b/i);
    if (fixed && !/(M[ÍI]N|M[ÁA]X|A\s+\d)/i.test(source)) {
      const unit = `${fixed[2].toLowerCase()}/ha`.replace('ml', 'cc');
      return { reference, rule: { mode: 'fixed', displayUnit: unit, expectedAppliedUnit: unit, value: Number(fixed[1]) } };
    }
    return null;
  }

  function extractVolumeEvidenceFromText(text) {
    const lines = String(text || '').split(/\n+/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const selected = lines.filter(line => /VOLUMEN|CALDO|L\/HA/i.test(line)).slice(0, 2);
    if (!selected.length) return null;
    const reference = trimText(selected.join(' · '), 200);
    const source = reference.replace(/,/g, '.');
    const range = source.match(/(\d+(?:\.\d+)?)\s*(?:-|–|A)\s*(\d+(?:\.\d+)?)\s*L\s*\/\s*HA/i);
    if (range) {
      return { reference, rule: { mode: 'range', unit: 'L/ha', min: Number(range[1]), max: Number(range[2]) } };
    }
    if (/NO\s+CONSTA/i.test(source)) return { reference: 'NO CONSTA', rule: { mode: 'not_listed' } };
    return null;
  }

  function extractAuthorizedUsesFromText(text, context) {
    const normalized = normalizeComparableText(text);
    const uses = [];
    if (/\bVID\b|MILDIO DE LA VID|PLASMOPARA VITICOLA/.test(normalized)) uses.push('Vid de vinificación');
    if (!uses.length && context?.crops?.length) uses.push(...context.crops);
    return mergeUniqueTextValues([], uses);
  }

  function extractAuthorizedObjectivesFromText(text, context) {
    const normalized = normalizeComparableText(text);
    const objectives = [];
    if (/MILDIO DE LA VID|PLASMOPARA VITICOLA/.test(normalized)) objectives.push('Mildiu de la vid (Plasmopara viticola)');
    if (!objectives.length && context?.objectives?.length) objectives.push(...context.objectives);
    return mergeUniqueTextValues([], objectives);
  }

  function extractApplicationIntervalFromText(text) {
    const normalized = normalizeExtractionText(text);
    const explicit = normalized.match(/INTERVALO[^0-9]{0,20}(\d{1,2})\s*[-–]\s*(\d{1,2})\s*D[IÍ]AS?/i)
      || normalized.match(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\s*D[IÍ]AS?\b/i);
    return explicit ? `${explicit[1]}-${explicit[2]} días` : '';
  }

  function extractApplicationStageFromText(text) {
    const normalized = normalizeExtractionText(text);
    const match = normalized.match(/BBCH\s*([0-9]{1,2}(?:\s*\/\s*[0-9]{1,2})?(?:\s*[-–]\s*[0-9]{1,2})?)/i);
    return match ? `BBCH ${match[1].replace(/\s+/g, '')}` : '';
  }

  function applyDocumentSuggestionsToProduct(product, suggestions, selectedKeys = null) {
    return applyDocumentReviewValuesToProduct(product, suggestions || {}, selectedKeys);
  }

  function applyDocumentReviewValuesToProduct(product, values, selectedKeys = null) {
    ensureProductDocumentShape(product);
    const applied = [];
    const selected = Array.isArray(selectedKeys) ? new Set(selectedKeys) : null;
    const canApply = key => !selected || selected.has(key);
    const applyText = (key, value, label) => {
      if (!canApply(key) || value === null || value === undefined || value === '') return;
      if (!product[key] || containsPending(product[key]) || key === 'applicationInterval' || key === 'applicationStage') {
        product[key] = value;
        applied.push(label);
      }
    };
    applyText('registration', values.registration, 'N.º de registro');
    applyText('doseReference', values.doseReference, 'Dosis recomendada');
    applyText('volumeReference', values.volumeReference, 'Volumen caldo');
    applyText('safetyPeriod', values.safetyPeriod, 'P.S.');
    applyText('activeIngredients', values.activeIngredients, 'Principios activos');
    applyText('mixRule', values.mixRule, 'MEZCLA');
    applyText('applicationInterval', values.applicationInterval, 'Intervalo entre aplicaciones');
    applyText('applicationStage', values.applicationStage, 'Estadio / condiciones de aplicación');
    if (canApply('maxApplications') && (product.maxApplications === null || product.maxApplications === undefined || containsPending(product.maxApplications)) && (Number.isFinite(values.maxApplications) || values.maxApplications === null)) {
      product.maxApplications = values.maxApplications;
      applied.push('Máx. aplicaciones campaña');
    }
    if (canApply('doseRule') && (!product.doseRule || product.doseRule.mode === 'pending') && values.doseRule && values.doseRule.mode && values.doseRule.mode !== 'pending') {
      product.doseRule = values.doseRule;
      applied.push('Regla de validación de dosis');
    }
    if (canApply('volumeRule') && (!product.volumeRule || product.volumeRule.mode === 'pending') && values.volumeRule && values.volumeRule.mode && values.volumeRule.mode !== 'pending') {
      product.volumeRule = values.volumeRule;
      applied.push('Regla de validación de volumen');
    }
    if (canApply('allowedUses') && Array.isArray(values.allowedUses) && values.allowedUses.length) {
      product.allowedUses = mergeUniqueTextValues(product.allowedUses, values.allowedUses);
      applied.push('Cultivo / uso autorizado');
    }
    if (canApply('allowedObjectives') && Array.isArray(values.allowedObjectives) && values.allowedObjectives.length) {
      product.allowedObjectives = mergeUniqueTextValues(product.allowedObjectives, values.allowedObjectives);
      applied.push('Plaga / patógeno u objetivo');
    }
    product.verificationStatus = productHasTechnicalPending(product) ? 'PENDING' : product.verificationStatus;
    product.updatedAt = new Date().toISOString();
    return applied;
  }

  function renderDocumentReviewFieldCard(product, suggestions, field) {
    const suggestion = suggestions?.[field.key];
    const meta = suggestions?.meta?.[field.key] || {};
    const hasSuggestion = suggestion !== null && suggestion !== undefined && suggestion !== '' && !(Array.isArray(suggestion) && !suggestion.length);
    const confidence = hasSuggestion ? (meta.confidence === 'alta' ? 'alta' : 'media') : 'none';
    const confidenceLabel = confidence === 'alta' ? 'Confianza alta' : confidence === 'media' ? 'Revisar' : 'No detectado';
    const confidenceClass = confidence === 'alta' ? 'ok' : confidence === 'media' ? 'warn' : 'pending';
    const summary = hasSuggestion ? summarizeSuggestionValue(suggestion) : 'Sin propuesta automática.';
    const checked = confidence === 'alta' ? 'checked' : '';
    const requiredTag = field.required ? '<span class="tag pending">Campo técnico</span>' : '<span class="tag">Informativo</span>';
    return `
      <article class="document-review-card ${confidence === 'alta' ? 'high' : confidence === 'media' ? 'medium' : 'empty'}">
        <div class="document-review-top">
          <label class="document-review-accept">
            <input type="checkbox" data-review-accept="${escapeAttr(field.key)}" ${checked}>
            <span>${escapeHtml(field.label)}</span>
          </label>
          <div class="document-review-tags">${requiredTag}<span class="tag ${confidenceClass}">${confidenceLabel}</span></div>
        </div>
        <div class="document-review-extracted">
          <strong>Propuesta automática</strong>
          <p>${escapeHtml(summary)}</p>
          ${meta.evidence ? `<small>Evidencia: ${escapeHtml(meta.evidence)}</small>` : '<small>Sin evidencia suficiente para proponer un valor.</small>'}
        </div>
        <div class="document-review-manual">
          <strong>Corrección / entrada manual</strong>
          <p class="muted">Si escribes aquí y marcas el recuadro azul, se aplicará tu valor manual en lugar de la propuesta.</p>
          ${renderDocumentReviewManualEditor(product, suggestions, field)}
        </div>
      </article>
    `;
  }

  function renderDocumentReviewManualEditor(product, suggestions, field) {
    const suggestion = suggestions?.[field.key];
    switch (field.kind) {
      case 'textarea':
        return `<textarea data-review-manual="${escapeAttr(field.key)}" placeholder="Escribe el valor correcto o deja vacío para usar la propuesta automática."></textarea>`;
      case 'volumeReferenceStructured':
        return renderDocumentReviewVolumeReferenceEditor(suggestion, suggestions?.volumeRule);
      case 'lines':
        return `<textarea data-review-manual="${escapeAttr(field.key)}" placeholder="Uno por línea. Ej.: Vid de vinificación"></textarea>`;
      case 'mix':
        return `<select data-review-manual="${escapeAttr(field.key)}">${renderSimpleOptions([
          ['', 'Usar propuesta automática / no cambiar'],
          ['A verificar', 'A verificar'],
          ['----', 'Sin obligación de SOLO'],
          ['SOLO', 'SOLO']
        ], '')}</select>`;
      case 'integerOrNoConsta':
        return `<input data-review-manual="${escapeAttr(field.key)}" inputmode="numeric" placeholder="Número o NO CONSTA">`;
      case 'doseRule':
        return renderDocumentReviewDoseRuleEditor(suggestion);
      case 'volumeRule':
        return renderDocumentReviewVolumeRuleEditor(suggestion);
      case 'text':
      default:
        return `<input data-review-manual="${escapeAttr(field.key)}" placeholder="Escribe el valor correcto o deja vacío para usar la propuesta automática.">`;
    }
  }

  function renderDocumentReviewDoseRuleEditor(suggestion) {
    const preset = normalizeDoseReviewSuggestion(suggestion);
    return `
      <div class="dose-review-editor" data-dose-review-editor>
        <div class="dose-review-info"><strong>Revisa la dosis indicada en la etiqueta y completa solo lo necesario.</strong></div>
        <div class="dose-review-stephead">
          <span class="step-badge">1</span>
          <div>
            <strong>¿Qué indica la etiqueta sobre la dosis?</strong>
            <p>Elige el tipo de información disponible.</p>
          </div>
        </div>
        <div class="dose-choice-list">
          <label class="dose-choice-card ${preset.uiMode === 'fixed' ? 'selected' : ''}">
            <input type="radio" name="doseRuleUiMode" data-dose-ui-mode value="fixed" ${preset.uiMode === 'fixed' ? 'checked' : ''}>
            <div>
              <strong>Dosis única por ha</strong>
              <small>Indica un único valor por hectárea.</small>
            </div>
          </label>
          <label class="dose-choice-card ${preset.uiMode === 'range' ? 'selected' : ''}">
            <input type="radio" name="doseRuleUiMode" data-dose-ui-mode value="range" ${preset.uiMode === 'range' ? 'checked' : ''}>
            <div>
              <strong>Rango mínimo – máximo por ha</strong>
              <small>Indica un mínimo y un máximo por hectárea.</small>
            </div>
          </label>
          <label class="dose-choice-card ${preset.uiMode === 'concentration' ? 'selected' : ''}">
            <input type="radio" name="doseRuleUiMode" data-dose-ui-mode value="concentration" ${preset.uiMode === 'concentration' ? 'checked' : ''}>
            <div>
              <strong>Concentración + límite por ha</strong>
              <small>Indica concentración de caldo y límite por hectárea.</small>
            </div>
          </label>
        </div>
        <div class="dose-review-stephead secondary">
          <span class="step-badge">2</span>
          <div>
            <strong>Introduce los datos</strong>
            <p>Solo se muestran los campos necesarios según la opción elegida.</p>
          </div>
        </div>
        <div class="dose-review-note">Todos los valores deben referirse a hectárea (ha).</div>

        <section class="dose-panel ${preset.uiMode === 'fixed' ? '' : 'hidden'}" data-dose-panel="fixed">
          <h4>Dosis única por ha</h4>
          <div class="inline-fields two">
            <div class="field"><span>Valor</span><input data-review-rule-field="doseRule.value" value="${escapeAttr(ruleInputValue(preset.fixedValue))}" inputmode="decimal" placeholder="Ej. 2,5"></div>
            <div class="field"><span>Unidad</span><select data-review-rule-field="doseRule.displayUnit" data-dose-fixed-unit>${renderSimpleOptions([
              ['kg/ha','kg/ha'], ['L/ha','L/ha']
            ], preset.fixedUnit || 'kg/ha')}</select></div>
          </div>
          <input type="hidden" data-review-rule-field="doseRule.expectedAppliedUnit" value="${escapeAttr(preset.fixedExpectedUnit || preset.fixedUnit || 'kg/ha')}">
        </section>

        <section class="dose-panel ${preset.uiMode === 'range' ? '' : 'hidden'}" data-dose-panel="range">
          <h4>Rango por ha</h4>
          <div class="inline-fields two">
            <div class="field"><span>Mínimo</span><input data-review-rule-field="doseRule.min" value="${escapeAttr(ruleInputValue(preset.rangeMin))}" inputmode="decimal" placeholder="Ej. 2"></div>
            <div class="field"><span>Máximo</span><input data-review-rule-field="doseRule.max" value="${escapeAttr(ruleInputValue(preset.rangeMax))}" inputmode="decimal" placeholder="Ej. 3"></div>
          </div>
          <div class="field"><span>Unidad</span><select data-review-rule-field="doseRule.displayUnit" data-dose-range-unit>${renderSimpleOptions([
            ['kg/ha','kg/ha'], ['L/ha','L/ha']
          ], preset.rangeUnit || 'kg/ha')}</select></div>
          <input type="hidden" data-review-rule-field="doseRule.expectedAppliedUnit" value="${escapeAttr(preset.rangeExpectedUnit || preset.rangeUnit || 'kg/ha')}">
        </section>

        <section class="dose-panel ${preset.uiMode === 'concentration' ? '' : 'hidden'}" data-dose-panel="concentration">
          <h4>Concentración + límite por ha</h4>
          <div class="inline-fields two">
            <div class="field"><span>Tipo de concentración</span><select data-dose-concentration-kind>${renderSimpleOptions([
              ['fixed','Concentración única'], ['range','Rango de concentración']
            ], preset.concentrationKind || 'range')}</select></div>
            <div class="field"><span>Unidad visible</span><select data-dose-concentration-unit>${renderSimpleOptions([
              ['%','%'], ['g/hL','g/hL'], ['cc/hL','cc/hL']
            ], preset.concentrationUnit || '%')}</select></div>
          </div>
          <div class="inline-fields two ${preset.concentrationKind === 'fixed' ? '' : 'hidden'}" data-dose-concentration-panel="fixed">
            <div class="field"><span>Valor único</span><input data-review-rule-field="doseRule.value" value="${escapeAttr(ruleInputValue(preset.concentrationValue))}" inputmode="decimal" placeholder="Ej. 0,25"></div>
            <div class="field"><span>Límite por ha</span><input data-review-rule-field="doseRule.perHaLimit" value="${escapeAttr(ruleInputValue(preset.perHaLimit))}" inputmode="decimal" placeholder="Si consta"></div>
          </div>
          <div class="inline-fields two ${preset.concentrationKind === 'range' ? '' : 'hidden'}" data-dose-concentration-panel="range">
            <div class="field"><span>Mínimo</span><input data-review-rule-field="doseRule.min" value="${escapeAttr(ruleInputValue(preset.concentrationMin))}" inputmode="decimal" placeholder="Ej. 0,2"></div>
            <div class="field"><span>Máximo</span><input data-review-rule-field="doseRule.max" value="${escapeAttr(ruleInputValue(preset.concentrationMax))}" inputmode="decimal" placeholder="Ej. 0,3"></div>
          </div>
          <div class="inline-fields two ${preset.concentrationKind === 'range' ? '' : 'hidden'}" data-dose-concentration-panel="rangeLimit">
            <div class="field"><span>Límite por ha</span><input data-review-rule-field="doseRule.perHaLimit" value="${escapeAttr(ruleInputValue(preset.perHaLimit))}" inputmode="decimal" placeholder="Si consta"></div>
            <div class="field"><span>Unidad límite por ha</span><select data-review-rule-field="doseRule.perHaLimitUnit">${renderSimpleOptions([
              ['kg/ha','kg/ha'], ['L/ha','L/ha']
            ], preset.perHaLimitUnit || 'kg/ha')}</select></div>
          </div>
          <div class="inline-fields two ${preset.concentrationKind === 'fixed' ? '' : 'hidden'}" data-dose-concentration-panel="fixedLimitUnit">
            <div class="field"><span>Unidad límite por ha</span><select data-review-rule-field="doseRule.perHaLimitUnit">${renderSimpleOptions([
              ['kg/ha','kg/ha'], ['L/ha','L/ha']
            ], preset.perHaLimitUnit || 'kg/ha')}</select></div>
            <div class="field dose-auto-note"><span>Automatización</span><div class="input-like">La unidad aplicada esperada se ajusta automáticamente.</div></div>
          </div>
          <input type="hidden" data-review-rule-field="doseRule.displayUnit" value="${escapeAttr(preset.concentrationUnit || '%')}">
          <input type="hidden" data-review-rule-field="doseRule.expectedAppliedUnit" value="${escapeAttr(preset.concentrationExpectedUnit || '%')}">
        </section>
      </div>
    `;
  }

  function normalizeDoseReviewSuggestion(suggestion) {
    const base = {
      uiMode: '',
      fixedUnit: 'kg/ha',
      fixedExpectedUnit: 'kg/ha',
      fixedValue: '',
      rangeUnit: 'kg/ha',
      rangeExpectedUnit: 'kg/ha',
      rangeMin: '',
      rangeMax: '',
      concentrationKind: 'range',
      concentrationUnit: '%',
      concentrationExpectedUnit: '%',
      concentrationValue: '',
      concentrationMin: '',
      concentrationMax: '',
      perHaLimit: '',
      perHaLimitUnit: 'kg/ha'
    };
    if (!suggestion || typeof suggestion !== 'object') return base;
    if (suggestion.mode === 'fixed') {
      base.uiMode = 'fixed';
      base.fixedUnit = suggestion.displayUnit || suggestion.expectedAppliedUnit || 'kg/ha';
      base.fixedExpectedUnit = suggestion.expectedAppliedUnit || base.fixedUnit;
      base.fixedValue = ruleInputValue(suggestion.value);
      return base;
    }
    if (suggestion.mode === 'range') {
      base.uiMode = 'range';
      base.rangeUnit = suggestion.displayUnit || suggestion.expectedAppliedUnit || 'kg/ha';
      base.rangeExpectedUnit = suggestion.expectedAppliedUnit || base.rangeUnit;
      base.rangeMin = ruleInputValue(suggestion.min);
      base.rangeMax = ruleInputValue(suggestion.max);
      return base;
    }
    if (String(suggestion.mode || '').startsWith('concentration')) {
      base.uiMode = 'concentration';
      base.concentrationKind = (suggestion.mode === 'concentration_fixed_with_ha_limit') ? 'fixed' : 'range';
      base.concentrationUnit = suggestion.displayUnit || '%';
      base.concentrationExpectedUnit = suggestion.expectedAppliedUnit || base.concentrationUnit;
      base.concentrationValue = ruleInputValue(suggestion.value);
      base.concentrationMin = ruleInputValue(suggestion.min);
      base.concentrationMax = ruleInputValue(suggestion.max);
      base.perHaLimit = ruleInputValue(suggestion.perHaLimit);
      base.perHaLimitUnit = suggestion.perHaLimitUnit || 'kg/ha';
      return base;
    }
    return base;
  }

  function getSelectedDoseUiMode(root = document) {
    return root.querySelector('[data-dose-ui-mode]:checked')?.value || '';
  }

  function syncReviewDoseRulePanels(root) {
    if (!root) return;
    const uiMode = getSelectedDoseUiMode(root);
    root.querySelectorAll('.dose-choice-card').forEach(card => {
      const input = card.querySelector('[data-dose-ui-mode]');
      card.classList.toggle('selected', !!input?.checked);
    });
    root.querySelector('[data-dose-panel="fixed"]')?.classList.toggle('hidden', uiMode !== 'fixed');
    root.querySelector('[data-dose-panel="range"]')?.classList.toggle('hidden', uiMode !== 'range');
    root.querySelector('[data-dose-panel="concentration"]')?.classList.toggle('hidden', uiMode !== 'concentration');

    const rangeUnit = root.querySelector('[data-dose-range-unit]')?.value || 'kg/ha';
    const fixedUnit = root.querySelector('[data-dose-fixed-unit]')?.value || 'kg/ha';
    const concUnit = root.querySelector('[data-dose-concentration-unit]')?.value || '%';
    const concKind = root.querySelector('[data-dose-concentration-kind]')?.value || 'range';

    const fixedExpected = root.querySelector('[data-dose-panel="fixed"] [data-review-rule-field="doseRule.expectedAppliedUnit"]');
    if (fixedExpected) fixedExpected.value = fixedUnit;
    const rangeExpected = root.querySelector('[data-dose-panel="range"] [data-review-rule-field="doseRule.expectedAppliedUnit"]');
    if (rangeExpected) rangeExpected.value = rangeUnit;
    const concDisplay = root.querySelector('[data-dose-panel="concentration"] [data-review-rule-field="doseRule.displayUnit"]');
    if (concDisplay) concDisplay.value = concUnit;
    const concExpected = root.querySelector('[data-dose-panel="concentration"] [data-review-rule-field="doseRule.expectedAppliedUnit"]');
    if (concExpected) concExpected.value = concUnit === '%' ? '%' : concUnit;

    root.querySelector('[data-dose-concentration-panel="fixed"]')?.classList.toggle('hidden', concKind !== 'fixed');
    root.querySelector('[data-dose-concentration-panel="range"]')?.classList.toggle('hidden', concKind !== 'range');
    root.querySelector('[data-dose-concentration-panel="rangeLimit"]')?.classList.toggle('hidden', concKind !== 'range');
    root.querySelector('[data-dose-concentration-panel="fixedLimitUnit"]')?.classList.toggle('hidden', concKind !== 'fixed');
  }

  function collectDoseRuleManualFromReview() {
    const root = document.querySelector('[data-dose-review-editor]');
    if (!root) return { hasManual: false, value: null };
    const uiMode = getSelectedDoseUiMode(root);
    if (!uiMode) return { hasManual: false, value: null };
    if (uiMode === 'fixed') {
      const unit = root.querySelector('[data-dose-fixed-unit]')?.value || 'kg/ha';
      return {
        hasManual: true,
        value: buildDoseRuleFromEdit({
          mode: 'fixed',
          displayUnit: unit,
          expectedAppliedUnit: unit,
          value: readReviewRuleNumeric('doseRule.value')
        })
      };
    }
    if (uiMode === 'range') {
      const unit = root.querySelector('[data-dose-range-unit]')?.value || 'kg/ha';
      return {
        hasManual: true,
        value: buildDoseRuleFromEdit({
          mode: 'range',
          displayUnit: unit,
          expectedAppliedUnit: unit,
          min: readReviewRuleNumeric('doseRule.min'),
          max: readReviewRuleNumeric('doseRule.max')
        })
      };
    }
    if (uiMode === 'concentration') {
      const concKind = root.querySelector('[data-dose-concentration-kind]')?.value || 'range';
      const concUnit = root.querySelector('[data-dose-concentration-unit]')?.value || '%';
      const perHaLimitUnit = Array.from(root.querySelectorAll('[data-dose-panel="concentration"] [data-review-rule-field="doseRule.perHaLimitUnit"]')).find(el => !el.closest('.hidden'))?.value || 'kg/ha';
      const mode = concKind === 'fixed'
        ? (concUnit === '%' ? 'concentration_fixed_with_ha_limit' : 'concentration_hl_range_with_ha_limit')
        : (concUnit === '%' ? 'concentration_range_with_ha_limit' : 'concentration_hl_range_with_ha_limit');
      const payload = {
        mode,
        displayUnit: concUnit,
        expectedAppliedUnit: concUnit,
        perHaLimit: readReviewRuleNumeric('doseRule.perHaLimit'),
        perHaLimitUnit
      };
      if (concKind === 'fixed') {
        const value = readReviewRuleNumeric('doseRule.value');
        if (concUnit === '%') {
          payload.value = value;
        } else {
          payload.min = value;
          payload.max = value;
        }
      } else {
        payload.min = readReviewRuleNumeric('doseRule.min');
        payload.max = readReviewRuleNumeric('doseRule.max');
      }
      return { hasManual: true, value: buildDoseRuleFromEdit(payload) };
    }
    return { hasManual: false, value: null };
  }


  function renderDocumentReviewVolumeReferenceEditor(suggestion, ruleSuggestion) {
    const preset = normalizeVolumeReviewSuggestion(suggestion, ruleSuggestion);
    return `
      <div class="dose-review-editor" data-review-volume-editor="volumeReference">
        <div class="dose-review-info"><strong>Revisa el volumen de caldo indicado en la etiqueta y completa solo lo necesario.</strong></div>
        <div class="dose-review-stephead">
          <span class="step-badge">1</span>
          <div>
            <strong>¿Qué indica la etiqueta sobre el volumen de caldo?</strong>
            <p>Unidad fija: <strong>L/ha</strong>.</p>
          </div>
        </div>
        <div class="dose-choice-list">
          <label class="dose-choice-card ${preset.uiMode === 'fixed' ? 'selected' : ''}">
            <input type="radio" name="volumeReferenceUiMode" data-volume-ui-mode value="fixed" ${preset.uiMode === 'fixed' ? 'checked' : ''}>
            <div>
              <strong>Volumen único</strong>
              <small>La etiqueta indica un único volumen de caldo por hectárea.</small>
            </div>
          </label>
          <label class="dose-choice-card ${preset.uiMode === 'range' ? 'selected' : ''}">
            <input type="radio" name="volumeReferenceUiMode" data-volume-ui-mode value="range" ${preset.uiMode === 'range' ? 'checked' : ''}>
            <div>
              <strong>Volumen mínimo – máximo</strong>
              <small>La etiqueta indica un mínimo y un máximo por hectárea.</small>
            </div>
          </label>
          <label class="dose-choice-card ${preset.uiMode === 'not_listed' ? 'selected' : ''}">
            <input type="radio" name="volumeReferenceUiMode" data-volume-ui-mode value="not_listed" ${preset.uiMode === 'not_listed' ? 'checked' : ''}>
            <div>
              <strong>No consta</strong>
              <small>La documentación no indica volumen de caldo para este uso.</small>
            </div>
          </label>
        </div>
        <div class="dose-review-stephead secondary">
          <span class="step-badge">2</span>
          <div>
            <strong>Introduce los datos</strong>
            <p>Solo se muestran los campos necesarios según la opción elegida.</p>
          </div>
        </div>
        <div class="dose-review-note">La regla de validación de volumen se generará automáticamente a partir de esta selección.</div>

        <section class="dose-panel ${preset.uiMode === 'fixed' ? '' : 'hidden'}" data-review-volume-panel="volumeReference.fixed">
          <h4>Volumen único</h4>
          <div class="field"><span>Volumen único</span><input data-review-volume-field="volumeReference.value" value="${escapeAttr(ruleInputValue(preset.fixedValue))}" inputmode="decimal" placeholder="Ej. 400"></div>
        </section>

        <section class="dose-panel ${preset.uiMode === 'range' ? '' : 'hidden'}" data-review-volume-panel="volumeReference.range">
          <h4>Volumen mínimo – máximo</h4>
          <div class="inline-fields two">
            <div class="field"><span>Volumen mínimo</span><input data-review-volume-field="volumeReference.min" value="${escapeAttr(ruleInputValue(preset.min))}" inputmode="decimal" placeholder="Ej. 300"></div>
            <div class="field"><span>Volumen máximo</span><input data-review-volume-field="volumeReference.max" value="${escapeAttr(ruleInputValue(preset.max))}" inputmode="decimal" placeholder="Ej. 500"></div>
          </div>
        </section>
      </div>
    `;
  }

  function normalizeVolumeReviewSuggestion(suggestion, ruleSuggestion) {
    const preset = { uiMode: '', fixedValue: '', min: '', max: '' };
    const rule = ruleSuggestion && typeof ruleSuggestion === 'object' ? ruleSuggestion : null;
    if (rule?.mode === 'fixed') {
      preset.uiMode = 'fixed';
      preset.fixedValue = ruleInputValue(rule.value);
      return preset;
    }
    if (rule?.mode === 'range') {
      preset.uiMode = 'range';
      preset.min = ruleInputValue(rule.min);
      preset.max = ruleInputValue(rule.max);
      return preset;
    }
    if (rule?.mode === 'not_listed') {
      preset.uiMode = 'not_listed';
      return preset;
    }
    const normalized = String(suggestion || '').replace(/\s+/g, ' ').replace(/,/g, '.').trim();
    if (!normalized) return preset;
    if (/NO\s+CONSTA/i.test(normalized)) {
      preset.uiMode = 'not_listed';
      return preset;
    }
    const range = normalized.match(/M[IÍ]N\.?\s*(\d+(?:\.\d+)?)\s*L\s*\/\s*HA.*M[ÁA]X\.?\s*(\d+(?:\.\d+)?)\s*L\s*\/\s*HA/i)
      || normalized.match(/(\d+(?:\.\d+)?)\s*(?:-|–|A)\s*(\d+(?:\.\d+)?)\s*L\s*\/\s*HA/i);
    if (range) {
      preset.uiMode = 'range';
      preset.min = range[1];
      preset.max = range[2];
      return preset;
    }
    const fixed = normalized.match(/(\d+(?:\.\d+)?)\s*L\s*\/\s*HA/i);
    if (fixed) {
      preset.uiMode = 'fixed';
      preset.fixedValue = fixed[1];
    }
    return preset;
  }


  function renderDocumentReviewVolumeRuleEditor(suggestion) {
    return `
      <div class="review-rule-editor" data-review-rule="volumeRule">
        <div class="field"><span>Tipo de regla de volumen</span><select data-review-rule-field="volumeRule.mode">${renderSimpleOptions([
          ['', 'Usar propuesta automática / no cambiar'],
          ['pending', 'A verificar'],
          ['fixed', 'Volumen único'],
          ['range', 'Volumen mínimo y máximo'],
          ['not_listed', 'No consta en documentación']
        ], '')}</select></div>
        <p class="muted compact-note">Unidad fija: <strong>L/ha</strong>.</p>
        <div class="hidden" data-review-volume-rule-panel="volumeRule.fixed">
          <div class="field"><span>Volumen único</span><input data-review-rule-field="volumeRule.value" inputmode="decimal" placeholder="L/ha"></div>
        </div>
        <div class="hidden" data-review-volume-rule-panel="volumeRule.range">
          <div class="inline-fields two">
            <div class="field"><span>Volumen mínimo</span><input data-review-rule-field="volumeRule.min" inputmode="decimal" placeholder="L/ha"></div>
            <div class="field"><span>Volumen máximo</span><input data-review-rule-field="volumeRule.max" inputmode="decimal" placeholder="L/ha"></div>
          </div>
        </div>
      </div>
    `;
  }

  function getSelectedVolumeUiMode(root = document) {
    return root.querySelector('[data-volume-ui-mode]:checked')?.value || '';
  }

  function syncReviewVolumeReferencePanels(container) {
    if (!container) return;
    const mode = getSelectedVolumeUiMode(container);
    container.querySelectorAll('.dose-choice-card').forEach(card => {
      const input = card.querySelector('[data-volume-ui-mode]');
      if (input) card.classList.toggle('selected', !!input.checked);
    });
    container.querySelector('[data-review-volume-panel="volumeReference.fixed"]')?.classList.toggle('hidden', mode !== 'fixed');
    container.querySelector('[data-review-volume-panel="volumeReference.range"]')?.classList.toggle('hidden', mode !== 'range');
  }

  function syncReviewVolumeRulePanels(container, mode) {
    if (!container) return;
    container.querySelector('[data-review-volume-rule-panel="volumeRule.fixed"]')?.classList.toggle('hidden', mode !== 'fixed');
    container.querySelector('[data-review-volume-rule-panel="volumeRule.range"]')?.classList.toggle('hidden', mode !== 'range');
  }

  function renderEditProductVolumeEditor(product, volumeRule) {
    const preset = normalizeEditProductVolumePreset(product?.volumeReference, volumeRule);
    return `
      <div class="dose-review-editor" data-edit-volume-editor>
        <div class="dose-review-info"><strong>Volumen caldo.</strong> El texto visible y la regla de validación se generan automáticamente a partir de esta selección.</div>
        <div class="dose-review-stephead">
          <span class="step-badge">1</span>
          <div>
            <strong>¿Qué indica la ficha o la documentación sobre el volumen?</strong>
            <p>Unidad fija: <strong>L/ha</strong>.</p>
          </div>
        </div>
        <div class="dose-choice-list">
          <label class="dose-choice-card ${preset.uiMode === 'pending' ? 'selected' : ''}">
            <input type="radio" name="editVolumeUiMode" data-edit-volume-ui-mode value="pending" ${preset.uiMode === 'pending' ? 'checked' : ''}>
            <div>
              <strong>A verificar</strong>
              <small>El volumen aún no está confirmado.</small>
            </div>
          </label>
          <label class="dose-choice-card ${preset.uiMode === 'fixed' ? 'selected' : ''}">
            <input type="radio" name="editVolumeUiMode" data-edit-volume-ui-mode value="fixed" ${preset.uiMode === 'fixed' ? 'checked' : ''}>
            <div>
              <strong>Volumen único</strong>
              <small>La etiqueta fija un único volumen de caldo por hectárea.</small>
            </div>
          </label>
          <label class="dose-choice-card ${preset.uiMode === 'range' ? 'selected' : ''}">
            <input type="radio" name="editVolumeUiMode" data-edit-volume-ui-mode value="range" ${preset.uiMode === 'range' ? 'checked' : ''}>
            <div>
              <strong>Volumen mínimo – máximo</strong>
              <small>La etiqueta fija un mínimo y un máximo por hectárea.</small>
            </div>
          </label>
          <label class="dose-choice-card ${preset.uiMode === 'not_listed' ? 'selected' : ''}">
            <input type="radio" name="editVolumeUiMode" data-edit-volume-ui-mode value="not_listed" ${preset.uiMode === 'not_listed' ? 'checked' : ''}>
            <div>
              <strong>No consta</strong>
              <small>La documentación no indica volumen de caldo para este uso.</small>
            </div>
          </label>
        </div>
        <div class="dose-review-stephead secondary">
          <span class="step-badge">2</span>
          <div>
            <strong>Introduce los datos</strong>
            <p>Solo se muestran los campos necesarios según la opción elegida.</p>
          </div>
        </div>
        <div class="dose-review-note">La regla de validación de volumen se genera automáticamente; no se introduce por separado.</div>

        <section class="dose-panel ${preset.uiMode === 'fixed' ? '' : 'hidden'}" data-edit-volume-panel="fixed">
          <h4>Volumen único</h4>
          <div class="field"><span>Volumen único</span><input data-edit-volume-field="value" value="${escapeAttr(ruleInputValue(preset.value))}" inputmode="decimal" placeholder="Ej. 400"></div>
        </section>

        <section class="dose-panel ${preset.uiMode === 'range' ? '' : 'hidden'}" data-edit-volume-panel="range">
          <h4>Volumen mínimo – máximo</h4>
          <div class="inline-fields two">
            <div class="field"><span>Volumen mínimo</span><input data-edit-volume-field="min" value="${escapeAttr(ruleInputValue(preset.min))}" inputmode="decimal" placeholder="Ej. 200"></div>
            <div class="field"><span>Volumen máximo</span><input data-edit-volume-field="max" value="${escapeAttr(ruleInputValue(preset.max))}" inputmode="decimal" placeholder="Ej. 1200"></div>
          </div>
        </section>
      </div>
    `;
  }

  function normalizeEditProductVolumePreset(volumeReference, volumeRule) {
    const preset = { uiMode: 'pending', value: '', min: '', max: '' };
    const rule = volumeRule && typeof volumeRule === 'object' ? volumeRule : { mode: 'pending' };
    if (rule.mode === 'fixed') {
      preset.uiMode = 'fixed';
      preset.value = ruleInputValue(rule.value);
      return preset;
    }
    if (rule.mode === 'range') {
      preset.uiMode = 'range';
      preset.min = ruleInputValue(rule.min);
      preset.max = ruleInputValue(rule.max);
      return preset;
    }
    if (rule.mode === 'not_listed') {
      preset.uiMode = 'not_listed';
      return preset;
    }
    const normalized = String(volumeReference || '').replace(/\s+/g, ' ').replace(/,/g, '.').trim();
    if (/NO\s+CONSTA/i.test(normalized)) {
      preset.uiMode = 'not_listed';
      return preset;
    }
    const range = normalized.match(/M[IÍ]N\.?\s*(\d+(?:\.\d+)?)\s*L\s*\/\s*HA.*M[ÁA]X\.?\s*(\d+(?:\.\d+)?)\s*L\s*\/\s*HA/i)
      || normalized.match(/(\d+(?:\.\d+)?)\s*(?:-|–|A)\s*(\d+(?:\.\d+)?)\s*L\s*\/\s*HA/i);
    if (range) {
      preset.uiMode = 'range';
      preset.min = range[1];
      preset.max = range[2];
      return preset;
    }
    const fixed = normalized.match(/(\d+(?:\.\d+)?)\s*L\s*\/\s*HA/i);
    if (fixed) {
      preset.uiMode = 'fixed';
      preset.value = fixed[1];
    }
    return preset;
  }

  function getSelectedEditVolumeMode(root = document) {
    return root?.querySelector('[data-edit-volume-ui-mode]:checked')?.value || 'pending';
  }

  function syncEditProductVolumePanels(container) {
    if (!container) return;
    const mode = getSelectedEditVolumeMode(container);
    container.querySelectorAll('.dose-choice-card').forEach(card => {
      const input = card.querySelector('[data-edit-volume-ui-mode]');
      if (input) card.classList.toggle('selected', !!input.checked);
    });
    container.querySelector('[data-edit-volume-panel="fixed"]')?.classList.toggle('hidden', mode !== 'fixed');
    container.querySelector('[data-edit-volume-panel="range"]')?.classList.toggle('hidden', mode !== 'range');
  }

  function readEditProductVolumePayload() {
    const root = document.querySelector('[data-edit-volume-editor]');
    const mode = getSelectedEditVolumeMode(root);
    const readNumeric = key => {
      const raw = root?.querySelector(`[data-edit-volume-field="${cssEscapeValue(key)}"]`)?.value?.trim() || '';
      if (!raw) return null;
      const value = Number(normalizeNumericString(raw));
      return Number.isFinite(value) ? value : null;
    };
    if (mode === 'not_listed') return { reference: 'NO CONSTA', rule: { mode: 'not_listed' } };
    if (mode === 'fixed') {
      const value = readNumeric('value');
      return {
        reference: Number.isFinite(value) ? `${formatDocNumber(value)} L/ha\nÚNICO` : '',
        rule: buildVolumeRuleFromEdit({ mode, value })
      };
    }
    if (mode === 'range') {
      const min = readNumeric('min');
      const max = readNumeric('max');
      return {
        reference: Number.isFinite(min) && Number.isFinite(max) ? `Mín. ${formatDocNumber(min)} L/ha\nMáx. ${formatDocNumber(max)} L/ha` : '',
        rule: buildVolumeRuleFromEdit({ mode, min, max })
      };
    }
    return { reference: 'A verificar', rule: { mode: 'pending' } };
  }

  function collectDocumentReviewPayload(product, suggestions) {
    const values = {};
    const selectedKeys = [];
    let derivedVolumeRule = null;
    for (const field of DOCUMENT_REVIEW_FIELDS) {
      const accept = document.querySelector(`[data-review-accept="${cssEscapeValue(field.key)}"]`);
      if (!accept?.checked) continue;
      selectedKeys.push(field.key);
      const manualValue = readDocumentReviewManualValue(field);
      values[field.key] = manualValue.hasManual ? manualValue.value : suggestions?.[field.key];
      if (field.key === 'volumeReference') {
        if (manualValue.hasManual && manualValue.derivedVolumeRule) {
          derivedVolumeRule = manualValue.derivedVolumeRule;
        } else if (!manualValue.hasManual && suggestions?.volumeRule) {
          derivedVolumeRule = suggestions.volumeRule;
        }
      }
    }
    if (derivedVolumeRule && !selectedKeys.includes('volumeRule')) {
      values.volumeRule = derivedVolumeRule;
      selectedKeys.push('volumeRule');
    }
    return { values, selectedKeys };
  }

  function validateDocumentReviewPayload(payload) {
    const errors = [];
    for (const key of payload.selectedKeys) {
      const value = payload.values[key];
      if (value === undefined || value === '' || (Array.isArray(value) && !value.length)) {
        errors.push(`El campo marcado “${labelReviewField(key)}” no tiene valor automático ni manual.`);
      }
      if (key === 'maxApplications' && value !== null && !Number.isFinite(value)) {
        errors.push('Máx. aplicaciones debe ser un número o NO CONSTA.');
      }
      if (key === 'doseRule' && value && value.mode && value.mode !== 'pending') {
        errors.push(...validateDoseRulePayload(value));
      }
      if (key === 'volumeRule' && value && value.mode && value.mode !== 'pending') {
        errors.push(...validateVolumeRulePayload(value));
      }
    }
    return errors;
  }

  function labelReviewField(key) {
    return DOCUMENT_REVIEW_FIELDS.find(field => field.key === key)?.label || key;
  }

  function readDocumentReviewManualValue(field) {
    if (field.kind === 'doseRule') {
      return collectDoseRuleManualFromReview();
    }
    if (field.kind === 'volumeReferenceStructured') {
      const mode = getSelectedVolumeUiMode(document.querySelector('[data-review-volume-editor="volumeReference"]'));
      if (!mode) return { hasManual: false, value: null };
      if (mode === 'not_listed') {
        return { hasManual: true, value: 'NO CONSTA', derivedVolumeRule: { mode: 'not_listed' } };
      }
      if (mode === 'fixed') {
        const value = readReviewVolumeNumeric('volumeReference.value');
        return {
          hasManual: true,
          value: Number.isFinite(value) ? `${formatDocNumber(value)} L/ha
ÚNICO` : '',
          derivedVolumeRule: buildVolumeRuleFromEdit({ mode, value })
        };
      }
      if (mode === 'range') {
        const min = readReviewVolumeNumeric('volumeReference.min');
        const max = readReviewVolumeNumeric('volumeReference.max');
        return {
          hasManual: true,
          value: Number.isFinite(min) && Number.isFinite(max) ? `Mín. ${formatDocNumber(min)} L/ha
Máx. ${formatDocNumber(max)} L/ha` : '',
          derivedVolumeRule: buildVolumeRuleFromEdit({ mode, min, max })
        };
      }
      return { hasManual: true, value: 'A verificar', derivedVolumeRule: { mode: 'pending' } };
    }
    if (field.kind === 'volumeRule') {
      const mode = readReviewRuleField('volumeRule.mode');
      if (!mode) return { hasManual: false, value: null };
      return {
        hasManual: true,
        value: buildVolumeRuleFromEdit({
          mode,
          value: readReviewRuleNumeric('volumeRule.value'),
          min: readReviewRuleNumeric('volumeRule.min'),
          max: readReviewRuleNumeric('volumeRule.max')
        })
      };
    }
    const input = document.querySelector(`[data-review-manual="${cssEscapeValue(field.key)}"]`);
    const raw = input?.value?.trim() ?? '';
    if (!raw) return { hasManual: false, value: null };
    if (field.kind === 'lines') return { hasManual: true, value: parseLinesInput(raw) };
    if (field.kind === 'integerOrNoConsta') {
      const parsed = parseMaxApplicationsEdit(raw);
      return { hasManual: true, value: parsed === 'INVALID' ? raw : parsed };
    }
    return { hasManual: true, value: raw };
  }

  function readReviewRuleField(key) {
    const nodes = Array.from(document.querySelectorAll(`[data-review-rule-field="${cssEscapeValue(key)}"]`));
    if (!nodes.length) return '';
    const radio = nodes[0];
    if (radio.type === 'radio') return nodes.find(node => node.checked)?.value?.trim() ?? '';
    const preferred = nodes.find(node => !node.closest('.hidden')) || nodes[0];
    return preferred?.value?.trim() ?? '';
  }

  function readReviewRuleNumeric(key) {
    const raw = readReviewRuleField(key);
    if (!raw) return null;
    const value = Number(normalizeNumericString(raw));
    return Number.isFinite(value) ? value : null;
  }

  function readReviewVolumeField(key) {
    const nodes = Array.from(document.querySelectorAll(`[data-review-volume-field="${cssEscapeValue(key)}"]`));
    if (!nodes.length) return '';
    const radio = nodes[0];
    if (radio.type === 'radio') return nodes.find(node => node.checked)?.value?.trim() ?? '';
    const preferred = nodes.find(node => !node.closest('.hidden')) || nodes[0];
    return preferred?.value?.trim() ?? '';
  }

  function readReviewVolumeNumeric(key) {
    const raw = readReviewVolumeField(key);
    if (!raw) return null;
    const value = Number(normalizeNumericString(raw));
    return Number.isFinite(value) ? value : null;
  }

  function cssEscapeValue(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function parseLinesInput(value) {
    return String(value || '')
      .split(/\n|;|,/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  function mergeUniqueTextValues(current, additions) {
    const map = new Map();
    [...(Array.isArray(current) ? current : []), ...(Array.isArray(additions) ? additions : [])].forEach(item => {
      const text = String(item || '').trim();
      if (!text) return;
      const key = normalizeComparableText(text);
      if (!map.has(key)) map.set(key, text);
    });
    return Array.from(map.values());
  }

  function renderInlineList(values, fallback = '—') {
    const list = Array.isArray(values) ? values.filter(Boolean) : [];
    return list.length ? list.join(' · ') : fallback;
  }

  function pendingLabelsForProduct(product) {
    const labels = [];
    if (!product.registration || containsPending(product.registration)) labels.push('N.º de registro');
    if (!product.doseReference || containsPending(product.doseReference)) labels.push('Dosis recomendada');
    if (!product.doseRule || product.doseRule.mode === 'pending') labels.push('Regla de dosis');
    if (!product.volumeReference || containsPending(product.volumeReference)) labels.push('Volumen caldo');
    if (!product.volumeRule || product.volumeRule.mode === 'pending') labels.push('Regla de volumen');
    if (!product.safetyPeriod || containsPending(product.safetyPeriod)) labels.push('P.S.');
    if (product.maxApplications === null || product.maxApplications === undefined || containsPending(product.maxApplications)) labels.push('Máx. aplicaciones campaña');
    if (!product.activeIngredients || containsPending(product.activeIngredients)) labels.push('Principios activos');
    if (!product.mixRule || containsPending(product.mixRule)) labels.push('MEZCLA');
    return labels;
  }

  function pendingLabelsAfterSuggestions(product, suggestions) {
    const simulated = deepClone(product);
    const confidentKeys = suggestionEntries(suggestions).filter(entry => entry.confidence === 'alta').map(entry => entry.key);
    applyDocumentSuggestionsToProduct(simulated, suggestions, confidentKeys);
    return pendingLabelsForProduct(simulated);
  }

  function trimText(value, limit) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1))}…` : text;
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  function renderSimpleOptions(options, selected) {
    return options.map(([value, label]) => `<option value="${escapeAttr(value)}" ${String(selected) === String(value) ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
  }

  function readNumericEdit(id) {
    const raw = document.getElementById(id)?.value?.trim() ?? '';
    if (!raw) return null;
    const value = Number(raw.replace(',', '.'));
    return Number.isFinite(value) ? value : NaN;
  }

  function ruleInputValue(value) {
    return value === null || value === undefined || value === '' ? '' : String(value);
  }

  function maxApplicationsInput(value) {
    return value === null || value === undefined || value === '' ? 'NO CONSTA' : String(value);
  }

  function parseMaxApplicationsEdit(raw) {
    const text = String(raw || '').trim();
    if (!text || /no consta/i.test(text)) return null;
    const value = Number(text.replace(',', '.'));
    return Number.isFinite(value) && value >= 0 ? value : 'INVALID';
  }

  function verifiedDateInput(value) {
    if (!value) return '';
    return String(value).slice(0, 10);
  }

  async function saveCampaignApplicator() {
    const input = document.getElementById('campaignApplicator');
    const value = input?.value?.trim() || '';
    const campaign = activeCampaign();
    if (!campaign) return;
    campaign.applicator = value;
    campaign.updatedAt = new Date().toISOString();
    await saveState();
    toast('Aplicador guardado.');
    render();
  }

  function runSelfCheck() {
    const checks = [];
    checks.push(['Estado local accesible', Boolean(state)]);
    checks.push(['Campaña activa definida', Boolean(activeCampaign())]);
    checks.push(['Esquema versionado', state.schemaVersion === SCHEMA_VERSION]);
    checks.push(['Navegación principal preparada', document.querySelectorAll('.nav-item').length === 5]);
    checks.push(['Columnas oficiales = 15', OFFICIAL_COLUMNS.length === 15]);
    checks.push(['Alertas activas computables', Array.isArray(activeAlerts())]);
    checks.push(['Borradores computables', Array.isArray(currentDrafts())]);
    const rows = checks.map(([label, ok]) => `<li><span class="tag ${ok ? 'ok' : 'warn'}">${ok ? 'OK' : 'REVISAR'}</span> ${escapeHtml(label)}</li>`).join('');
    showInfoModal('Autocomprobación', `<ul class="list-clean">${rows}</ul>`);
  }

  async function exportCsv() {
    const rows = filteredLedgerTreatments();
    const ordinals = ordinalMapForRows(activeTreatments());
    const lines = [OFFICIAL_COLUMNS.map(([, label]) => csvEscape(label)).join(';')];
    rows.forEach(row => {
      const values = officialValues(row, ordinals);
      lines.push(OFFICIAL_COLUMNS.map(([key]) => csvEscape(String(values[key] ?? ''))).join(';'));
    });
    downloadText(`cuaderno_tratamientos_${dateStamp()}.csv`, lines.join('\n'), 'text/csv;charset=utf-8');
    registerExport('CSV');
  }

  async function exportXls() {
    const rows = filteredLedgerTreatments();
    const ordinals = ordinalMapForRows(activeTreatments());
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table border="1"><tr>${OFFICIAL_COLUMNS.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr>${rows.map(row => { const values = officialValues(row, ordinals); return `<tr>${OFFICIAL_COLUMNS.map(([key]) => `<td>${escapeHtml(String(values[key] ?? ''))}</td>`).join('')}</tr>`; }).join('')}</table></body></html>`;
    downloadText(`cuaderno_tratamientos_${dateStamp()}.xls`, html, 'application/vnd.ms-excel;charset=utf-8');
    registerExport('XLS');
  }

  function exportOfficialPdf() {
    const rows = filteredLedgerTreatments();
    openPrintWindow('PDF oficial', buildStandalonePrintHtml('CUADERNO DE TRATAMIENTOS', buildPdfSheet(rows), true));
    registerExport('PDF oficial');
  }

  function exportCompactPdf() {
    const groups = groupTreatmentsByDate(filteredLedgerTreatments());
    const content = groups.map(group => `<h2>N.º ${group.ordinal} · ${formatDate(group.date)}</h2><ul>${group.rows.map(row => `<li><strong>${escapeHtml(row.productName)}</strong> — ${escapeHtml(row.doseApplied || '—')} — ${escapeHtml(row.objective || '—')}</li>`).join('')}</ul>`).join('');
    openPrintWindow('PDF compacto', buildStandalonePrintHtml('RESUMEN COMPACTO DE TRATAMIENTOS', content, false));
    registerExport('PDF compacto');
  }

  function openPrintWindow(title, html) {
    const win = window.open('', '_blank');
    if (!win) {
      toast('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes.');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 350);
  }

  function buildStandalonePrintHtml(title, body, official) {
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
      @page { size: ${official ? 'A4 landscape' : 'A4 portrait'}; margin: 8mm; }
      body { font-family: Arial, sans-serif; color:#111827; }
      .pdf-title { text-align:center; font-size:16px; font-weight:700; margin-bottom:8px; }
      .pdf-applicator { font-size:11px; font-weight:700; text-decoration:underline; margin-bottom:8px; }
      table { width:100%; border-collapse:collapse; table-layout:fixed; }
      th, td { border:1px solid #a9bfd6; padding:3px; font-size:7px; white-space:pre-line; word-break:break-word; text-align:center; vertical-align:top; }
      th { background:#1f5c98; color:#fff; }
      td.warning-cell { background:#fde8e8; color:#7d1d1d; font-weight:700; }
      h1 { text-align:center; font-size:18px; }
      h2 { font-size:14px; border-bottom:1px solid #d5e0eb; padding-bottom:4px; }
      li { margin-bottom:6px; }
      .caption { font-size:9px; color:#66798e; }
      .scroll-table { overflow:visible; }
    </style></head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`;
  }

  async function registerExport(kind) {
    state.history.exports.push({ kind, at: new Date().toISOString() });
    await saveState();
  }

  function csvEscape(value) {
    const text = String(value ?? '');
    if (/[;"\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function downloadText(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast(`Archivo descargado: ${filename}`);
  }

  function downloadBackup() {
    const payload = {
      type: 'cuaderno-tratamientos-backup',
      formatVersion: SCHEMA_VERSION,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      state
    };
    downloadText(`copia_cuaderno_tratamientos_${dateStamp()}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
  }

  async function readRestoreFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (payload.type !== 'cuaderno-tratamientos-backup' || !payload.state) throw new Error('Copia no reconocida.');
      const mode = await choiceDialog('Restaurar copia', 'Elige el modo de restauración.', [
        { id: 'replace', label: 'Sustituir datos locales', className: 'primary-btn' },
        { id: 'merge', label: 'Fusionar con revisión de conflictos', className: 'secondary-btn' },
        { id: 'cancel', label: 'Cancelar', className: 'ghost-btn' }
      ]);
      if (!mode || mode === 'cancel') return;
      if (mode === 'replace') {
        const ok = await confirmDialog('Sustituir datos', 'Se reemplazará todo el estado local por la copia seleccionada.', 'Sustituir', 'Cancelar');
        if (!ok) return;
        state = payload.state;
        ensureStateShape();
        state.history.restores.push({ mode, at: new Date().toISOString(), fileName: file.name });
        await saveState();
        toast('Copia restaurada por sustitución.');
        render();
        return;
      }
      await mergeBackupState(payload.state, file.name);
    } catch (error) {
      console.error(error);
      showInfoModal('Restauración no realizada', `<p>${escapeHtml(error.message || 'No se pudo leer la copia.')}</p>`);
    }
  }

  async function mergeBackupState(incoming, fileName) {
    ensureStateShape();
    const clone = deepClone(incoming);
    clone.campaigns ||= [];
    clone.products ||= [];
    clone.treatments ||= [];
    clone.alerts ||= [];
    for (const campaign of clone.campaigns) upsertWithConflict(state.campaigns, campaign, 'campaña', false);
    for (const product of clone.products) await upsertWithConflict(state.products, product, 'producto', true);
    for (const treatment of clone.treatments) await upsertWithConflict(state.treatments, treatment, 'tratamiento', true);
    for (const alert of clone.alerts) await upsertWithConflict(state.alerts, alert, 'alerta', true);
    state.history.restores.push({ mode: 'merge', at: new Date().toISOString(), fileName });
    await saveState();
    toast('Copia fusionada.');
    render();
  }

  async function upsertWithConflict(target, item, label, ask) {
    if (!item?.id) return;
    const idx = target.findIndex(existing => existing.id === item.id);
    if (idx < 0) {
      target.push(item);
      return;
    }
    if (!ask) return;
    const decision = await choiceDialog(
      `Conflicto de ${label}`,
      `Ya existe un elemento con ID coincidente. Decide para <strong>${escapeHtml(item.name || item.title || item.productName || item.id)}</strong>.`,
      [
        { id: 'keep', label: 'Mantener local', className: 'ghost-btn' },
        { id: 'replace', label: 'Sobrescribir con copia', className: 'primary-btn' }
      ]
    );
    if (decision === 'replace') target[idx] = item;
  }

  async function readImportFile(file) {
    if (!file) return;
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.json')) {
        const data = JSON.parse(await file.text());
        if (data.type !== 'cuaderno-tratamientos-import') throw new Error('JSON no reconocido como carga estructurada.');
        ui.importPreview = { kind: 'structured', data };
        render();
        return;
      }
      if (lower.endsWith('.csv')) {
        const table = parseCsv(await file.text());
        ui.importPreview = buildTabularPreview(table.headers, table.rows);
        render();
        return;
      }
      if (lower.endsWith('.xls')) {
        const table = parseHtmlTable(await file.text());
        ui.importPreview = buildTabularPreview(table.headers, table.rows);
        render();
        return;
      }
      if (lower.endsWith('.xlsx')) {
        throw new Error('La V1 importa CSV, JSON y XLS compatible. Para .xlsx, guarda como CSV o XLS compatible antes de importar.');
      }
      throw new Error('Formato no soportado.');
    } catch (error) {
      console.error(error);
      showInfoModal('Importación no preparada', `<p>${escapeHtml(error.message || 'No se pudo leer el archivo.')}</p>`);
    }
  }

  function buildTabularPreview(headers, rows) {
    const mapping = {};
    IMPORT_KEYS.forEach(([key, label]) => {
      const exact = headers.find(header => normalizeText(header) === normalizeText(label));
      if (exact) mapping[key] = exact;
    });
    return { kind: 'tabular', headers, rows, mapping };
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];
      if (ch === '"' && quoted && next === '"') { cell += '"'; i++; continue; }
      if (ch === '"') { quoted = !quoted; continue; }
      if ((ch === ';' || ch === ',') && !quoted) { row.push(cell.trim()); cell = ''; continue; }
      if ((ch === '\n' || ch === '\r') && !quoted) {
        if (ch === '\r' && next === '\n') i++;
        row.push(cell.trim()); cell = '';
        if (row.some(Boolean)) rows.push(row);
        row = [];
        continue;
      }
      cell += ch;
    }
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
    const headers = rows.shift() || [];
    return { headers, rows: rows.map(values => Object.fromEntries(headers.map((header, idx) => [header, values[idx] || '']))) };
  }

  function parseHtmlTable(text) {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const table = doc.querySelector('table');
    if (!table) throw new Error('El XLS compatible no contiene una tabla legible.');
    const rows = Array.from(table.querySelectorAll('tr')).map(tr => Array.from(tr.querySelectorAll('th,td')).map(td => td.textContent.trim()));
    const headers = rows.shift() || [];
    return { headers, rows: rows.map(values => Object.fromEntries(headers.map((header, idx) => [header, values[idx] || '']))) };
  }

  function buildPreviewTable(headers, rows) {
    return `<table><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${headers.map(h => `<td>${escapeHtml(row[h] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  async function applyStructuredImport(mode) {
    const data = ui.importPreview?.data;
    if (!data) return;
    const ok = await confirmDialog('Aplicar carga estructurada', `Modo seleccionado: ${mode === 'replace' ? 'sustituir' : 'fusionar'}.`, 'Aplicar', 'Cancelar');
    if (!ok) return;
    if (mode === 'replace') {
      const replacement = defaultState();
      replacement.activeCampaignId = data.campaign?.id || EMPTY_CAMPAIGN_ID;
      replacement.campaigns = data.campaign ? [data.campaign] : replacement.campaigns;
      replacement.products = deepClone(data.products || []);
      replacement.treatments = deepClone(data.treatments || []);
      replacement.alerts = deepClone(data.alerts || []);
      replacement.history.imports.push({ mode, at: new Date().toISOString(), source: data.sourceDocument || 'JSON estructurado' });
      state = replacement;
      ensureStateShape();
    } else {
      if (data.campaign && !state.campaigns.some(c => c.id === data.campaign.id)) state.campaigns.push(data.campaign);
      mergeById(state.products, data.products || []);
      mergeById(state.treatments, data.treatments || []);
      mergeById(state.alerts, data.alerts || []);
      state.activeCampaignId = data.campaign?.id || state.activeCampaignId;
      state.history.imports.push({ mode, at: new Date().toISOString(), source: data.sourceDocument || 'JSON estructurado' });
    }
    ui.importPreview = null;
    await saveState();
    toast('Carga importada.');
    ui.screen = 'home';
    ui.morePanel = null;
    syncNav();
    render();
  }

  function mergeById(target, items) {
    items.forEach(item => {
      if (!target.some(existing => existing.id === item.id)) target.push(item);
    });
  }

  async function applyTabularImport() {
    const preview = ui.importPreview;
    if (!preview || preview.kind !== 'tabular') return;
    const mapping = preview.mapping || {};
    if (!mapping.date || !mapping.productName) {
      toast('Mapea al menos Fecha y Nombre del producto.');
      return;
    }
    const now = new Date().toISOString();
    const rows = [];
    for (const raw of preview.rows) {
      const dateRaw = raw[mapping.date] || '';
      const date = textDateToIso(dateRaw) || (isIsoDate(dateRaw) ? dateRaw : '');
      if (!date) continue;
      const productName = (raw[mapping.productName] || '').trim();
      if (!productName) continue;
      let product = findProductByName(productName);
      if (!product) {
        product = createProvisionalProduct(productName, raw[mapping.crop] || 'Vid de vinificación', raw[mapping.objective] || '');
        state.products.push(product);
      }
      rows.push({
        id: `t_${cryptoRandom()}`,
        campaignId: state.activeCampaignId,
        date,
        applicator: activeCampaign()?.applicator || '',
        productId: product.id,
        productName,
        registration: raw[mapping.registration] || product.registration || 'A verificar',
        lot: raw[mapping.lot] || 'A verificar',
        doseReference: raw[mapping.doseReference] || product.doseReference || 'A verificar',
        doseApplied: raw[mapping.doseApplied] || 'A verificar',
        volumeReference: raw[mapping.volumeReference] || product.volumeReference || 'A verificar',
        litersPerHa: raw[mapping.litersPerHa] || 'A verificar',
        crop: raw[mapping.crop] || 'Vid de vinificación',
        objective: raw[mapping.objective] || 'A verificar',
        safetyPeriod: raw[mapping.safetyPeriod] || product.safetyPeriod || 'A verificar',
        activeIngredients: raw[mapping.activeIngredients] || product.activeIngredients || 'A verificar',
        mixRule: normalizeImportedMix(raw[mapping.mixRule] || product.mixRule || 'A verificar'),
        verificationStatus: product.verificationStatus || 'PENDING',
        observations: '',
        incidence: 'Importación tabular: revisar datos técnicos.',
        snapshot: buildSnapshot(product),
        createdAt: now,
        updatedAt: now
      });
    }
    if (!rows.length) return toast('No se pudieron construir filas válidas.');
    const ok = await confirmDialog('Importar filas tabulares', `Se incorporarán ${rows.length} fila(s) y quedarán bajo revisión cuando proceda.`, 'Importar', 'Cancelar');
    if (!ok) return;
    state.treatments.push(...rows);
    rows.forEach(row => state.alerts.push(buildAlert('A_VERIFY', `Importación pendiente: ${row.productName}`, 'Fila importada desde tabla. Revisar validación técnica.', row.productId, row.id)));
    state.history.imports.push({ mode: 'tabular', at: now, rows: rows.length });
    ui.importPreview = null;
    await saveState();
    toast('Importación tabular aplicada.');
    ui.screen = 'ledger';
    ui.ledgerView = 'mobile';
    syncNav();
    render();
  }

  function normalizeImportedMix(value) {
    const text = String(value || '').trim().toUpperCase();
    if (text === 'SOLO') return 'SOLO';
    if (text === 'A VERIFICAR') return 'A verificar';
    if (text === 'MEZCLABLE' || text === '----' || text === '——') return '----';
    return value || '----';
  }

  async function showEditTreatmentModal(id) {
    const row = findTreatment(id);
    if (!row) return;
    const body = `
      <div class="field"><span>Fecha</span><input id="editDate" type="date" value="${escapeAttr(row.date || '')}"></div>
      <div class="field"><span>Producto</span><input id="editProductName" value="${escapeAttr(row.productName || '')}"></div>
      <div class="field"><span>Aplicador</span><input id="editApplicator" value="${escapeAttr(row.applicator || '')}"></div>
      <div class="inline-fields two">
        <div class="field"><span>Lote</span><input id="editLot" value="${escapeAttr(row.lot || '')}"></div>
        <div class="field"><span>Litros/ha</span><input id="editLiters" value="${escapeAttr(String(row.litersPerHa ?? ''))}"></div>
      </div>
      <div class="field"><span>Dosis aplicada</span><input id="editDose" value="${escapeAttr(row.doseApplied || '')}"></div>
    `;
    const decision = await choiceDialog(`Editar ${row.productName}`, body, [
      { id: 'save', label: 'Guardar cambios', className: 'primary-btn' },
      { id: 'cancel', label: 'Cancelar', className: 'ghost-btn' }
    ], true);
    if (decision !== 'save') { els.modalHost.innerHTML = ''; return; }
    const date = document.getElementById('editDate')?.value || row.date;
    if (isFutureDate(date)) {
      const first = await confirmDialog('Fecha futura', `La fecha ${formatDate(date)} es futura. Primera confirmación.`, 'Continuar', 'Corregir');
      if (!first) return;
      const second = await confirmDialog('Doble verificación', 'Segunda confirmación para conservar fecha futura.', 'Confirmar', 'Cancelar');
      if (!second) return;
    }
    const newName = document.getElementById('editProductName')?.value?.trim() || row.productName;
    let product = findProductByName(newName);
    if (!product) {
      const ok = await confirmDialog('Producto provisional', 'El nuevo producto no existe. Se creará como A verificar.', 'Crear', 'Cancelar');
      if (!ok) return;
      product = createProvisionalProduct(newName, row.crop, row.objective);
      state.products.push(product);
    }
    const newDose = document.getElementById('editDose')?.value?.trim() || row.doseApplied;
    const newLiters = document.getElementById('editLiters')?.value?.trim() || row.litersPerHa;
    const newApplicator = document.getElementById('editApplicator')?.value?.trim() || row.applicator;
    const newLot = document.getElementById('editLot')?.value?.trim() || row.lot;
    els.modalHost.innerHTML = '';
    const validation = validateEntryAgainstProduct(product, newDose, newLiters);
    let incidence = row.incidence || '';
    if (!validation.ok) {
      const keep = await confirmDialog('Validación técnica', `${validation.messages.map(escapeHtml).join('<br>')}<p>¿Conservar con incidencia?</p>`, 'Conservar', 'Corregir');
      if (!keep) return;
      incidence = [incidence, ...validation.messages].filter(Boolean).join(' | ');
      state.alerts.push(buildAlert('INCIDENT', `Edición con incidencia: ${newName}`, validation.messages.join(' | '), product.id, row.id));
    }
    row.date = date;
    row.productId = product.id;
    row.productName = product.name;
    row.registration = product.registration || row.registration;
    row.applicator = newApplicator;
    row.lot = newLot;
    row.doseApplied = newDose;
    row.litersPerHa = normalizeNumericString(newLiters);
    row.doseReference = product.doseReference || row.doseReference;
    row.volumeReference = product.volumeReference || row.volumeReference;
    row.safetyPeriod = product.safetyPeriod || row.safetyPeriod;
    row.activeIngredients = product.activeIngredients || row.activeIngredients;
    row.mixRule = product.mixRule || row.mixRule;
    row.verificationStatus = product.verificationStatus || row.verificationStatus;
    row.snapshot = buildSnapshot(product);
    row.incidence = incidence;
    row.updatedAt = new Date().toISOString();
    const resolvedFromEdit = reconcileAlertsForProduct(product);
    await saveState();
    toast(`Tratamiento actualizado.${resolvedFromEdit ? ` ${resolvedFromEdit} alerta(s) técnica(s) resuelta(s).` : ''}`);
    render();
  }

  function renderOptions(options, selected) {
    return options.map(option => `<option value="${escapeAttr(option)}" ${selected === option ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('');
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function normalizeNumericString(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    const num = Number(text.replace(',', '.'));
    return Number.isFinite(num) ? num : text;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = String(iso).split('-');
    return `${d}/${m}/${y}`;
  }

  function formatDateTime(iso) {
    try { return new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)); }
    catch { return iso || '—'; }
  }

  function isoToTextDate(iso) {
    return formatDate(iso);
  }

  function textDateToIso(text) {
    const match = String(text || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return '';
    const [, dd, mm, yyyy] = match;
    const iso = `${yyyy}-${mm}-${dd}`;
    if (!isIsoDate(iso)) return '';
    return iso;
  }

  function isIsoDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return false;
    const date = new Date(`${iso}T12:00:00`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === iso;
  }

  function isFutureDate(iso) {
    if (!isIsoDate(iso)) return false;
    return iso > todayLocalIso();
  }

  function todayLocalIso() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function dateStamp() {
    return todayLocalIso().replace(/-/g, '');
  }

  function formatDecimal(value) {
    return Number.isFinite(value) ? String(Math.round(value * 10000) / 10000).replace('.', ',') : 'no verificable';
  }

  function cryptoRandom() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID().replace(/-/g, '');
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) { return escapeHtml(value); }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.remove('hidden');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => els.toast.classList.add('hidden'), 3200);
  }

  function showInfoModal(title, bodyHtml) {
    return choiceDialog(title, bodyHtml, [{ id: 'close', label: 'Cerrar', className: 'primary-btn' }]);
  }

  function confirmDialog(title, bodyHtml, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar') {
    return choiceDialog(title, bodyHtml, [
      { id: 'confirm', label: confirmLabel, className: 'primary-btn' },
      { id: 'cancel', label: cancelLabel, className: 'ghost-btn' }
    ]).then(result => result === 'confirm');
  }

  function choiceDialog(title, bodyHtml, actions, preserveDom = false) {
    return new Promise(resolve => {
      els.modalHost.innerHTML = `
        <div class="modal-backdrop" role="dialog" aria-modal="true">
          <section class="modal-card">
            <h2>${escapeHtml(title)}</h2>
            <div class="modal-body">${bodyHtml}</div>
            <div class="modal-actions">
              ${actions.map(action => `<button type="button" class="${escapeAttr(action.className || 'ghost-btn')}" data-modal-result="${escapeAttr(action.id)}">${escapeHtml(action.label)}</button>`).join('')}
            </div>
          </section>
        </div>
      `;
      const backdrop = els.modalHost.querySelector('.modal-backdrop');
      const handler = event => {
        const btn = event.target.closest('[data-modal-result]');
        if (!btn) return;
        const result = btn.dataset.modalResult;
        if (!preserveDom) els.modalHost.innerHTML = '';
        resolve(result);
      };
      backdrop.addEventListener('click', handler);
    });
  }
})();
