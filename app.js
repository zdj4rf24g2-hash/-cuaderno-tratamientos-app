/* APP CUADERNO DE TRATAMIENTOS · V 2.0
   Regeneración limpia e integrada.
   Datos locales en IndexedDB. Sin tratamientos reales incrustados. */
(() => {
  "use strict";

  const APP_VERSION = "2.0";
  const APP_LABEL = "APP CUADERNO DE TRATAMIENTOS · V 2.0";
  const DB_NAME = "cuaderno_tratamientos_v2_0";
  const DB_VERSION = 1;
  const STORES = {
    SETTINGS: "settings",
    PRODUCTS: "products",
    TREATMENTS: "treatments",
    DOCUMENTS: "documents",
    DRAFTS: "drafts"
  };

  const TECH_FIELDS = [
    "regNumber",
    "activeIngredients",
    "mezcla",
    "cropUse",
    "targets",
    "doseRecommended",
    "doseRule",
    "visibleDoseUnit",
    "expectedAppliedUnit",
    "volumeRule",
    "ps",
    "maxApplications",
    "intervalDays",
    "stageConditions",
    "source"
  ];

  const REVIEW_FIELD_LABELS = {
    regNumber: "N.º de registro",
    activeIngredients: "Principios activos",
    mezcla: "MEZCLA",
    cropUse: "Cultivo / uso",
    targets: "Plaga / objetivo",
    doseRecommended: "Dosis recomendada",
    doseRule: "Regla de dosis",
    visibleDoseUnit: "Unidad visible",
    expectedAppliedUnit: "Unidad aplicada esperada",
    volumeRule: "Volumen caldo",
    ps: "P.S.",
    maxApplications: "Máximo de aplicaciones por campaña",
    intervalDays: "Intervalo entre aplicaciones",
    stageConditions: "Estadio o condiciones de aplicación",
    source: "Fuente documental"
  };

  const state = {
    db: null,
    view: "inicio",
    cuadernoMode: "mobile",
    settings: null,
    products: [],
    treatments: [],
    documents: [],
    draft: null,
    importPreview: null,
    pendingImportPayload: null,
    waitingWorker: null,
    modalStack: []
  };

  const screen = document.getElementById("screen");
  const nav = Array.from(document.querySelectorAll(".nav-item"));
  const modalRoot = document.getElementById("modalRoot");
  const toastRoot = document.getElementById("toastRoot");
  const updateBanner = document.getElementById("updateBanner");
  const reloadUpdateBtn = document.getElementById("reloadUpdateBtn");
  const installHintBtn = document.getElementById("installHintBtn");

  // ---------- Inicio ----------
  init().catch((error) => {
    console.error(error);
    screen.innerHTML = `
      <section class="card">
        <h2>Error de arranque</h2>
        <p>No se ha podido iniciar la app local. Recarga la página.</p>
        <p class="small muted">${escapeHtml(error?.message || String(error))}</p>
      </section>
    `;
  });

  async function init() {
    state.db = await openDb();
    await ensureSettings();
    await refreshAll();
    bindGlobalEvents();
    bindServiceWorker();
    render();
  }

  async function ensureSettings() {
    const existing = await dbGet(STORES.SETTINGS, "main");
    if (existing) {
      state.settings = existing;
      return;
    }
    const settings = {
      id: "main",
      campaign: "2026",
      applicator: "",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    await dbPut(STORES.SETTINGS, settings);
    state.settings = settings;
  }

  async function refreshAll() {
    state.settings = await dbGet(STORES.SETTINGS, "main") || state.settings;
    state.products = sortByName(await dbGetAll(STORES.PRODUCTS), "name");
    state.treatments = sortTreatments(await dbGetAll(STORES.TREATMENTS));
    state.documents = sortDocs(await dbGetAll(STORES.DOCUMENTS));
    state.draft = await dbGet(STORES.DRAFTS, "current");
  }

  function bindGlobalEvents() {
    nav.forEach((button) => {
      button.addEventListener("click", () => navigate(button.dataset.view));
    });

    screen.addEventListener("click", onScreenClick);
    screen.addEventListener("input", onScreenInput);
    screen.addEventListener("change", onScreenChange);
    modalRoot.addEventListener("click", onModalClick);
    modalRoot.addEventListener("change", onModalChange);
    modalRoot.addEventListener("input", onModalInput);

    reloadUpdateBtn.addEventListener("click", () => {
      if (state.waitingWorker) {
        state.waitingWorker.postMessage({ type: "SKIP_WAITING" });
      } else {
        window.location.reload();
      }
    });

    installHintBtn.addEventListener("click", () => {
      openModal(`
        <div class="modal">
          <div class="modal-header">
            <h3>Instalación en iPhone</h3>
            <button class="modal-close" data-action="close-modal" type="button" aria-label="Cerrar">×</button>
          </div>
          <div class="modal-body stack">
            <p>Abre la app en Safari, pulsa <strong>Compartir</strong> y elige <strong>Añadir a pantalla de inicio</strong>.</p>
            <div class="callout">
              <strong>Versión visible:</strong> ${APP_LABEL}
            </div>
          </div>
        </div>
      `);
    });
  }

  function navigate(view) {
    state.view = view;
    nav.forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle("is-active", active);
      if (active) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });
    render();
    screen.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function render() {
    switch (state.view) {
      case "inicio":
        screen.innerHTML = renderInicio();
        break;
      case "nuevo":
        screen.innerHTML = renderNuevo();
        break;
      case "cuaderno":
        screen.innerHTML = renderCuaderno();
        break;
      case "alertas":
        screen.innerHTML = renderAlertas();
        break;
      case "mas":
        screen.innerHTML = renderMas();
        break;
      default:
        state.view = "inicio";
        screen.innerHTML = renderInicio();
    }
  }

  // ---------- Pantallas ----------
  function renderInicio() {
    const alerts = buildAlerts();
    const last = state.treatments[0] || null;
    const draftInfo = state.draft ? draftSummary(state.draft) : null;
    const datesCount = new Set(state.treatments.map((row) => row.date)).size;
    const applications = state.treatments.length;

    return `
      <section class="screen-header">
        <h2>Inicio</h2>
        <p>Campaña ${escapeHtml(state.settings?.campaign || "2026")} · Datos locales en este dispositivo.</p>
      </section>

      <section class="stack">
        <article class="card">
          <h3>Resumen de campaña</h3>
          <div class="metric-grid">
            <div class="metric"><span class="label">Fechas registradas</span><span class="value">${datesCount}</span></div>
            <div class="metric"><span class="label">Aplicaciones</span><span class="value">${applications}</span></div>
            <div class="metric"><span class="label">Productos</span><span class="value">${state.products.length}</span></div>
            <div class="metric"><span class="label">Alertas</span><span class="value">${alerts.length}</span></div>
          </div>
        </article>

        <article class="card">
          <h3>Accesos rápidos</h3>
          <div class="btn-row">
            <button class="btn" type="button" data-route="nuevo">Nuevo tratamiento</button>
            <button class="btn-soft" type="button" data-route="cuaderno">Abrir cuaderno</button>
            <button class="btn-ghost" type="button" data-route="alertas">Ver alertas</button>
          </div>
        </article>

        <div class="grid-2">
          <article class="card">
            <h3>Borrador</h3>
            ${draftInfo ? `
              <p><strong>${draftInfo.dates}</strong> fecha(s) en sesión · <strong>${draftInfo.apps}</strong> producto(s).</p>
              <p class="muted small">Última actualización: ${formatDateTime(state.draft.updatedAt)}</p>
              <div class="btn-row">
                <button class="btn-soft" type="button" data-route="nuevo">Continuar</button>
                <button class="btn-danger" type="button" data-action="discard-draft">Eliminar</button>
              </div>
            ` : `
              <div class="empty">No hay borrador activo.</div>
            `}
          </article>

          <article class="card">
            <h3>Último tratamiento</h3>
            ${last ? renderLastTreatmentCard(last) : `
              <div class="empty">No hay tratamientos cargados todavía.</div>
            `}
          </article>
        </div>

        <article class="card">
          <div class="item-head">
            <h3>Alertas prioritarias</h3>
            <button class="linklike" type="button" data-route="alertas">Ver todas</button>
          </div>
          ${alerts.length ? `
            <ul class="alert-list">
              ${alerts.slice(0, 3).map(renderAlertCompact).join("")}
            </ul>
          ` : `
            <div class="empty">Sin alertas activas.</div>
          `}
        </article>
      </section>
    `;
  }

  function renderNuevo() {
    const draft = ensureDraftInMemory();
    const totalApps = draft.dates.reduce((sum, group) => sum + group.applications.length, 0);
    return `
      <section class="screen-header">
        <h2>Nuevo tratamiento</h2>
        <p>Flujo guiado con varias fechas y varios productos por fecha. Guarda solo al pulsar <strong>FIN y registrar</strong>.</p>
      </section>

      <section class="stack">
        <article class="card compact">
          <div class="item-head">
            <div>
              <strong>Aplicador activo</strong>
              <p class="muted small">${escapeHtml(state.settings?.applicator || "No configurado")}</p>
            </div>
            <button class="btn-ghost" type="button" data-route="mas">Cambiar</button>
          </div>
        </article>

        <article class="card">
          <div class="item-head">
            <div>
              <h3>Sesión en curso</h3>
              <p class="muted small">${draft.dates.length} fecha(s) · ${totalApps} producto(s)</p>
            </div>
            <div class="item-actions">
              <button class="btn-soft" type="button" data-action="add-draft-date">Añadir fecha</button>
              <button class="btn-ghost" type="button" data-action="save-draft">Guardar borrador</button>
            </div>
          </div>
          <hr class="hr">
          <div class="stack">
            ${draft.dates.map(renderDraftDateGroup).join("")}
          </div>
          <hr class="hr">
          <div class="btn-row">
            <button class="btn" type="button" data-action="finish-draft">FIN y registrar</button>
            <button class="btn-danger" type="button" data-action="discard-draft">Eliminar borrador</button>
          </div>
        </article>
      </section>
    `;
  }

  function renderCuaderno() {
    const hasRows = state.treatments.length > 0;
    return `
      <section class="screen-header">
        <h2>Cuaderno</h2>
        <p>Vista móvil y vista tipo PDF con la tabla completa de 15 columnas.</p>
      </section>

      <section class="stack">
        <article class="card">
          <div class="table-tools">
            <div class="segmented" role="tablist" aria-label="Modo de visualización">
              <button class="${state.cuadernoMode === "mobile" ? "is-active" : ""}" type="button" data-action="cuaderno-mode" data-mode="mobile">Vista móvil</button>
              <button class="${state.cuadernoMode === "pdf" ? "is-active" : ""}" type="button" data-action="cuaderno-mode" data-mode="pdf">Vista tipo PDF</button>
            </div>
          </div>

          <div class="table-tools">
            <button class="btn-soft" type="button" data-action="export-pdf-official">PDF oficial</button>
            <button class="btn-soft" type="button" data-action="export-pdf-compact">PDF compacto</button>
            <button class="btn-ghost" type="button" data-action="export-csv">CSV</button>
            <button class="btn-ghost" type="button" data-action="export-xls">Excel</button>
          </div>

          ${hasRows ? (state.cuadernoMode === "mobile" ? renderMobileRecords() : renderPdfTable()) : `
            <div class="empty">La app está limpia. Los tratamientos reales se importarán solo cuando la V 2.0 quede validada.</div>
          `}
        </article>
      </section>
    `;
  }

  function renderAlertas() {
    const alerts = buildAlerts();
    return `
      <section class="screen-header">
        <h2>Alertas</h2>
        <p>Pendientes técnicos, incidencias, máximos y revisiones documentales.</p>
      </section>

      <section class="card">
        ${alerts.length ? `
          <ul class="alert-list">
            ${alerts.map(renderAlertFull).join("")}
          </ul>
        ` : `
          <div class="empty">Sin alertas activas.</div>
        `}
      </section>
    `;
  }

  function renderMas() {
    return `
      <section class="screen-header">
        <h2>Más</h2>
        <p>Configuración, catálogo de productos, documentación, copia e importación.</p>
      </section>

      <section class="stack">
        <article class="card">
          <h3>Configuración de campaña</h3>
          <div class="form-grid cols-2">
            <div class="field">
              <label for="settingsCampaign">Campaña</label>
              <input id="settingsCampaign" data-setting="campaign" type="text" value="${escapeAttr(state.settings?.campaign || "2026")}" inputmode="numeric">
            </div>
            <div class="field">
              <label for="settingsApplicator">Aplicador</label>
              <input id="settingsApplicator" data-setting="applicator" type="text" value="${escapeAttr(state.settings?.applicator || "")}" placeholder="Nombre del aplicador">
            </div>
          </div>
          <div class="btn-row" style="margin-top:12px">
            <button class="btn" type="button" data-action="save-settings">Guardar configuración</button>
          </div>
        </article>

        <article class="card">
          <div class="item-head">
            <div>
              <h3>Catálogo de productos</h3>
              <p class="muted small">${state.products.length} ficha(s) disponibles.</p>
            </div>
            <button class="btn" type="button" data-action="new-product">Añadir producto</button>
          </div>
          <hr class="hr">
          ${state.products.length ? `
            <ul class="product-list">
              ${state.products.map(renderProductListItem).join("")}
            </ul>
          ` : `
            <div class="empty">Catálogo vacío. Añade productos manualmente o impórtalos más adelante.</div>
          `}
        </article>

        <article class="card">
          <h3>Copia completa, restauración e importación controlada</h3>
          <p class="muted small">La carga real de tratamientos se hará más adelante, cuando esta V 2.0 quede operativa y validada.</p>
          <div class="btn-row">
            <button class="btn-soft" type="button" data-action="export-backup">Exportar copia completa</button>
            <label class="btn-ghost" for="importJsonInput" style="display:inline-flex;align-items:center;">Seleccionar JSON</label>
            <input id="importJsonInput" data-action="pick-import-json" type="file" accept="application/json,.json" class="is-hidden">
          </div>
          <div id="importPreviewHost" style="margin-top:12px">
            ${state.importPreview ? renderImportPreview(state.importPreview) : ""}
          </div>
        </article>

        <article class="card">
          <h3>Estado técnico de la PWA</h3>
          <div class="detail-grid">
            <div class="detail">
              <span class="key">Versión visible</span>
              <span class="val">${APP_LABEL}</span>
            </div>
            <div class="detail">
              <span class="key">Actualización</span>
              <span class="val">Caché versionada y aviso de nueva versión preparado.</span>
            </div>
            <div class="detail">
              <span class="key">Privacidad</span>
              <span class="val">Datos locales en el dispositivo. La app se entrega sin tratamientos reales incrustados.</span>
            </div>
          </div>
        </article>
      </section>
    `;
  }

  // ---------- Render auxiliares ----------
  function renderLastTreatmentCard(row) {
    const sameDate = state.treatments.filter((item) => item.date === row.date);
    const names = sameDate.map((item) => item.productName || "Producto").join(", ");
    return `
      <p><strong>${formatDate(row.date)}</strong></p>
      <p>${escapeHtml(names)}</p>
      <button class="btn-soft" type="button" data-route="cuaderno">Abrir cuaderno</button>
    `;
  }

  function renderAlertCompact(alert) {
    return `
      <li class="alert-item ${alert.level === "critical" ? "is-critical" : ""}">
        <div class="item-head">
          <div>
            <strong>${escapeHtml(alert.title)}</strong>
            <p class="muted small">${escapeHtml(alert.detail)}</p>
          </div>
          ${renderAlertAction(alert)}
        </div>
      </li>
    `;
  }

  function renderAlertFull(alert) {
    return `
      <li class="alert-item ${alert.level === "critical" ? "is-critical" : ""}">
        <div class="item-head">
          <div>
            <span class="badge ${alert.level === "critical" ? "badge-red" : "badge-yellow"}">${alert.level === "critical" ? "Incidencia" : "Pendiente"}</span>
            <h3 style="margin:8px 0 4px">${escapeHtml(alert.title)}</h3>
            <p class="muted">${escapeHtml(alert.detail)}</p>
          </div>
          ${renderAlertAction(alert)}
        </div>
      </li>
    `;
  }

  function renderAlertAction(alert) {
    if (alert.productId) {
      return `<button class="btn-soft" type="button" data-action="edit-product" data-product-id="${escapeAttr(alert.productId)}">Editar ficha</button>`;
    }
    if (alert.route) {
      return `<button class="btn-soft" type="button" data-route="${escapeAttr(alert.route)}">Abrir</button>`;
    }
    return "";
  }

  function renderDraftDateGroup(group, index) {
    const future = isFutureDate(group.date);
    const soloIssue = draftDateHasSoloMixIssue(group);
    return `
      <section class="session-date" data-date-id="${escapeAttr(group.id)}">
        <div class="session-date-head">
          <div>
            <strong>Fecha ${index + 1}</strong>
            <p class="muted small">${group.applications.length} producto(s)</p>
          </div>
          <div class="item-actions">
            <button class="btn-soft" type="button" data-action="add-draft-application" data-date-id="${escapeAttr(group.id)}">Añadir producto</button>
            ${state.draft?.dates?.length > 1 ? `<button class="btn-danger" type="button" data-action="remove-draft-date" data-date-id="${escapeAttr(group.id)}">Eliminar fecha</button>` : ""}
          </div>
        </div>

        <div class="form-grid cols-2">
          <div class="field">
            <label>Fecha de aplicación</label>
            <input type="date" data-draft-date-field="date" data-date-id="${escapeAttr(group.id)}" value="${escapeAttr(group.date || todayIso())}">
          </div>
          <div class="field">
            <span class="label">Confirmación de fecha futura</span>
            ${future ? `
              <label class="inline-check">
                <input class="check-blue" type="checkbox" data-draft-date-field="futureConfirmed" data-date-id="${escapeAttr(group.id)}" ${group.futureConfirmed ? "checked" : ""}>
                <span>Confirmo que deseo registrar una fecha futura.</span>
              </label>
              <span class="notice-inline">La app bloquea fechas futuras salvo doble confirmación al guardar.</span>
            ` : `
              <span class="notice-inline">No procede.</span>
            `}
          </div>
        </div>

        ${soloIssue ? `
          <div class="callout warnbox">
            <strong>Producto marcado SOLO detectado.</strong>
            <p class="small">Para registrar esta fecha junto con otros productos, confirma que se aplicaron en cubas distintas.</p>
            <label class="inline-check">
              <input class="check-blue" type="checkbox" data-draft-date-field="soloSeparateConfirmed" data-date-id="${escapeAttr(group.id)}" ${group.soloSeparateConfirmed ? "checked" : ""}>
              <span>Confirmo cubas distintas.</span>
            </label>
          </div>
        ` : ""}

        <div class="stack">
          ${group.applications.length ? group.applications.map((app, appIndex) => renderDraftApplication(group, app, appIndex)).join("") : `
            <div class="empty">Aún no hay productos en esta fecha.</div>
          `}
        </div>
      </section>
    `;
  }

  function renderDraftApplication(group, app, index) {
    const validation = validateDraftApplication(group, app);
    const product = productById(app.productId);
    const targets = getProductTargets(product);
    return `
      <article class="application-card ${validation.errors.length ? "is-invalid" : ""}" data-app-id="${escapeAttr(app.id)}" data-date-id="${escapeAttr(group.id)}">
        <div class="item-head">
          <div>
            <strong>Producto ${index + 1}</strong>
            ${product ? `<p class="muted small">${escapeHtml(product.name)}</p>` : `<p class="muted small">Selecciona una ficha del catálogo.</p>`}
          </div>
          <button class="btn-danger" type="button" data-action="remove-draft-application" data-date-id="${escapeAttr(group.id)}" data-app-id="${escapeAttr(app.id)}">Quitar</button>
        </div>

        <div class="form-grid cols-2">
          <div class="field">
            <label>Producto</label>
            <select data-draft-app-field="productId" data-date-id="${escapeAttr(group.id)}" data-app-id="${escapeAttr(app.id)}">
              <option value="">Seleccionar</option>
              ${state.products.map((item) => `<option value="${escapeAttr(item.id)}" ${item.id === app.productId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Lote</label>
            <input type="text" data-draft-app-field="lot" data-date-id="${escapeAttr(group.id)}" data-app-id="${escapeAttr(app.id)}" value="${escapeAttr(app.lot || "")}" placeholder="Lote real aplicado">
          </div>
          <div class="field">
            <label>Dosis aplicada</label>
            <input type="text" inputmode="decimal" data-draft-app-field="appliedDose" data-date-id="${escapeAttr(group.id)}" data-app-id="${escapeAttr(app.id)}" value="${escapeAttr(app.appliedDose || "")}" placeholder="Valor">
          </div>
          <div class="field">
            <label>Unidad aplicada</label>
            <input type="text" data-draft-app-field="appliedUnit" data-date-id="${escapeAttr(group.id)}" data-app-id="${escapeAttr(app.id)}" value="${escapeAttr(app.appliedUnit || product?.expectedAppliedUnit || "")}" placeholder="kg/ha, cc/hL...">
          </div>
          <div class="field">
            <label>Litros/ha aplicados</label>
            <input type="text" inputmode="decimal" data-draft-app-field="litersHa" data-date-id="${escapeAttr(group.id)}" data-app-id="${escapeAttr(app.id)}" value="${escapeAttr(app.litersHa || "")}" placeholder="L/ha">
          </div>
          <div class="field">
            <label>Plaga / objetivo</label>
            ${targets.length ? `
              <select data-draft-app-field="target" data-date-id="${escapeAttr(group.id)}" data-app-id="${escapeAttr(app.id)}">
                <option value="">Seleccionar</option>
                ${targets.map((target) => `<option value="${escapeAttr(target)}" ${target === app.target ? "selected" : ""}>${escapeHtml(target)}</option>`).join("")}
              </select>
            ` : `
              <input type="text" data-draft-app-field="target" data-date-id="${escapeAttr(group.id)}" data-app-id="${escapeAttr(app.id)}" value="${escapeAttr(app.target || "")}" placeholder="Objetivo">
            `}
          </div>
        </div>

        ${product ? `
          <div class="summary-strip">
            <span class="badge badge-blue">Cultivo: ${escapeHtml(product.cropUse || "A verificar")}</span>
            <span class="badge ${product.mezcla === "SOLO" ? "badge-red" : "badge-green"}">MEZCLA: ${escapeHtml(product.mezcla || "A verificar")}</span>
            <span class="badge badge-yellow">Volumen: ${escapeHtml(formatVolumeRule(product.volumeRule))}</span>
          </div>
        ` : ""}

        ${validation.errors.length || validation.warnings.length ? `
          <div class="callout ${validation.errors.length ? "warnbox" : "yellowbox"}">
            ${validation.errors.length ? `<strong>Bloqueos</strong><ul>${validation.errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>` : ""}
            ${validation.warnings.length ? `<strong>Avisos</strong><ul>${validation.warnings.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>` : ""}
          </div>
        ` : `
          <div class="callout"><strong>Validación inicial correcta.</strong></div>
        `}
      </article>
    `;
  }

  function renderMobileRecords() {
    return `
      <div class="mobile-table-cards">
        ${state.treatments.map((row) => {
          const display = displayTreatmentRow(row);
          const pending = rowHasPending(display);
          return `
            <article class="record-card ${pending ? "pending" : ""}">
              <div class="record-top">
                <div>
                  <h4>${escapeHtml(display.productName)}</h4>
                  <span class="record-date">${escapeHtml(display.dateFormatted)}</span>
                </div>
                <span class="badge ${pending ? "badge-red" : "badge-green"}">${pending ? "A verificar" : "Registrado"}</span>
              </div>
              <div class="detail-grid">
                <div class="detail"><span class="key">N.º</span><span class="val">${escapeHtml(display.groupNo)}</span></div>
                <div class="detail"><span class="key">N.º registro</span><span class="val">${escapeHtml(display.regNumber)}</span></div>
                <div class="detail"><span class="key">Lote</span><span class="val">${escapeHtml(display.lot)}</span></div>
                <div class="detail"><span class="key">Dosis recomendada</span><span class="val">${escapeHtml(display.doseRecommended)}</span></div>
                <div class="detail"><span class="key">Dosis aplicada</span><span class="val">${escapeHtml(display.appliedDose)}</span></div>
                <div class="detail"><span class="key">Volumen caldo</span><span class="val">${escapeHtml(display.volumeRule)}</span></div>
                <div class="detail"><span class="key">L/ha aplicados</span><span class="val">${escapeHtml(display.litersHa)}</span></div>
                <div class="detail"><span class="key">Cultivo</span><span class="val">${escapeHtml(display.cropUse)}</span></div>
                <div class="detail"><span class="key">Plaga / patógeno</span><span class="val">${escapeHtml(display.target)}</span></div>
                <div class="detail"><span class="key">P.S.</span><span class="val">${escapeHtml(display.ps)}</span></div>
                <div class="detail"><span class="key">Tratamientos campaña</span><span class="val">${escapeHtml(display.campaignCount)}</span></div>
                <div class="detail"><span class="key">Principios activos</span><span class="val">${escapeHtml(display.activeIngredients)}</span></div>
                <div class="detail"><span class="key">MEZCLA</span><span class="val">${escapeHtml(display.mezcla)}</span></div>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderPdfTable() {
    return `
      <div class="pdf-table-wrap">
        ${buildTableHtml()}
      </div>
    `;
  }

  function renderProductListItem(product) {
    const pending = Array.isArray(product.pendingFields) && product.pendingFields.length > 0;
    const docs = state.documents.filter((doc) => doc.productId === product.id).length;
    return `
      <li class="product-item">
        <div class="item-head">
          <div>
            <strong>${escapeHtml(product.name || "Producto sin nombre")}</strong>
            <p class="muted small">Registro: ${escapeHtml(product.regNumber || "A verificar")} · Documentos: ${docs}</p>
            <div class="summary-strip">
              <span class="badge ${pending ? "badge-red" : "badge-green"}">${pending ? "Pendiente técnico" : "Ficha revisada"}</span>
              <span class="badge badge-blue">MEZCLA: ${escapeHtml(product.mezcla || "A verificar")}</span>
            </div>
          </div>
          <div class="item-actions">
            <button class="btn-soft" type="button" data-action="edit-product" data-product-id="${escapeAttr(product.id)}">Editar ficha</button>
            <button class="btn-danger" type="button" data-action="delete-product" data-product-id="${escapeAttr(product.id)}">Eliminar</button>
          </div>
        </div>
      </li>
    `;
  }

  function renderImportPreview(preview) {
    return `
      <div class="callout yellowbox">
        <strong>JSON preparado para importación controlada</strong>
        <p class="small">Tipo detectado: ${escapeHtml(preview.typeLabel)}</p>
        <div class="summary-strip">
          <span class="badge badge-blue">Productos: ${preview.products}</span>
          <span class="badge badge-blue">Tratamientos: ${preview.treatments}</span>
          <span class="badge badge-blue">Documentos: ${preview.documents}</span>
        </div>
        <div class="btn-row" style="margin-top:10px">
          <button class="btn" type="button" data-action="confirm-import">Confirmar importación</button>
          <button class="btn-ghost" type="button" data-action="cancel-import">Cancelar</button>
        </div>
      </div>
    `;
  }

  // ---------- Alertas ----------
  function buildAlerts() {
    const alerts = [];

    for (const product of state.products) {
      if (Array.isArray(product.pendingFields) && product.pendingFields.length) {
        alerts.push({
          id: `prod-${product.id}`,
          level: "pending",
          title: `${product.name || "Producto"} pendiente de revisión`,
          detail: `Campos A verificar: ${product.pendingFields.map((field) => REVIEW_FIELD_LABELS[field] || field).join(", ")}.`,
          productId: product.id
        });
      }
    }

    for (const row of state.treatments) {
      const display = displayTreatmentRow(row);
      if (rowHasPending(display)) {
        alerts.push({
          id: `row-${row.id}`,
          level: "pending",
          title: `Aplicación de ${display.productName} con datos A verificar`,
          detail: `${display.dateFormatted} · revisar ficha técnica o registro importado.`,
          productId: row.productId || null,
          route: "cuaderno"
        });
      }
    }

    const counts = countTreatmentsByProduct();
    for (const product of state.products) {
      const max = parseMaxApplications(product.maxApplications);
      if (max !== null && (counts.get(product.id) || 0) > max) {
        alerts.push({
          id: `max-${product.id}`,
          level: "critical",
          title: `Máximo superado: ${product.name}`,
          detail: `${counts.get(product.id)} aplicación(es) registradas frente a un máximo de ${max}.`,
          productId: product.id
        });
      }
    }

    return dedupeAlerts(alerts);
  }

  function dedupeAlerts(alerts) {
    const seen = new Set();
    return alerts.filter((alert) => {
      const key = `${alert.title}|${alert.detail}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ---------- Eventos de pantalla ----------
  async function onScreenClick(event) {
    const routeBtn = event.target.closest("[data-route]");
    if (routeBtn) {
      navigate(routeBtn.dataset.route);
      return;
    }

    const actionBtn = event.target.closest("[data-action]");
    if (!actionBtn) return;
    const action = actionBtn.dataset.action;

    switch (action) {
      case "discard-draft":
        await discardDraft();
        break;
      case "save-draft":
        await persistDraft("Borrador guardado.");
        break;
      case "add-draft-date":
        addDraftDate();
        break;
      case "remove-draft-date":
        removeDraftDate(actionBtn.dataset.dateId);
        break;
      case "add-draft-application":
        addDraftApplication(actionBtn.dataset.dateId);
        break;
      case "remove-draft-application":
        removeDraftApplication(actionBtn.dataset.dateId, actionBtn.dataset.appId);
        break;
      case "finish-draft":
        await finishDraft();
        break;
      case "cuaderno-mode":
        state.cuadernoMode = actionBtn.dataset.mode || "mobile";
        render();
        break;
      case "export-csv":
        exportCsv();
        break;
      case "export-xls":
        exportXls();
        break;
      case "export-pdf-official":
        printOfficialPdf();
        break;
      case "export-pdf-compact":
        printCompactPdf();
        break;
      case "save-settings":
        await saveSettingsFromScreen();
        break;
      case "new-product":
        openProductModal(null);
        break;
      case "edit-product":
        openProductModal(actionBtn.dataset.productId);
        break;
      case "delete-product":
        await deleteProduct(actionBtn.dataset.productId);
        break;
      case "export-backup":
        await exportBackup();
        break;
      case "confirm-import":
        await confirmPendingImport();
        break;
      case "cancel-import":
        clearPendingImport();
        break;
      default:
        break;
    }
  }

  async function onScreenInput(event) {
    const dateField = event.target.closest("[data-draft-date-field]");
    if (dateField) {
      updateDraftDateField(dateField);
      return;
    }
    const appField = event.target.closest("[data-draft-app-field]");
    if (appField) {
      updateDraftAppField(appField);
      return;
    }
  }

  async function onScreenChange(event) {
    const dateField = event.target.closest("[data-draft-date-field]");
    if (dateField) {
      updateDraftDateField(dateField);
      await persistDraftSilently();
      return;
    }

    const appField = event.target.closest("[data-draft-app-field]");
    if (appField) {
      updateDraftAppField(appField);
      await persistDraftSilently();
      return;
    }

    const importInput = event.target.closest("#importJsonInput");
    if (importInput && importInput.files?.length) {
      await previewImportFile(importInput.files[0]);
      importInput.value = "";
      return;
    }
  }

  // ---------- Borrador / Nuevo tratamiento ----------
  function ensureDraftInMemory() {
    if (state.draft) return normalizeDraft(state.draft);
    state.draft = {
      id: "current",
      dates: [blankDraftDate()],
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    return state.draft;
  }

  function normalizeDraft(draft) {
    draft.dates = Array.isArray(draft.dates) && draft.dates.length ? draft.dates : [blankDraftDate()];
    draft.dates = draft.dates.map((group) => ({
      id: group.id || uid("date"),
      date: group.date || todayIso(),
      futureConfirmed: !!group.futureConfirmed,
      futureDoubleConfirmed: !!group.futureDoubleConfirmed,
      soloSeparateConfirmed: !!group.soloSeparateConfirmed,
      applications: Array.isArray(group.applications) ? group.applications.map(normalizeDraftApplication) : []
    }));
    return draft;
  }

  function normalizeDraftApplication(app) {
    return {
      id: app.id || uid("app"),
      productId: app.productId || "",
      lot: app.lot || "",
      appliedDose: app.appliedDose || "",
      appliedUnit: app.appliedUnit || "",
      litersHa: app.litersHa || "",
      target: app.target || ""
    };
  }

  function blankDraftDate() {
    return {
      id: uid("date"),
      date: todayIso(),
      futureConfirmed: false,
      futureDoubleConfirmed: false,
      soloSeparateConfirmed: false,
      applications: []
    };
  }

  function blankDraftApplication() {
    return {
      id: uid("app"),
      productId: "",
      lot: "",
      appliedDose: "",
      appliedUnit: "",
      litersHa: "",
      target: ""
    };
  }

  function draftSummary(draft) {
    const dates = draft?.dates?.length || 0;
    const apps = draft?.dates?.reduce((sum, group) => sum + (group.applications?.length || 0), 0) || 0;
    return { dates, apps };
  }

  async function persistDraft(message = "") {
    if (!state.draft) return;
    state.draft.updatedAt = nowIso();
    await dbPut(STORES.DRAFTS, state.draft);
    if (message) toast(message);
    render();
  }

  async function persistDraftSilently() {
    if (!state.draft) return;
    state.draft.updatedAt = nowIso();
    await dbPut(STORES.DRAFTS, state.draft);
  }

  async function discardDraft() {
    await dbDelete(STORES.DRAFTS, "current");
    state.draft = null;
    toast("Borrador eliminado.");
    render();
  }

  function addDraftDate() {
    const draft = ensureDraftInMemory();
    draft.dates.push(blankDraftDate());
    persistDraftSilently();
    render();
  }

  function removeDraftDate(dateId) {
    const draft = ensureDraftInMemory();
    if (draft.dates.length <= 1) return;
    draft.dates = draft.dates.filter((group) => group.id !== dateId);
    persistDraftSilently();
    render();
  }

  function addDraftApplication(dateId) {
    const group = ensureDraftInMemory().dates.find((item) => item.id === dateId);
    if (!group) return;
    if (!state.products.length) {
      toast("Antes debes crear una ficha de producto en Más.");
      navigate("mas");
      return;
    }
    group.applications.push(blankDraftApplication());
    persistDraftSilently();
    render();
  }

  function removeDraftApplication(dateId, appId) {
    const group = ensureDraftInMemory().dates.find((item) => item.id === dateId);
    if (!group) return;
    group.applications = group.applications.filter((app) => app.id !== appId);
    persistDraftSilently();
    render();
  }

  function updateDraftDateField(input) {
    const group = ensureDraftInMemory().dates.find((item) => item.id === input.dataset.dateId);
    if (!group) return;
    const field = input.dataset.draftDateField;
    if (field === "date") {
      group.date = input.value || todayIso();
      if (!isFutureDate(group.date)) {
        group.futureConfirmed = false;
        group.futureDoubleConfirmed = false;
      }
    } else if (field === "futureConfirmed") {
      group.futureConfirmed = !!input.checked;
      if (!group.futureConfirmed) group.futureDoubleConfirmed = false;
    } else if (field === "soloSeparateConfirmed") {
      group.soloSeparateConfirmed = !!input.checked;
    }
    render();
  }

  function updateDraftAppField(input) {
    const group = ensureDraftInMemory().dates.find((item) => item.id === input.dataset.dateId);
    if (!group) return;
    const app = group.applications.find((item) => item.id === input.dataset.appId);
    if (!app) return;
    const field = input.dataset.draftAppField;
    app[field] = input.value;
    if (field === "productId") {
      const product = productById(app.productId);
      app.appliedUnit = product?.expectedAppliedUnit || "";
      const targets = getProductTargets(product);
      app.target = targets.length === 1 ? targets[0] : "";
    }
    render();
  }

  function validateDraftApplication(group, app) {
    const errors = [];
    const warnings = [];
    const product = productById(app.productId);

    if (!product) {
      errors.push("Selecciona un producto del catálogo.");
      return { errors, warnings };
    }

    if (!String(app.lot || "").trim()) {
      errors.push("Indica el lote aplicado.");
    }

    const dose = parseLocaleNumber(app.appliedDose);
    if (dose === null || dose <= 0) {
      errors.push("Indica una dosis aplicada válida.");
    }

    if (!String(app.appliedUnit || "").trim()) {
      errors.push("Indica la unidad de dosis aplicada.");
    }

    const liters = parseLocaleNumber(app.litersHa);
    if (liters === null || liters <= 0) {
      errors.push("Indica los litros/ha aplicados.");
    }

    const targets = getProductTargets(product);
    if (targets.length && !String(app.target || "").trim()) {
      errors.push("Selecciona la plaga u objetivo autorizado para la ficha.");
    }

    if (product.expectedAppliedUnit && app.appliedUnit && normalizeUnit(product.expectedAppliedUnit) !== normalizeUnit(app.appliedUnit)) {
      warnings.push(`La unidad aplicada no coincide con la esperada (${product.expectedAppliedUnit}).`);
    }

    if (dose !== null && app.appliedUnit) {
      const result = validateDoseAgainstRule(product, dose, app.appliedUnit);
      if (result.error) errors.push(result.error);
      if (result.warning) warnings.push(result.warning);
    }

    if (liters !== null) {
      const volumeResult = validateVolumeAgainstRule(product, liters);
      if (volumeResult.error) errors.push(volumeResult.error);
      if (volumeResult.warning) warnings.push(volumeResult.warning);
    }

    const projected = projectedApplicationsForProduct(product.id, group.id, app.id);
    const max = parseMaxApplications(product.maxApplications);
    if (max !== null && projected > max) {
      errors.push(`Se alcanzaría ${projected}/${max} aplicaciones; la app bloquea superar el máximo por campaña.`);
    }

    return { errors, warnings };
  }

  function projectedApplicationsForProduct(productId, currentDateId, currentAppId) {
    let count = state.treatments.filter((row) => row.productId === productId).length;
    const draft = ensureDraftInMemory();
    for (const group of draft.dates) {
      for (const app of group.applications) {
        if (app.productId === productId) {
          count += 1;
        }
      }
    }
    return count;
  }

  function draftDateHasSoloMixIssue(group) {
    const products = group.applications.map((app) => productById(app.productId)).filter(Boolean);
    return products.length > 1 && products.some((product) => String(product.mezcla || "").toUpperCase() === "SOLO");
  }

  async function finishDraft() {
    const draft = ensureDraftInMemory();

    if (!draft.dates.length) {
      toast("No hay fechas en la sesión.");
      return;
    }

    const allErrors = [];
    for (const group of draft.dates) {
      if (!group.applications.length) {
        allErrors.push(`La fecha ${formatDate(group.date)} no contiene productos.`);
      }
      if (isFutureDate(group.date)) {
        if (!group.futureConfirmed) {
          allErrors.push(`La fecha ${formatDate(group.date)} es futura y no está confirmada.`);
        } else if (!group.futureDoubleConfirmed) {
          const ok = window.confirm(`Segunda verificación: confirma de nuevo que deseas registrar la fecha futura ${formatDate(group.date)}.`);
          if (!ok) {
            allErrors.push(`No se completó la segunda confirmación para ${formatDate(group.date)}.`);
          } else {
            group.futureDoubleConfirmed = true;
          }
        }
      }
      if (draftDateHasSoloMixIssue(group) && !group.soloSeparateConfirmed) {
        allErrors.push(`La fecha ${formatDate(group.date)} contiene un producto SOLO junto con otros. Debes confirmar cubas distintas.`);
      }
      for (const app of group.applications) {
        const validation = validateDraftApplication(group, app);
        allErrors.push(...validation.errors.map((error) => `${formatDate(group.date)} · ${error}`));
      }
    }

    if (allErrors.length) {
      toast(`No se puede registrar. Revisa ${allErrors.length} bloqueo(s).`);
      render();
      openModal(`
        <div class="modal">
          <div class="modal-header">
            <h3>Bloqueos antes de registrar</h3>
            <button class="modal-close" data-action="close-modal" type="button" aria-label="Cerrar">×</button>
          </div>
          <div class="modal-body">
            <ul class="alert-list">
              ${allErrors.map((error) => `<li class="alert-item is-critical">${escapeHtml(error)}</li>`).join("")}
            </ul>
          </div>
        </div>
      `);
      return;
    }

    const rows = [];
    let nextGroupNo = nextTreatmentGroupNo();
    for (const group of draft.dates) {
      const groupNo = String(nextGroupNo++);
      for (const app of group.applications) {
        const product = productById(app.productId);
        const row = treatmentRowFromDraft(groupNo, group, app, product);
        rows.push(row);
      }
    }

    for (const row of rows) {
      await dbPut(STORES.TREATMENTS, row);
    }
    await dbDelete(STORES.DRAFTS, "current");
    state.draft = null;
    await refreshAll();
    toast(`${rows.length} aplicación(es) registradas.`);
    navigate("cuaderno");
  }

  function treatmentRowFromDraft(groupNo, group, app, product) {
    const pendingFields = Array.isArray(product?.pendingFields) ? [...product.pendingFields] : [];
    return {
      id: uid("tr"),
      groupNo,
      date: group.date,
      productId: product?.id || "",
      productName: product?.name || "A verificar",
      regNumber: product?.regNumber || "A verificar",
      lot: String(app.lot || "").trim(),
      doseRecommended: product?.doseRecommended || formatDoseRule(product?.doseRule) || "A verificar",
      appliedDose: formatAppliedDose(app.appliedDose, app.appliedUnit),
      appliedDoseValue: String(app.appliedDose || "").trim(),
      appliedUnit: String(app.appliedUnit || "").trim(),
      volumeRule: formatVolumeRule(product?.volumeRule),
      litersHa: String(app.litersHa || "").trim(),
      cropUse: product?.cropUse || "A verificar",
      target: String(app.target || "").trim() || firstTarget(product) || "A verificar",
      ps: product?.ps || "A verificar",
      activeIngredients: product?.activeIngredients || "A verificar",
      mezcla: product?.mezcla || "A verificar",
      pendingFields,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
  }

  function nextTreatmentGroupNo() {
    const max = state.treatments.reduce((acc, row) => Math.max(acc, Number(row.groupNo) || 0), 0);
    return max + 1;
  }

  // ---------- Configuración ----------
  async function saveSettingsFromScreen() {
    const campaign = screen.querySelector("[data-setting='campaign']")?.value?.trim() || "2026";
    const applicator = screen.querySelector("[data-setting='applicator']")?.value?.trim() || "";
    state.settings = {
      ...(state.settings || { id: "main", createdAt: nowIso() }),
      id: "main",
      campaign,
      applicator,
      updatedAt: nowIso()
    };
    await dbPut(STORES.SETTINGS, state.settings);
    toast("Configuración guardada.");
    render();
  }

  // ---------- Productos ----------
  function productById(id) {
    return state.products.find((product) => product.id === id) || null;
  }

  function getProductTargets(product) {
    if (!product) return [];
    if (Array.isArray(product.targets)) return product.targets.filter(Boolean);
    if (typeof product.targets === "string") return splitList(product.targets);
    return [];
  }

  function firstTarget(product) {
    return getProductTargets(product)[0] || "";
  }

  function openProductModal(productId) {
    const product = productId ? productById(productId) : blankProduct();
    if (!product) {
      toast("No se ha localizado la ficha.");
      return;
    }

    state.modalStack = [];
    openModal(`
      <div class="modal" data-product-modal data-product-id="${escapeAttr(product.id)}">
        <div class="modal-header">
          <h3>${productId ? "Editar ficha de producto" : "Nueva ficha de producto"}</h3>
          <button class="modal-close" data-action="close-modal" type="button" aria-label="Cerrar">×</button>
        </div>
        <div class="modal-body stack">
          ${renderProductForm(product)}
          <article class="card compact">
            <h4>Documentación técnica asociada</h4>
            <div class="field">
              <label for="docUpload_${escapeAttr(product.id)}">Añadir documentos</label>
              <input id="docUpload_${escapeAttr(product.id)}" data-action="upload-product-docs" data-product-id="${escapeAttr(product.id)}" type="file" multiple accept="image/*,application/pdf,text/plain,.txt,.pdf,.jpg,.jpeg,.png,.webp">
            </div>
            <div id="productDocsHost" style="margin-top:12px">
              ${renderProductDocs(product.id)}
            </div>
            <hr class="hr">
            <h4>Fuente documental</h4>
            <div id="sourceGroupsHost">
              ${renderSourceGroups(product.id)}
            </div>
          </article>

          <article class="card compact">
            <h4>Extracción documental asistida</h4>
            <div class="callout">
              <strong>Vía A:</strong> entrada manual en la ficha. <strong>Vía B:</strong> propuestas revisables desde texto documental disponible, con evidencia y confianza.
            </div>
            <div class="field" style="margin-top:12px">
              <label>Texto documental a analizar</label>
              <textarea id="documentTextToAnalyze" placeholder="Pega texto técnico legible o carga un documento de texto para preparar propuestas."></textarea>
            </div>
            <div class="btn-row">
              <button class="btn-soft" type="button" data-action="analyze-document-text">Generar propuestas</button>
            </div>
            <div id="proposalReviewHost" style="margin-top:12px"></div>
          </article>

          <div class="btn-row">
            <button class="btn" type="button" data-action="save-product-modal">Guardar ficha</button>
            <button class="btn-ghost" type="button" data-action="close-modal">Cerrar</button>
          </div>
        </div>
      </div>
    `);
  }

  function blankProduct() {
    return {
      id: uid("prod"),
      name: "",
      regNumber: "",
      activeIngredients: "",
      mezcla: "——",
      cropUse: "Vid de vinificación",
      targets: [],
      doseRecommended: "",
      doseRule: { mode: "text", unique: "", min: "", max: "", limit: "", unit: "" },
      visibleDoseUnit: "",
      expectedAppliedUnit: "",
      volumeRule: { mode: "range", unique: "", min: "", max: "", unit: "L/ha" },
      volumeImportedUnknown: false,
      ps: "",
      maxApplications: "",
      intervalDays: "",
      stageConditions: "",
      source: "",
      pendingFields: [],
      fieldStatus: {},
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
  }

  function renderProductForm(product) {
    const rule = normalizeDoseRule(product.doseRule);
    const volume = normalizeVolumeRule(product.volumeRule);
    return `
      <article class="card compact">
        <h4>Ficha técnica</h4>
        <div class="form-grid cols-2">
          <div class="field">
            <label>Nombre del producto</label>
            <input data-product-field="name" type="text" value="${escapeAttr(product.name || "")}">
          </div>
          <div class="field">
            <label>N.º de registro</label>
            <input data-product-field="regNumber" type="text" value="${escapeAttr(product.regNumber || "")}" placeholder="A verificar">
          </div>
          <div class="field">
            <label>Principios activos</label>
            <textarea data-product-field="activeIngredients">${escapeHtml(product.activeIngredients || "")}</textarea>
          </div>
          <div class="field">
            <label>MEZCLA</label>
            <select data-product-field="mezcla">
              ${["——", "SOLO", "MEZCLABLE", "A verificar"].map((value) => `<option value="${escapeAttr(value)}" ${value === (product.mezcla || "——") ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Cultivo / uso</label>
            <input data-product-field="cropUse" type="text" value="${escapeAttr(product.cropUse || "Vid de vinificación")}">
          </div>
          <div class="field">
            <label>Plagas / objetivos autorizados</label>
            <input data-product-field="targets" type="text" value="${escapeAttr(getProductTargets(product).join(", "))}" placeholder="Mildio, Oídio...">
          </div>
          <div class="field">
            <label>Dosis recomendada visible</label>
            <textarea data-product-field="doseRecommended">${escapeHtml(product.doseRecommended || "")}</textarea>
          </div>
          <div class="field">
            <label>Regla de dosis</label>
            <select data-product-field="doseRuleMode">
              ${[
                ["text", "Texto / sin regla automática"],
                ["unique", "Valor único"],
                ["range", "Mínimo y máximo"],
                ["range_limit", "Mínimo, máximo y límite por ha"]
              ].map(([value, label]) => `<option value="${value}" ${value === rule.mode ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Unidad visible de dosis</label>
            <input data-product-field="visibleDoseUnit" type="text" value="${escapeAttr(product.visibleDoseUnit || rule.unit || "")}" placeholder="% / g-hL / kg-ha...">
          </div>
          <div class="field">
            <label>Unidad aplicada esperada</label>
            <input data-product-field="expectedAppliedUnit" type="text" value="${escapeAttr(product.expectedAppliedUnit || "")}" placeholder="kg/ha, cc/hL...">
          </div>
        </div>

        <div class="form-grid cols-3" style="margin-top:12px">
          <div class="field">
            <label>Dosis única</label>
            <input data-product-field="doseUnique" type="text" inputmode="decimal" value="${escapeAttr(rule.unique || "")}">
          </div>
          <div class="field">
            <label>Dosis mínima</label>
            <input data-product-field="doseMin" type="text" inputmode="decimal" value="${escapeAttr(rule.min || "")}">
          </div>
          <div class="field">
            <label>Dosis máxima</label>
            <input data-product-field="doseMax" type="text" inputmode="decimal" value="${escapeAttr(rule.max || "")}">
          </div>
          <div class="field">
            <label>Límite por ha</label>
            <input data-product-field="doseLimit" type="text" inputmode="decimal" value="${escapeAttr(rule.limit || "")}">
          </div>
        </div>
      </article>

      <article class="card compact">
        <h4>Volumen caldo</h4>
        ${product.volumeImportedUnknown ? `
          <div class="callout yellowbox" style="margin-bottom:12px">
            <strong>Estado importado:</strong> No consta volumen documentado. La ficha puede conservar este estado hasta verificación posterior.
          </div>
        ` : ""}
        <div class="form-grid cols-2">
          <div class="field">
            <label>Tipo</label>
            <select data-product-field="volumeMode">
              <option value="unique" ${volume.mode === "unique" ? "selected" : ""}>Volumen único</option>
              <option value="range" ${volume.mode === "range" ? "selected" : ""}>Volumen mínimo y máximo</option>
            </select>
          </div>
          <div class="field">
            <label>Unidad</label>
            <input type="text" value="L/ha" readonly aria-readonly="true">
          </div>
          <div class="field">
            <label>Volumen único [L/ha]</label>
            <input data-product-field="volumeUnique" type="text" inputmode="decimal" value="${escapeAttr(volume.unique || "")}">
          </div>
          <div class="field">
            <label>Volumen mínimo [L/ha]</label>
            <input data-product-field="volumeMin" type="text" inputmode="decimal" value="${escapeAttr(volume.min || "")}">
          </div>
          <div class="field">
            <label>Volumen máximo [L/ha]</label>
            <input data-product-field="volumeMax" type="text" inputmode="decimal" value="${escapeAttr(volume.max || "")}">
          </div>
        </div>
      </article>

      <article class="card compact">
        <h4>Condiciones y control</h4>
        <div class="form-grid cols-2">
          <div class="field">
            <label>P.S.</label>
            <input data-product-field="ps" type="text" value="${escapeAttr(product.ps || "")}" placeholder="28 días / No procede / A verificar">
          </div>
          <div class="field">
            <label>Máximo de aplicaciones por campaña</label>
            <input data-product-field="maxApplications" type="text" inputmode="numeric" value="${escapeAttr(product.maxApplications || "")}" placeholder="3 / NO CONSTA">
          </div>
          <div class="field">
            <label>Intervalo entre aplicaciones</label>
            <input data-product-field="intervalDays" type="text" value="${escapeAttr(product.intervalDays || "")}" placeholder="Días o A verificar">
          </div>
          <div class="field">
            <label>Estadio o condiciones de aplicación</label>
            <input data-product-field="stageConditions" type="text" value="${escapeAttr(product.stageConditions || "")}">
          </div>
          <div class="field" style="grid-column:1/-1">
            <label>Fuente documental</label>
            <textarea data-product-field="source">${escapeHtml(product.source || "")}</textarea>
          </div>
        </div>
      </article>
    `;
  }

  function collectProductForm() {
    const modal = modalRoot.querySelector("[data-product-modal]");
    if (!modal) return null;
    const id = modal.dataset.productId;
    const existing = productById(id) || blankProduct();
    existing.id = id || existing.id;

    const get = (field) => modal.querySelector(`[data-product-field="${field}"]`)?.value ?? "";

    const product = {
      ...existing,
      name: get("name").trim(),
      regNumber: get("regNumber").trim(),
      activeIngredients: get("activeIngredients").trim(),
      mezcla: get("mezcla").trim() || "——",
      cropUse: get("cropUse").trim(),
      targets: splitList(get("targets")),
      doseRecommended: get("doseRecommended").trim(),
      visibleDoseUnit: get("visibleDoseUnit").trim(),
      expectedAppliedUnit: get("expectedAppliedUnit").trim(),
      ps: get("ps").trim(),
      maxApplications: get("maxApplications").trim(),
      intervalDays: get("intervalDays").trim(),
      stageConditions: get("stageConditions").trim(),
      source: get("source").trim(),
      doseRule: {
        mode: get("doseRuleMode") || "text",
        unique: get("doseUnique").trim(),
        min: get("doseMin").trim(),
        max: get("doseMax").trim(),
        limit: get("doseLimit").trim(),
        unit: get("visibleDoseUnit").trim()
      },
      volumeRule: {
        mode: get("volumeMode") || "range",
        unique: get("volumeUnique").trim(),
        min: get("volumeMin").trim(),
        max: get("volumeMax").trim(),
        unit: "L/ha"
      },
      updatedAt: nowIso()
    };

    if (!product.createdAt) product.createdAt = nowIso();
    product.pendingFields = inferPendingFields(product);
    product.fieldStatus = product.fieldStatus || {};
    return product;
  }

  async function saveProductModal() {
    const product = collectProductForm();
    if (!product) return;
    if (!product.name) {
      toast("Indica el nombre del producto.");
      return;
    }
    await dbPut(STORES.PRODUCTS, product);
    await refreshAll();
    await syncPendingTreatmentTechnicalFields(product);
    closeModal();
    toast("Ficha guardada.");
    render();
  }

  async function deleteProduct(productId) {
    const product = productById(productId);
    if (!product) return;
    const relatedRows = state.treatments.filter((row) => row.productId === productId).length;
    if (relatedRows > 0) {
      toast("No se elimina: la ficha ya está vinculada a tratamientos registrados.");
      return;
    }
    const ok = window.confirm(`Eliminar la ficha "${product.name}" y sus documentos asociados?`);
    if (!ok) return;

    const docs = state.documents.filter((doc) => doc.productId === productId);
    for (const doc of docs) {
      await dbDelete(STORES.DOCUMENTS, doc.id);
    }
    await dbDelete(STORES.PRODUCTS, productId);
    await refreshAll();
    toast("Ficha eliminada.");
    render();
  }

  function inferPendingFields(product) {
    const pending = [];
    if (!product.regNumber) pending.push("regNumber");
    if (!product.activeIngredients) pending.push("activeIngredients");
    if (!product.mezcla || product.mezcla === "A verificar") pending.push("mezcla");
    if (!product.cropUse) pending.push("cropUse");
    if (!getProductTargets(product).length) pending.push("targets");
    if (!product.doseRecommended) pending.push("doseRecommended");
    if (!product.expectedAppliedUnit) pending.push("expectedAppliedUnit");
    if (!product.ps) pending.push("ps");
    if (!product.maxApplications) pending.push("maxApplications");
    if (!product.source) pending.push("source");

    const doseRule = normalizeDoseRule(product.doseRule);
    if (doseRule.mode !== "text") {
      if (doseRule.mode === "unique" && !doseRule.unique) pending.push("doseRule");
      if (doseRule.mode === "range" && (!doseRule.min || !doseRule.max)) pending.push("doseRule");
      if (doseRule.mode === "range_limit" && (!doseRule.min || !doseRule.max || !doseRule.limit)) pending.push("doseRule");
    }

    const volume = normalizeVolumeRule(product.volumeRule);
    if (!product.volumeImportedUnknown) {
      if (volume.mode === "unique" && !volume.unique) pending.push("volumeRule");
      if (volume.mode === "range" && (!volume.min || !volume.max)) pending.push("volumeRule");
    }

    return Array.from(new Set(pending));
  }

  async function syncPendingTreatmentTechnicalFields(product) {
    const rows = state.treatments.filter((row) => row.productId === product.id);
    for (const row of rows) {
      const pendingSet = new Set(row.pendingFields || []);
      const updated = { ...row };
      let changed = false;

      const updateIfPending = (field, value) => {
        if (pendingSet.has(field) || String(updated[field] || "").toLowerCase() === "a verificar") {
          if (value) {
            updated[field] = value;
            pendingSet.delete(field);
            changed = true;
          }
        }
      };

      updateIfPending("regNumber", product.regNumber);
      updateIfPending("activeIngredients", product.activeIngredients);
      updateIfPending("mezcla", product.mezcla);
      updateIfPending("cropUse", product.cropUse);
      updateIfPending("ps", product.ps);
      updateIfPending("doseRecommended", product.doseRecommended || formatDoseRule(product.doseRule));
      updateIfPending("volumeRule", formatVolumeRule(product.volumeRule));
      if ((pendingSet.has("targets") || String(updated.target || "").toLowerCase() === "a verificar") && firstTarget(product)) {
        updated.target = firstTarget(product);
        pendingSet.delete("targets");
        changed = true;
      }

      updated.pendingFields = Array.from(pendingSet);
      updated.updatedAt = nowIso();
      if (changed) {
        await dbPut(STORES.TREATMENTS, updated);
      }
    }
    await refreshAll();
  }

  // ---------- Documentación ----------
  async function onModalChange(event) {
    const upload = event.target.closest("[data-action='upload-product-docs']");
    if (upload && upload.files?.length) {
      await addProductDocuments(upload.dataset.productId, Array.from(upload.files));
      upload.value = "";
      return;
    }
  }

  async function onModalInput(event) {
    // Reservado para extensiones futuras sin redibujar formularios.
  }

  async function addProductDocuments(productId, files) {
    const existing = state.documents.filter((doc) => doc.productId === productId);
    let added = 0;

    for (const file of files) {
      const duplicate = existing.find((doc) =>
        doc.name === file.name &&
        Number(doc.size || 0) === Number(file.size || 0)
      );
      if (duplicate) continue;

      const doc = {
        id: uid("doc"),
        productId,
        name: file.name,
        type: file.type || guessMime(file.name),
        size: file.size || 0,
        addedAt: nowIso(),
        blob: file
      };
      await dbPut(STORES.DOCUMENTS, doc);
      added += 1;
    }

    await refreshAll();
    updateProductDocsArea(productId);
    toast(added ? `${added} documento(s) añadido(s).` : "No se añadieron duplicados.");
  }

  function updateProductDocsArea(productId) {
    const docsHost = modalRoot.querySelector("#productDocsHost");
    const sourceHost = modalRoot.querySelector("#sourceGroupsHost");
    if (docsHost) docsHost.innerHTML = renderProductDocs(productId);
    if (sourceHost) sourceHost.innerHTML = renderSourceGroups(productId);
  }

  function renderProductDocs(productId) {
    const docs = state.documents.filter((doc) => doc.productId === productId);
    if (!docs.length) return `<div class="empty">No hay documentos asociados.</div>`;
    return `
      <ul class="doc-list">
        ${docs.map((doc) => `
          <li class="doc-item">
            <div class="item-head">
              <div>
                <strong>${escapeHtml(doc.name)}</strong>
                <p class="muted small">${escapeHtml(formatBytes(doc.size))} · ${escapeHtml(formatDateTime(doc.addedAt))}</p>
              </div>
              <div class="item-actions">
                ${isImageDoc(doc) ? `<button class="btn-soft" type="button" data-action="view-image-doc" data-doc-id="${escapeAttr(doc.id)}">Ver imagen ampliada</button>` : ""}
                ${isTextDoc(doc) ? `<button class="btn-soft" type="button" data-action="load-doc-text" data-doc-id="${escapeAttr(doc.id)}">Usar texto</button>` : ""}
                <button class="btn-danger" type="button" data-action="delete-product-doc" data-doc-id="${escapeAttr(doc.id)}" data-product-id="${escapeAttr(productId)}">Eliminar</button>
              </div>
            </div>
          </li>
        `).join("")}
      </ul>
    `;
  }

  function renderSourceGroups(productId) {
    const docs = state.documents.filter((doc) => doc.productId === productId);
    if (!docs.length) return `<div class="empty">Sin fuentes documentales guardadas.</div>`;

    const byDate = new Map();
    for (const doc of docs) {
      const date = String(doc.addedAt || nowIso()).slice(0, 10);
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(doc);
    }

    return `
      <ul class="source-list">
        ${Array.from(byDate.entries()).sort(([a],[b]) => b.localeCompare(a)).map(([date, grouped]) => `
          <li class="source-item">
            <div class="document-source-date">${formatDate(date)}</div>
            <div class="inline-toolbar" style="margin-top:8px">
              ${dedupeDocs(grouped).map((doc) => `<span class="file-pill">${escapeHtml(doc.name)}</span>`).join("")}
            </div>
          </li>
        `).join("")}
      </ul>
    `;
  }

  function dedupeDocs(docs) {
    const seen = new Set();
    return docs.filter((doc) => {
      const key = `${doc.name}|${doc.size}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ---------- Modal / propuestas ----------
  async function onModalClick(event) {
    const actionBtn = event.target.closest("[data-action]");
    if (!actionBtn) {
      if (event.target === modalRoot) closeModal();
      return;
    }

    const action = actionBtn.dataset.action;
    switch (action) {
      case "close-modal":
        closeModal();
        break;
      case "save-product-modal":
        await saveProductModal();
        break;
      case "delete-product-doc":
        await deleteProductDocument(actionBtn.dataset.docId, actionBtn.dataset.productId);
        break;
      case "view-image-doc":
        await openImageViewer(actionBtn.dataset.docId);
        break;
      case "load-doc-text":
        await loadDocumentTextIntoAnalyzer(actionBtn.dataset.docId);
        break;
      case "analyze-document-text":
        analyzeDocumentText();
        break;
      case "apply-reviewed-proposals":
        applyReviewedProposalsToForm();
        break;
      default:
        break;
    }
  }

  function openModal(html, { stack = true } = {}) {
    if (stack && !modalRoot.classList.contains("is-hidden") && modalRoot.innerHTML.trim()) {
      state.modalStack.push(modalRoot.innerHTML);
    }
    modalRoot.innerHTML = html;
    modalRoot.classList.remove("is-hidden");
    modalRoot.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    if (state.modalStack.length) {
      modalRoot.innerHTML = state.modalStack.pop();
      modalRoot.classList.remove("is-hidden");
      modalRoot.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      return;
    }
    modalRoot.innerHTML = "";
    modalRoot.classList.add("is-hidden");
    modalRoot.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  async function deleteProductDocument(docId, productId) {
    const doc = state.documents.find((item) => item.id === docId);
    if (!doc) return;
    const ok = window.confirm(`Eliminar "${doc.name}" de la ficha?`);
    if (!ok) return;
    await dbDelete(STORES.DOCUMENTS, docId);
    await refreshAll();
    updateProductDocsArea(productId);
    toast("Documento eliminado.");
  }

  async function openImageViewer(docId) {
    const doc = state.documents.find((item) => item.id === docId);
    if (!doc || !doc.blob) return;
    const url = URL.createObjectURL(doc.blob);
    openModal(`
      <div class="modal">
        <div class="modal-header">
          <h3>Ver imagen ampliada</h3>
          <button class="modal-close" data-action="close-modal" type="button" aria-label="Cerrar">×</button>
        </div>
        <div class="modal-body image-viewer">
          <img src="${escapeAttr(url)}" alt="${escapeAttr(doc.name)}">
          <p class="muted small">${escapeHtml(doc.name)}</p>
        </div>
      </div>
    `);
    const cleanup = () => URL.revokeObjectURL(url);
    modalRoot.addEventListener("transitionend", cleanup, { once: true });
    setTimeout(cleanup, 60_000);
  }

  async function loadDocumentTextIntoAnalyzer(docId) {
    const doc = state.documents.find((item) => item.id === docId);
    if (!doc?.blob) return;
    try {
      const text = await doc.blob.text();
      const textarea = modalRoot.querySelector("#documentTextToAnalyze");
      if (textarea) {
        textarea.value = text.slice(0, 120000);
        toast("Texto cargado para revisión.");
      }
    } catch (error) {
      console.error(error);
      toast("No se pudo leer el texto del documento.");
    }
  }

  function analyzeDocumentText() {
    const textarea = modalRoot.querySelector("#documentTextToAnalyze");
    const host = modalRoot.querySelector("#proposalReviewHost");
    if (!textarea || !host) return;
    const text = textarea.value.trim();
    if (!text) {
      toast("Pega o carga texto documental antes de generar propuestas.");
      return;
    }
    const proposals = extractProposals(text);
    host.innerHTML = renderProposalReview(proposals);
    toast(`${proposals.length} propuesta(s) generadas.`);
  }

  function renderProposalReview(proposals) {
    const proposalMap = new Map(proposals.map((proposal) => [proposal.field, proposal]));
    const cards = TECH_FIELDS.map((field) => {
      const proposal = proposalMap.get(field) || null;
      const label = REVIEW_FIELD_LABELS[field] || field;
      const value = proposal?.value || "A verificar";
      const evidence = proposal?.evidence || "No se identificó evidencia suficiente para proponer un valor.";
      const confidence = proposal?.confidence || "Baja";
      const badgeClass = confidence === "Alta" ? "badge-green" : confidence === "Media" ? "badge-yellow" : "badge-red";
      return `
        <article class="review-card pending" data-review-field="${escapeAttr(field)}">
          <div class="review-head">
            <div>
              <strong>${escapeHtml(label)}</strong>
              <p class="muted small">Propuesta: ${escapeHtml(value)}</p>
            </div>
            <span class="badge ${badgeClass}">${escapeHtml(confidence)}</span>
          </div>
          <div class="review-evidence"><strong>Evidencia:</strong> ${escapeHtml(evidence)}</div>
          <label class="inline-check">
            <input class="check-blue" type="checkbox" data-review-accept="${escapeAttr(field)}" ${proposal ? "" : "disabled"}>
            <span>${proposal ? "Aceptar propuesta" : "Sin propuesta automática: dejar A verificar o introducir valor manual"}</span>
          </label>
          <div class="field">
            <label>Entrada manual alternativa</label>
            <textarea data-review-manual="${escapeAttr(field)}" placeholder="El valor manual aceptado prevalece sobre la propuesta."></textarea>
          </div>
        </article>
      `;
    }).join("");

    return `
      <div class="review-grid">
        ${cards}
      </div>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn" type="button" data-action="apply-reviewed-proposals">Aplicar revisión a la ficha</button>
      </div>
    `;
  }

  function applyReviewedProposalsToForm() {
    const cards = Array.from(modalRoot.querySelectorAll("[data-review-field]"));
    if (!cards.length) {
      toast("No hay propuestas para aplicar.");
      return;
    }
    let applied = 0;
    for (const card of cards) {
      const field = card.dataset.reviewField;
      const accept = card.querySelector(`[data-review-accept="${cssEscape(field)}"]`)?.checked;
      const manual = card.querySelector(`[data-review-manual="${cssEscape(field)}"]`)?.value?.trim() || "";
      const proposed = card.querySelector(".review-head .muted")?.textContent?.replace(/^Propuesta:\s*/, "")?.trim() || "";
      const chosen = manual || (accept ? proposed : "");
      if (!chosen) continue;
      setProductFieldValue(field, chosen);
      applied += 1;
    }
    toast(`${applied} campo(s) preparados en la ficha. Revisa y guarda.`);
  }

  function setProductFieldValue(field, value) {
    const set = (selector, val) => {
      const el = modalRoot.querySelector(selector);
      if (el) el.value = val;
    };
    switch (field) {
      case "regNumber":
        set(`[data-product-field="regNumber"]`, value);
        break;
      case "activeIngredients":
        set(`[data-product-field="activeIngredients"]`, value);
        break;
      case "mezcla":
        set(`[data-product-field="mezcla"]`, value);
        break;
      case "cropUse":
        set(`[data-product-field="cropUse"]`, value);
        break;
      case "targets":
        set(`[data-product-field="targets"]`, value);
        break;
      case "doseRecommended":
        set(`[data-product-field="doseRecommended"]`, value);
        break;
      case "visibleDoseUnit":
        set(`[data-product-field="visibleDoseUnit"]`, value);
        break;
      case "expectedAppliedUnit":
        set(`[data-product-field="expectedAppliedUnit"]`, value);
        break;
      case "ps":
        set(`[data-product-field="ps"]`, value);
        break;
      case "maxApplications":
        set(`[data-product-field="maxApplications"]`, value);
        break;
      case "intervalDays":
        set(`[data-product-field="intervalDays"]`, value);
        break;
      case "stageConditions":
        set(`[data-product-field="stageConditions"]`, value);
        break;
      case "source":
        set(`[data-product-field="source"]`, value);
        break;
      case "doseRule":
        applyDoseRuleText(value);
        break;
      case "volumeRule":
        applyVolumeRuleText(value);
        break;
      default:
        break;
    }
  }

  function applyDoseRuleText(value) {
    const lower = value.toLowerCase();
    const nums = extractNumbers(value);
    if (lower.includes("único") && nums.length >= 1) {
      setField("doseRuleMode", "unique");
      setField("doseUnique", nums[0]);
      return;
    }
    if (lower.includes("límite") && nums.length >= 3) {
      setField("doseRuleMode", "range_limit");
      setField("doseMin", nums[0]);
      setField("doseMax", nums[1]);
      setField("doseLimit", nums[2]);
      return;
    }
    if (nums.length >= 2) {
      setField("doseRuleMode", "range");
      setField("doseMin", nums[0]);
      setField("doseMax", nums[1]);
      return;
    }
    setField("doseRecommended", value);
  }

  function applyVolumeRuleText(value) {
    const lower = value.toLowerCase();
    const nums = extractNumbers(value);
    if (lower.includes("único") && nums.length >= 1) {
      setField("volumeMode", "unique");
      setField("volumeUnique", nums[0]);
      return;
    }
    if (nums.length >= 2) {
      setField("volumeMode", "range");
      setField("volumeMin", nums[0]);
      setField("volumeMax", nums[1]);
    }
  }

  function setField(field, value) {
    const el = modalRoot.querySelector(`[data-product-field="${field}"]`);
    if (el) el.value = value;
  }

  function extractProposals(text) {
    const proposals = [];
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const sourceSnippet = lines.slice(0, 3).join(" · ").slice(0, 180);

    addProposal(proposals, "source", "Documento textual analizado", sourceSnippet || "Texto aportado", "Media");

    const reg = text.match(/(?:n[.º°o]?\s*de\s*registro|registro)\s*[:#]?\s*([A-Z]{0,4}-?\d{4,6})/i);
    if (reg) addProposal(proposals, "regNumber", reg[1], reg[0], "Alta");

    if (/solo\b/i.test(text)) {
      addProposal(proposals, "mezcla", "SOLO", matchEvidence(text, /solo\b/i), "Media");
    } else if (/mezclable|compatible/i.test(text)) {
      addProposal(proposals, "mezcla", "MEZCLABLE", matchEvidence(text, /mezclable|compatible/i), "Media");
    }

    if (/vid|viña|viñedo/i.test(text)) {
      addProposal(proposals, "cropUse", "Vid de vinificación", matchEvidence(text, /vid|viña|viñedo/i), "Media");
    }

    const targets = [];
    if (/mildio/i.test(text)) targets.push("Mildio");
    if (/o[ií]dio/i.test(text)) targets.push("Oídio");
    if (/botritis|podredumbre gris/i.test(text)) targets.push("Botritis");
    if (targets.length) addProposal(proposals, "targets", targets.join(", "), targets.join(" · "), "Media");

    const ps = text.match(/(?:p\.?\s*s\.?|plazo\s+de\s+seguridad)\s*[:\-]?\s*(\d+\s*d[ií]as|no\s+procede)/i);
    if (ps) addProposal(proposals, "ps", normalizePs(ps[1]), ps[0], "Alta");

    const maxApps = text.match(/(?:m[aá]ximo|max\.?)\s*(?:de)?\s*(\d+)\s*(?:aplicaciones|tratamientos).*?(?:campaña|año)/i);
    if (maxApps) addProposal(proposals, "maxApplications", maxApps[1], maxApps[0], "Alta");

    const interval = text.match(/(?:intervalo|repetir).*?(\d+\s*d[ií]as)/i);
    if (interval) addProposal(proposals, "intervalDays", interval[1], interval[0], "Media");

    const doseEvidence = text.match(/(?:dosis|aplicar)\s*[:\-]?\s*([^\n.;]{0,90}(?:kg\/ha|l\/ha|g\/hL|cc\/hL|ml\/hL|%)[^\n.;]{0,60})/i);
    if (doseEvidence) {
      addProposal(proposals, "doseRecommended", doseEvidence[1].trim(), doseEvidence[0], "Media");
      const unit = (doseEvidence[1].match(/kg\/ha|l\/ha|g\/hL|cc\/hL|ml\/hL|%/i) || [])[0];
      if (unit) {
        addProposal(proposals, "visibleDoseUnit", unit, doseEvidence[0], "Media");
        addProposal(proposals, "expectedAppliedUnit", unit, doseEvidence[0], "Baja");
      }
      const nums = extractNumbers(doseEvidence[1]);
      if (nums.length === 1) {
        addProposal(proposals, "doseRule", `ÚNICO ${nums[0]} ${unit || ""}`.trim(), doseEvidence[0], "Media");
      } else if (nums.length >= 2) {
        addProposal(proposals, "doseRule", `Mín. ${nums[0]} · Máx. ${nums[1]} ${unit || ""}`.trim(), doseEvidence[0], "Media");
      }
    }

    const volumeEvidence = text.match(/(?:volumen\s*(?:de)?\s*caldo|agua)\s*[:\-]?\s*([^\n.;]{0,90}(?:l\/ha|L\/ha)[^\n.;]{0,60})/i);
    if (volumeEvidence) {
      const nums = extractNumbers(volumeEvidence[1]);
      if (nums.length === 1) {
        addProposal(proposals, "volumeRule", `Volumen único ${nums[0]} L/ha`, volumeEvidence[0], "Media");
      } else if (nums.length >= 2) {
        addProposal(proposals, "volumeRule", `Mín. ${nums[0]} L/ha · Máx. ${nums[1]} L/ha`, volumeEvidence[0], "Media");
      }
    }

    const stage = text.match(/(?:estadio|aplicar\s+en|condiciones)\s*[:\-]?\s*([^\n.;]{4,140})/i);
    if (stage) addProposal(proposals, "stageConditions", stage[1].trim(), stage[0], "Baja");

    const active = text.match(/(?:principio(?:s)?\s+activo(?:s)?|composici[oó]n)\s*[:\-]?\s*([^\n.;]{4,180})/i);
    if (active) addProposal(proposals, "activeIngredients", active[1].trim(), active[0], "Media");

    return dedupeProposals(proposals);
  }

  function addProposal(list, field, value, evidence, confidence) {
    if (!value) return;
    list.push({ field, value: String(value).trim(), evidence: String(evidence || "").trim().slice(0, 240), confidence });
  }

  function dedupeProposals(proposals) {
    const seen = new Set();
    return proposals.filter((proposal) => {
      const key = `${proposal.field}|${proposal.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ---------- Validaciones técnicas ----------
  function validateDoseAgainstRule(product, dose, unit) {
    const rule = normalizeDoseRule(product.doseRule);
    if (!rule || rule.mode === "text") return { warning: "La ficha no dispone de regla numérica automática de dosis." };

    const expected = normalizeUnit(product.expectedAppliedUnit || rule.unit || "");
    const incoming = normalizeUnit(unit || "");
    if (expected && incoming && expected !== incoming) {
      return { warning: "No se compara automáticamente la dosis porque la unidad no coincide con la unidad esperada." };
    }

    if (rule.mode === "unique") {
      const unique = parseLocaleNumber(rule.unique);
      if (unique !== null && !approxEqual(dose, unique)) {
        return { error: `La dosis aplicada debe ser ${rule.unique} ${unit}.` };
      }
    }

    if (rule.mode === "range" || rule.mode === "range_limit") {
      const min = parseLocaleNumber(rule.min);
      const max = parseLocaleNumber(rule.max);
      if (min !== null && dose < min) return { error: `La dosis aplicada queda por debajo del mínimo (${rule.min}).` };
      if (max !== null && dose > max) return { error: `La dosis aplicada supera el máximo (${rule.max}).` };
    }

    return {};
  }

  function validateVolumeAgainstRule(product, liters) {
    if (product.volumeImportedUnknown) return { warning: "La ficha conserva volumen 'No consta'; no hay validación automática." };
    const rule = normalizeVolumeRule(product.volumeRule);
    if (!rule) return { warning: "La ficha no dispone de regla de volumen automática." };

    if (rule.mode === "unique") {
      const unique = parseLocaleNumber(rule.unique);
      if (unique !== null && !approxEqual(liters, unique)) {
        return { error: `El volumen de caldo debe ser ${rule.unique} L/ha.` };
      }
    }

    if (rule.mode === "range") {
      const min = parseLocaleNumber(rule.min);
      const max = parseLocaleNumber(rule.max);
      if (min !== null && liters < min) return { error: `El volumen aplicado queda por debajo del mínimo (${rule.min} L/ha).` };
      if (max !== null && liters > max) return { error: `El volumen aplicado supera el máximo (${rule.max} L/ha).` };
    }

    return {};
  }

  // ---------- Cuaderno / visualización ----------
  function displayTreatmentRow(row) {
    return {
      id: row.id,
      groupNo: valueOrPending(row.groupNo),
      date: row.date,
      dateFormatted: formatDate(row.date),
      productName: valueOrPending(row.productName),
      regNumber: valueOrPending(row.regNumber),
      lot: valueOrPending(row.lot),
      doseRecommended: valueOrPending(row.doseRecommended),
      appliedDose: valueOrPending(row.appliedDose || formatAppliedDose(row.appliedDoseValue, row.appliedUnit)),
      volumeRule: valueOrPending(row.volumeRule),
      litersHa: valueOrPending(row.litersHa),
      cropUse: valueOrPending(row.cropUse),
      target: valueOrPending(row.target),
      ps: valueOrPending(row.ps),
      campaignCount: campaignCountLabel(row),
      activeIngredients: valueOrPending(row.activeIngredients),
      mezcla: valueOrPending(row.mezcla)
    };
  }

  function buildTableHtml() {
    let lastGroup = null;
    return `
      <table class="cuaderno-table" aria-label="Cuaderno de tratamientos">
        <thead>
          <tr>
            <th>N.º</th>
            <th>Fecha</th>
            <th>Nombre<br>del producto</th>
            <th>N.º de<br>registro</th>
            <th>Lote</th>
            <th>Dosis<br>recomendada</th>
            <th>Dosis<br>aplicada</th>
            <th>Volumen<br>caldo</th>
            <th>Litros/ha<br>aplicados</th>
            <th>Cultivo</th>
            <th>Plaga /<br>patógeno</th>
            <th>P.S.</th>
            <th>Tratamientos<br>campaña</th>
            <th>Principios<br>activos</th>
            <th>MEZCLA</th>
          </tr>
        </thead>
        <tbody>
          ${state.treatments.map((row) => {
            const display = displayTreatmentRow(row);
            const groupStart = lastGroup !== display.groupNo;
            lastGroup = display.groupNo;
            return `
              <tr class="${groupStart ? "group-start" : ""}">
                ${tableCell(display.groupNo, "tech")}
                ${tableCell(display.dateFormatted)}
                ${tableCell(display.productName)}
                ${tableCell(display.regNumber)}
                ${tableCell(display.lot)}
                ${tableCell(display.doseRecommended, "tech")}
                ${tableCell(display.appliedDose)}
                ${tableCell(display.volumeRule, "tech")}
                ${tableCell(display.litersHa)}
                ${tableCell(display.cropUse)}
                ${tableCell(display.target)}
                ${tableCell(display.ps)}
                ${tableCell(display.campaignCount, "tech")}
                ${tableCell(display.activeIngredients)}
                ${tableCell(display.mezcla, "tech")}
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;
  }

  function tableCell(value, extraClass = "") {
    const pending = String(value || "").toLowerCase().includes("a verificar");
    return `<td class="${extraClass} ${pending ? "pending" : ""}">${escapeHtml(valueOrPending(value))}</td>`;
  }

  function rowHasPending(display) {
    return Object.values(display).some((value) => String(value || "").toLowerCase().includes("a verificar"));
  }

  function campaignCountLabel(row) {
    const relevant = state.treatments
      .filter((item) => item.productId && item.productId === row.productId)
      .sort(compareTreatmentOrder);
    const idx = relevant.findIndex((item) => item.id === row.id);
    const count = idx >= 0 ? idx + 1 : 1;
    const product = productById(row.productId);
    const max = parseMaxApplications(product?.maxApplications);
    return max !== null ? `${count}/${max}` : "NO CONSTA";
  }

  function countTreatmentsByProduct() {
    const map = new Map();
    for (const row of state.treatments) {
      if (!row.productId) continue;
      map.set(row.productId, (map.get(row.productId) || 0) + 1);
    }
    return map;
  }

  // ---------- Exportación ----------
  function exportCsv() {
    const rows = exportRows();
    const header = rows.shift();
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(";")).join("\n");
    downloadBlob(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }), `cuaderno_tratamientos_${state.settings?.campaign || "2026"}_v2_0.csv`);
    toast("CSV generado.");
  }

  function exportXls() {
    const rows = exportRows();
    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
      <head><meta charset="utf-8"></head>
      <body>
        <table border="1">
          ${rows.map((row, i) => `<tr>${row.map((cell) => `<${i === 0 ? "th" : "td"}>${escapeHtml(cell)}</${i === 0 ? "th" : "td"}>`).join("")}</tr>`).join("")}
        </table>
      </body></html>
    `;
    downloadBlob(new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" }), `cuaderno_tratamientos_${state.settings?.campaign || "2026"}_v2_0.xls`);
    toast("Archivo Excel generado.");
  }

  function exportRows() {
    const header = [
      "N.º","Fecha","Nombre del producto","N.º de registro","Lote",
      "Dosis recomendada","Dosis aplicada","Volumen caldo","Litros/ha aplicados",
      "Cultivo","Plaga / patógeno","P.S.","Tratamientos campaña","Principios activos","MEZCLA"
    ];
    const rows = state.treatments.map((row) => {
      const d = displayTreatmentRow(row);
      return [
        d.groupNo, d.dateFormatted, d.productName, d.regNumber, d.lot,
        d.doseRecommended, d.appliedDose, d.volumeRule, d.litersHa,
        d.cropUse, d.target, d.ps, d.campaignCount, d.activeIngredients, d.mezcla
      ];
    });
    return [header, ...rows];
  }

  function printOfficialPdf() {
    const body = `
      <h1>CUADERNO DE TRATAMIENTOS. CAMPAÑA ${escapeHtml(state.settings?.campaign || "2026")}</h1>
      <p class="applicator"><strong>Nombre del aplicador:</strong> ${escapeHtml(state.settings?.applicator || "No configurado")}</p>
      ${buildPrintTableHtml()}
    `;
    openPrintWindow("PDF oficial", body, "official");
  }

  function printCompactPdf() {
    const cards = state.treatments.map((row) => {
      const d = displayTreatmentRow(row);
      return `
        <section class="compact-card">
          <h2>${escapeHtml(d.productName)} · ${escapeHtml(d.dateFormatted)}</h2>
          <p><strong>N.º:</strong> ${escapeHtml(d.groupNo)} · <strong>Registro:</strong> ${escapeHtml(d.regNumber)} · <strong>Lote:</strong> ${escapeHtml(d.lot)}</p>
          <p><strong>Dosis:</strong> ${escapeHtml(d.appliedDose)} · <strong>Volumen aplicado:</strong> ${escapeHtml(d.litersHa)} L/ha</p>
          <p><strong>Objetivo:</strong> ${escapeHtml(d.target)} · <strong>P.S.:</strong> ${escapeHtml(d.ps)} · <strong>Campaña:</strong> ${escapeHtml(d.campaignCount)}</p>
        </section>
      `;
    }).join("");
    const body = `
      <h1>CUADERNO DE TRATAMIENTOS · RESUMEN COMPACTO</h1>
      <p><strong>Campaña:</strong> ${escapeHtml(state.settings?.campaign || "2026")} · <strong>Aplicador:</strong> ${escapeHtml(state.settings?.applicator || "No configurado")}</p>
      ${cards || "<p>Sin tratamientos registrados.</p>"}
    `;
    openPrintWindow("PDF compacto", body, "compact");
  }

  function buildPrintTableHtml() {
    const rows = exportRows();
    return `
      <table>
        <thead><tr>${rows[0].map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.slice(1).map((row) => `<tr>${row.map((cell, index) => {
            const tech = [0,5,7,12,14].includes(index);
            const pending = String(cell).toLowerCase().includes("a verificar");
            return `<td class="${tech ? "tech" : ""} ${pending ? "pending" : ""}">${escapeHtml(cell)}</td>`;
          }).join("")}</tr>`).join("")}
        </tbody>
      </table>
    `;
  }

  function openPrintWindow(title, body, mode) {
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) {
      toast("El navegador ha bloqueado la ventana de impresión.");
      return;
    }
    win.document.write(`
      <!doctype html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(title)}</title>
        <style>
          @page { size: A4 ${mode === "official" ? "landscape" : "portrait"}; margin: ${mode === "official" ? "11mm" : "14mm"}; }
          body { font-family: Arial, sans-serif; color:#111; }
          h1 { text-align:center; font-size:${mode === "official" ? "18px" : "20px"}; text-decoration:${mode === "official" ? "underline" : "none"}; margin:0 0 18px; }
          .applicator { font-size:13px; margin:0 0 16px; text-decoration:underline; }
          table { width:100%; border-collapse:collapse; font-size:${mode === "official" ? "7.2px" : "10px"}; }
          th, td { border:1px solid #aab8c5; padding:${mode === "official" ? "4px 3px" : "5px"}; text-align:center; vertical-align:middle; white-space:pre-line; }
          th { background:#2b74b9; color:#fff; font-weight:700; }
          td.tech { background:#fff4d2; }
          td.pending { background:#f5caca; font-weight:700; color:#7e1f2b; }
          .compact-card { border:1px solid #bbb; border-radius:10px; padding:10px 12px; margin:0 0 10px; break-inside:avoid; }
          .compact-card h2 { font-size:15px; margin:0 0 6px; }
          .compact-card p { margin:4px 0; font-size:12px; }
        </style>
      </head>
      <body>${body}</body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 350);
  }

  async function exportBackup() {
    const docs = [];
    for (const doc of state.documents) {
      docs.push({
        ...doc,
        blob: undefined,
        dataUrl: doc.blob ? await blobToDataUrl(doc.blob) : null
      });
    }
    const payload = {
      type: "cuaderno-tratamientos-backup-v2",
      appVersion: APP_VERSION,
      exportedAt: nowIso(),
      settings: state.settings,
      products: state.products,
      treatments: state.treatments,
      documents: docs
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `copia_completa_cuaderno_tratamientos_${state.settings?.campaign || "2026"}_v2_0.json`);
    toast("Copia completa exportada.");
  }

  async function previewImportFile(file) {
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const preview = inspectImportPayload(payload);
      state.pendingImportPayload = payload;
      state.importPreview = preview;
      render();
      toast("JSON leído. Revisa la vista previa.");
    } catch (error) {
      console.error(error);
      toast("El JSON no es válido.");
    }
  }

  function inspectImportPayload(payload) {
    const products = Array.isArray(payload?.products) ? payload.products.length : 0;
    const treatments = Array.isArray(payload?.treatments) ? payload.treatments.length : Array.isArray(payload?.tratamientos) ? payload.tratamientos.length : 0;
    const documents = Array.isArray(payload?.documents) ? payload.documents.length : 0;
    const type = payload?.type || "json-generico";
    const typeLabel = type === "cuaderno-tratamientos-backup-v2"
      ? "Copia completa V 2.0"
      : type.includes("carga") || payload?.tratamientos
        ? "Carga controlada de tratamientos"
        : "JSON genérico compatible";
    return { type, typeLabel, products, treatments, documents };
  }

  async function confirmPendingImport() {
    const payload = state.pendingImportPayload;
    if (!payload) return;

    const preview = state.importPreview || inspectImportPayload(payload);
    const isBackup = preview.type === "cuaderno-tratamientos-backup-v2";
    const message = isBackup
      ? "La restauración sustituirá los datos locales actuales por los contenidos del JSON. ¿Continuar?"
      : "La importación añadirá los datos compatibles del JSON a la app. ¿Continuar?";
    if (!window.confirm(message)) return;

    if (isBackup) {
      await restoreBackupPayload(payload);
      toast("Copia restaurada.");
    } else {
      await importControlledPayload(payload);
      toast("Importación controlada completada.");
    }
    clearPendingImport();
    await refreshAll();
    render();
  }

  function clearPendingImport() {
    state.pendingImportPayload = null;
    state.importPreview = null;
    render();
  }

  async function restoreBackupPayload(payload) {
    await dbClear(STORES.SETTINGS);
    await dbClear(STORES.PRODUCTS);
    await dbClear(STORES.TREATMENTS);
    await dbClear(STORES.DOCUMENTS);
    await dbClear(STORES.DRAFTS);

    if (payload.settings) await dbPut(STORES.SETTINGS, payload.settings);
    for (const product of payload.products || []) await dbPut(STORES.PRODUCTS, normalizeImportedProduct(product));
    for (const row of payload.treatments || []) await dbPut(STORES.TREATMENTS, normalizeImportedTreatment(row));
    for (const doc of payload.documents || []) {
      const restored = { ...doc };
      if (doc.dataUrl) restored.blob = dataUrlToBlob(doc.dataUrl);
      delete restored.dataUrl;
      await dbPut(STORES.DOCUMENTS, restored);
    }
  }

  async function importControlledPayload(payload) {
    const products = Array.isArray(payload.products) ? payload.products : [];
    const treatments = Array.isArray(payload.treatments) ? payload.treatments : Array.isArray(payload.tratamientos) ? payload.tratamientos : [];
    const documents = Array.isArray(payload.documents) ? payload.documents : [];

    const productIdMap = new Map();
    for (const product of products) {
      const normalized = normalizeImportedProduct(product);
      const existing = state.products.find((item) => item.id === normalized.id || item.name === normalized.name);
      if (existing) {
        productIdMap.set(normalized.id, existing.id);
      } else {
        await dbPut(STORES.PRODUCTS, normalized);
        productIdMap.set(normalized.id, normalized.id);
      }
    }

    for (const row of treatments) {
      const normalized = normalizeImportedTreatment(row);
      if (normalized.productId && productIdMap.has(normalized.productId)) {
        normalized.productId = productIdMap.get(normalized.productId);
      }
      const duplicate = state.treatments.find((existing) => existing.id === normalized.id);
      if (!duplicate) await dbPut(STORES.TREATMENTS, normalized);
    }

    for (const doc of documents) {
      const normalized = { ...doc };
      if (normalized.productId && productIdMap.has(normalized.productId)) {
        normalized.productId = productIdMap.get(normalized.productId);
      }
      if (doc.dataUrl) normalized.blob = dataUrlToBlob(doc.dataUrl);
      delete normalized.dataUrl;
      const duplicate = state.documents.find((existing) => existing.id === normalized.id);
      if (!duplicate) await dbPut(STORES.DOCUMENTS, normalized);
    }
  }

  function normalizeImportedProduct(product) {
    const normalized = {
      ...blankProduct(),
      ...product,
      id: product.id || uid("prod"),
      targets: Array.isArray(product.targets) ? product.targets : splitList(product.targets || ""),
      doseRule: normalizeDoseRule(product.doseRule),
      volumeRule: normalizeVolumeRule(product.volumeRule),
      updatedAt: nowIso()
    };
    normalized.pendingFields = Array.isArray(product.pendingFields) ? product.pendingFields : inferPendingFields(normalized);
    return normalized;
  }

  function normalizeImportedTreatment(row) {
    return {
      id: row.id || uid("tr"),
      groupNo: String(row.groupNo || row.numero || row.n || nextTreatmentGroupNo()),
      date: normalizeDateValue(row.date || row.fecha || todayIso()),
      productId: row.productId || "",
      productName: row.productName || row.nombreProducto || row.producto || "A verificar",
      regNumber: row.regNumber || row.numeroRegistro || row.registro || "A verificar",
      lot: row.lot || row.lote || "A verificar",
      doseRecommended: row.doseRecommended || row.dosisRecomendada || "A verificar",
      appliedDose: row.appliedDose || row.dosisAplicada || formatAppliedDose(row.appliedDoseValue, row.appliedUnit) || "A verificar",
      appliedDoseValue: row.appliedDoseValue || "",
      appliedUnit: row.appliedUnit || "",
      volumeRule: row.volumeRule || row.volumenCaldo || "A verificar",
      litersHa: row.litersHa || row.litrosHa || row.litrosHectarea || "A verificar",
      cropUse: row.cropUse || row.cultivo || "A verificar",
      target: row.target || row.plaga || row.patogeno || "A verificar",
      ps: row.ps || row.plazoSeguridad || "A verificar",
      activeIngredients: row.activeIngredients || row.principiosActivos || "A verificar",
      mezcla: row.mezcla || "A verificar",
      pendingFields: Array.isArray(row.pendingFields) ? row.pendingFields : detectPendingFromImportedRow(row),
      createdAt: row.createdAt || nowIso(),
      updatedAt: nowIso()
    };
  }

  function detectPendingFromImportedRow(row) {
    const fields = [];
    for (const [field, value] of Object.entries(row || {})) {
      if (String(value || "").toLowerCase().includes("a verificar")) fields.push(field);
    }
    return fields;
  }

  // ---------- Utilidades de producto / formato ----------
  function normalizeDoseRule(rule) {
    return {
      mode: rule?.mode || "text",
      unique: rule?.unique || "",
      min: rule?.min || "",
      max: rule?.max || "",
      limit: rule?.limit || "",
      unit: rule?.unit || ""
    };
  }

  function normalizeVolumeRule(rule) {
    return {
      mode: rule?.mode || "range",
      unique: rule?.unique || "",
      min: rule?.min || "",
      max: rule?.max || "",
      unit: "L/ha"
    };
  }

  function formatDoseRule(rule) {
    const d = normalizeDoseRule(rule);
    if (d.mode === "unique" && d.unique) return `${d.unique} ${d.unit || ""}\nÚNICO`.trim();
    if (d.mode === "range_limit" && d.min && d.max && d.limit) return `Mín. ${d.min} ${d.unit || ""}\nMáx. ${d.max} ${d.unit || ""}\nLímite ${d.limit}`.trim();
    if (d.mode === "range" && d.min && d.max) return `Mín. ${d.min} ${d.unit || ""}\nMáx. ${d.max} ${d.unit || ""}`.trim();
    return "";
  }

  function formatVolumeRule(rule) {
    if (!rule) return "A verificar";
    const v = normalizeVolumeRule(rule);
    if (v.mode === "unique" && v.unique) return `${v.unique} L/ha\nÚNICO`;
    if (v.mode === "range" && v.min && v.max) return `Mín. ${v.min} L/ha\nMáx. ${v.max} L/ha`;
    return "A verificar";
  }

  function formatAppliedDose(value, unit) {
    const v = String(value || "").trim();
    const u = String(unit || "").trim();
    if (!v) return "";
    return `${v}${u ? " " + u : ""}`;
  }

  function parseMaxApplications(value) {
    const n = Number(String(value || "").replace(/[^\d]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  // ---------- Fechas / orden ----------
  function sortTreatments(rows) {
    return [...rows].sort(compareTreatmentOrder).reverse();
  }

  function compareTreatmentOrder(a, b) {
    const ad = String(a.date || "");
    const bd = String(b.date || "");
    if (ad !== bd) return ad.localeCompare(bd);
    const ag = Number(a.groupNo || 0);
    const bg = Number(b.groupNo || 0);
    if (ag !== bg) return ag - bg;
    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  }

  function sortDocs(docs) {
    return [...docs].sort((a, b) => String(b.addedAt || "").localeCompare(String(a.addedAt || "")));
  }

  function sortByName(items, key) {
    return [...items].sort((a, b) => String(a?.[key] || "").localeCompare(String(b?.[key] || ""), "es", { sensitivity: "base" }));
  }

  function todayIso() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function isFutureDate(date) {
    return String(date || "") > todayIso();
  }

  function normalizeDateValue(value) {
    if (!value) return todayIso();
    const str = String(value);
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    const dmy = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    return todayIso();
  }

  function formatDate(value) {
    const normalized = normalizeDateValue(value);
    const [y, m, d] = normalized.split("-").map(Number);
    if (!y || !m || !d) return normalized;
    return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
  }

  function formatDateTime(value) {
    if (!value) return "—";
    try {
      return new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
    } catch {
      return String(value);
    }
  }

  // ---------- IndexedDB ----------
  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORES.SETTINGS)) db.createObjectStore(STORES.SETTINGS, { keyPath: "id" });
        if (!db.objectStoreNames.contains(STORES.PRODUCTS)) db.createObjectStore(STORES.PRODUCTS, { keyPath: "id" });
        if (!db.objectStoreNames.contains(STORES.TREATMENTS)) db.createObjectStore(STORES.TREATMENTS, { keyPath: "id" });
        if (!db.objectStoreNames.contains(STORES.DOCUMENTS)) db.createObjectStore(STORES.DOCUMENTS, { keyPath: "id" });
        if (!db.objectStoreNames.contains(STORES.DRAFTS)) db.createObjectStore(STORES.DRAFTS, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function dbTx(store, mode, callback) {
    return new Promise((resolve, reject) => {
      const tx = state.db.transaction(store, mode);
      const os = tx.objectStore(store);
      let request;
      try {
        request = callback(os);
      } catch (error) {
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  function dbGet(store, key) {
    return new Promise((resolve, reject) => {
      const tx = state.db.transaction(store, "readonly");
      const request = tx.objectStore(store).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function dbGetAll(store) {
    return new Promise((resolve, reject) => {
      const tx = state.db.transaction(store, "readonly");
      const request = tx.objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  function dbPut(store, value) {
    return dbTx(store, "readwrite", (os) => os.put(value));
  }

  function dbDelete(store, key) {
    return dbTx(store, "readwrite", (os) => os.delete(key));
  }

  function dbClear(store) {
    return dbTx(store, "readwrite", (os) => os.clear());
  }

  // ---------- Service worker ----------
  function bindServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", async () => {
      try {
        const reg = await navigator.serviceWorker.register("./service-worker.js");
        if (reg.waiting) showUpdateAvailable(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              showUpdateAvailable(worker);
            }
          });
        });
        navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload());
      } catch (error) {
        console.warn("Service worker no disponible", error);
      }
    });
  }

  function showUpdateAvailable(worker) {
    state.waitingWorker = worker;
    updateBanner.classList.remove("is-hidden");
  }

  // ---------- Utilidades generales ----------
  function toast(message) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    toastRoot.appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }

  function uid(prefix) {
    if (crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function valueOrPending(value) {
    const text = String(value ?? "").trim();
    return text || "A verificar";
  }

  function splitList(value) {
    return String(value || "")
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function parseLocaleNumber(value) {
    if (value === null || value === undefined) return null;
    const cleaned = String(value).trim().replace(/\./g, "").replace(",", ".");
    if (!cleaned) return null;
    const match = cleaned.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const n = Number(match[0]);
    return Number.isFinite(n) ? n : null;
  }

  function extractNumbers(value) {
    return (String(value || "").match(/\d+(?:[.,]\d+)?/g) || []).map((item) => item.replace(",", "."));
  }

  function normalizeUnit(unit) {
    return String(unit || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace("litros", "l")
      .replace("ml", "cc");
  }

  function approxEqual(a, b) {
    return Math.abs(Number(a) - Number(b)) < 0.0001;
  }

  function normalizePs(value) {
    const txt = String(value || "").trim();
    if (/no\s+procede/i.test(txt)) return "NO PROCEDE";
    return txt;
  }

  function matchEvidence(text, regex) {
    const match = text.match(regex);
    return match ? match[0] : "";
  }

  function formatBytes(bytes) {
    const n = Number(bytes || 0);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function isImageDoc(doc) {
    return String(doc?.type || "").startsWith("image/");
  }

  function isTextDoc(doc) {
    return String(doc?.type || "").startsWith("text/") || /\.txt$/i.test(doc?.name || "");
  }

  function guessMime(name) {
    const lower = String(name || "").toLowerCase();
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".pdf")) return "application/pdf";
    if (lower.endsWith(".txt")) return "text/plain";
    return "application/octet-stream";
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(dataUrl) {
    const [meta, base64] = String(dataUrl).split(",");
    const mime = (meta.match(/data:(.*?);base64/) || [])[1] || "application/octet-stream";
    const binary = atob(base64 || "");
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) arr[i] = binary.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    if (/[;"\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return window.CSS.escape(value);
    return String(value || "").replace(/"/g, '\\"');
  }
})();
