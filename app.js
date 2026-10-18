/* Interface Baki / Al-ghūl — une app, deux espaces, un seul profil et un seul calendrier. */
(function () {
  "use strict";
  var E = window.Engine, L = E.L, D = E.DATA;
  var KEY = "arena.db", BAK = "arena.db.bak", TKEY = "arena.round.";

  // =====================================================================
  // Stockage local transactionnel
  // =====================================================================
  var loadError = null;
  var db = loadDB();

  function loadDB() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return E.emptyDB();
      return E.validateDB(JSON.parse(raw));
    } catch (e) {
      loadError = e.message || String(e);
      return null;
    }
  }

  /** Écrit immédiatement : une saisie confirmée survit à une fermeture forcée (QUA01). */
  function commit(fn) {
    if (!db) { toast("Données illisibles : restaure une copie avant de continuer."); return false; }
    var next = E.clone(db);
    try { fn(next); } catch (e) { toast(e.message || String(e)); return false; }
    var before = JSON.stringify(db);
    if (before === JSON.stringify(next)) return true;
    next.revision = (db.revision || 0) + 1;
    next.updatedAt = Date.now();
    try {
      localStorage.setItem(BAK, before);
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch (e) {
      toast("Stockage plein : exporte une archive puis libère de l'espace. Rien n'a été écrasé.");
      return false;
    }
    db = next;
    return true;
  }

  window.addEventListener("storage", function (e) { if (e.key === KEY) { db = loadDB(); render(); } });
  if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) { /* facultatif */ } }

  // =====================================================================
  // État d'interface
  // =====================================================================
  var OBKEY = "arena.onboarding";
  var ui = { tab: "today", sheets: [], full: null, ob: restoreOnboarding(), edit: null, prop: null, form: {}, libFamily: "", libSearch: "", progEx: "", skillLevel: 0, calPast: false, rform: null, aform: null };

  /** Le parcours de création du profil est sauvegardé à chaque saisie : un rechargement ne fait rien perdre. */
  function restoreOnboarding() {
    try { var o = JSON.parse(localStorage.getItem(OBKEY) || "null"); return o && o.p ? o : null; } catch (e) { return null; }
  }
  function saveOnboarding() {
    try { if (ui.ob) localStorage.setItem(OBKEY, JSON.stringify(ui.ob)); } catch (e) { /* non bloquant */ }
  }

  function space() { return (db && db.settings.space) || "baki"; }
  function settings() { return (db && db.settings) || E.defaultSettings(); }
  function disc() { return space() === "baki" ? "strength" : "muayThai"; }
  function now() { return Date.now(); }

  // =====================================================================
  // Utilitaires d'affichage
  // =====================================================================
  function h(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function attr(o) { return Object.keys(o).map(function (k) { return " data-" + k + '="' + h(o[k]) + '"'; }).join(""); }
  function btn(label, act, data, cls) { return '<button class="btn ' + (cls || "") + '" data-act="' + act + '"' + attr(data || {}) + ">" + label + "</button>"; }
  function badge(s) { return '<span class="badge">' + L.statusIcon[s] + " " + L.status[s] + "</span>"; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function clock(sec) { var s = Math.max(0, Math.ceil(sec)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function toggle(label, bindPath, checked, extra) {
    return '<label class="toggle"><span>' + label + '</span><input type="checkbox" data-bind="' + bindPath + '" data-type="bool"' + (checked ? " checked" : "") + (extra || "") + "></label>";
  }
  function toggleAct(label, change, data, checked) {
    return '<label class="toggle"><span>' + label + '</span><input type="checkbox" data-change="' + change + '"' + attr(data || {}) + (checked ? " checked" : "") + "></label>";
  }
  function select(bindPath, options, value, type, rerender) {
    return '<select data-bind="' + bindPath + '" data-type="' + (type || "str") + '"' + (rerender ? " data-rerender" : "") + ">" +
      options.map(function (o) { return '<option value="' + h(o[0]) + '"' + (String(o[0]) === String(value) ? " selected" : "") + ">" + h(o[1]) + "</option>"; }).join("") + "</select>";
  }
  function seg(act, options, value, data) {
    return '<div class="seg">' + options.map(function (o) {
      return '<button class="' + (String(o[0]) === String(value) ? "on" : "") + '" data-act="' + act + '" data-v="' + h(o[0]) + '"' + attr(data || {}) + ">" + h(o[1]) + "</button>";
    }).join("") + "</div>";
  }
  function chips(act, options, value, data) {
    return '<div class="chip-row">' + options.map(function (o) {
      return '<button class="chip ' + (String(o[0]) === String(value) ? "on" : "") + '" data-act="' + act + '" data-v="' + h(o[0]) + '"' + attr(data || {}) + ">" + h(o[1]) + "</button>";
    }).join("") + "</div>";
  }
  function rating(act, range, value, low, high, data) {
    var opts = [["", "—"]];
    for (var i = range[0]; i <= range[1]; i++) opts.push([i, i]);
    return chips(act, opts, value == null ? "" : value, data) + '<div class="row between tiny muted"><span>' + low + "</span><span>" + high + "</span></div>";
  }
  function getPath(path) { return path.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, ui); }
  function setPath(path, v) {
    var ks = path.split("."), o = ui;
    for (var i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    o[ks[ks.length - 1]] = v;
  }

  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 4200);
  }

  var ICON = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    path: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="5" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 6h6a4 4 0 0 1 0 8h-2a4 4 0 0 0 0 8h6"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    cal: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>'
  };

  // =====================================================================
  // Rendu principal
  // =====================================================================
  function render() {
    document.body.dataset.space = space();
    var th = settings().theme;
    document.body.dataset.theme = th === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : th;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", getComputedStyle(document.body).getPropertyValue("--bg").trim() || "#111113");

    var scroll = saveScroll();
    var app = document.getElementById("app");
    if (!db) app.innerHTML = recoveryView();
    else if (!db.profile) app.innerHTML = onboardingView();
    else if (!E.activeCycle(db)) app.innerHTML = '<main class="screen">' + proposalBody(true) + "</main>";
    else app.innerHTML = mainView();

    var layer = document.getElementById("layer");
    layer.innerHTML = (ui.full ? '<div class="full" id="full">' + fullView() + "</div>" : "") +
      (ui.sheets.length ? '<div class="sheet-wrap" data-act="sheetBackdrop"><div class="sheet" role="dialog" aria-modal="true">' + sheetView(ui.sheets[ui.sheets.length - 1]) + "</div></div>" : "");
    restoreScroll(scroll);
    saveOnboarding();
  }
  function saveScroll() {
    var s = document.querySelector(".sheet-body"), f = document.getElementById("full");
    return { win: window.scrollY, sheet: s ? s.scrollTop : 0, full: f ? f.scrollTop : 0, depth: ui.sheets.length };
  }
  function restoreScroll(s) {
    window.scrollTo(0, s.win);
    var sh = document.querySelector(".sheet-body"), f = document.getElementById("full");
    if (sh && s.depth === ui.sheets.length) sh.scrollTop = s.sheet;
    if (f) f.scrollTop = s.full;
  }

  function mainView() {
    var sp = space();
    if (sp === "alghul" && ui.tab === "program") ui.tab = "parcours";
    if (sp === "baki" && ui.tab === "parcours") ui.tab = "program";
    var tabs = [["today", "Aujourd'hui", ICON.sun], sp === "baki" ? ["program", "Programme", ICON.list] : ["parcours", "Parcours", ICON.path], ["progress", "Progression", ICON.chart], ["profile", "Profil", ICON.user]];
    var body = { today: todayView, program: programView, parcours: parcoursView, progress: progressView, profile: profileView }[ui.tab]();
    return '<main class="screen">' +
      '<div class="topbar"><div class="space-switch" role="tablist" aria-label="Espace">' +
      '<button class="' + (sp === "baki" ? "on" : "") + '" data-act="space" data-v="baki">Baki</button>' +
      '<button class="' + (sp === "alghul" ? "on" : "") + '" data-act="space" data-v="alghul">Al-ghūl</button></div>' +
      '<button class="btn ghost" data-act="open" data-type="calendar" aria-label="Calendrier commun">' + ICON.cal + "</button></div>" +
      body + "</main>" +
      '<nav class="tabbar">' + tabs.map(function (t) {
        return '<button class="' + (ui.tab === t[0] ? "on" : "") + '" data-act="tab" data-v="' + t[0] + '">' + t[2] + "<span>" + t[1] + "</span></button>";
      }).join("") + "</nav>";
  }

  function recoveryView() {
    return '<main class="screen"><div class="card"><h2>Données illisibles</h2><p>' + h(loadError || "") + "</p><p class=\"muted small\">Rien n'a été effacé. Choisis une action de récupération.</p>" +
      btn("Restaurer la dernière copie valide", "restoreBackup") +
      '<label class="btn secondary">Importer une archive<input type="file" hidden data-change="importFile"></label>' +
      btn("Repartir de zéro (efface tout)", "resetAll", {}, "danger") + "</div></main>";
  }

  // =====================================================================
  // Onboarding (PRO01–PRO03, EVA01)
  // =====================================================================
  var OB_TITLES = ["Bienvenue", "Expérience", "Objectifs", "Matériel", "Disponibilités", "Limitations", "Bilan de départ"];

  function onboardingView() {
    if (!ui.ob) ui.ob = { step: 0, p: E.newProfile() };
    var st = ui.ob.step, p = ui.ob.p, body = "";
    if (st === 0) {
      body = '<div class="hero"><img src="icon-192.png" alt=""><h1>Baki · Al-ghūl</h1><p class="muted">Baki construit le corps ; Al-ghūl développe la maîtrise martiale. Un seul profil, un seul calendrier : chaque effort compte pour les deux.</p></div>' +
        secIdentity("ob.p", p) +
        '<p class="small muted">Outil d\'entraînement sportif : aucun diagnostic, ne remplace ni un médecin ni un entraîneur. Les contenus sont des brouillons à faire valider par un coach qualifié.</p>';
    }
    if (st === 1) body = secExperience("ob.p", p);
    if (st === 2) body = secGoals("ob.p", p);
    if (st === 3) body = secEquipment("ob.p", p);
    if (st === 4) body = secSlots("ob.p", p);
    if (st === 5) body = secRestrictions("ob.p", p);
    if (st === 6) body = secAssessment("ob.p", p);
    var can = st === 0 ? p.isAdultConfirmed : st === 2 ? p.goals.length > 0 : true;
    var last = st === OB_TITLES.length - 1;
    return '<main class="screen" style="padding-bottom:calc(30px + var(--safe-b))">' +
      '<div class="progress accent" aria-label="Étape ' + (st + 1) + ' sur 8"><i style="width:' + ((st + 1) / 8 * 100) + '%"></i></div>' +
      "<h1>" + OB_TITLES[st] + "</h1>" + body +
      '<div class="btns">' + (st > 0 ? btn("Retour", "obPrev", {}, "secondary") : "") +
      (last ? btn("Voir ma proposition", "obFinish") : '<button class="btn" data-act="obNext"' + (can ? "" : " disabled") + ">" + (st >= 5 ? "Passer / Suivant" : "Suivant") + "</button>") +
      "</div>" + (st === 0 && !p.isAdultConfirmed ? '<p class="small muted center">Confirme ta majorité pour continuer.</p>' : "") + "</main>";
  }

  function secIdentity(t, p) {
    return '<div class="card">' +
      '<label class="field">Prénom ou pseudo (facultatif)<input type="text" data-bind="' + t + '.displayName" value="' + h(p.displayName) + '" autocomplete="given-name"></label>' +
      toggle("Je confirme être majeur", t + ".isAdultConfirmed", p.isAdultConfirmed, " data-rerender") +
      '<div class="row"><label class="field grow">Taille (cm)<input type="number" inputmode="decimal" data-bind="' + t + '.heightCm" data-type="numnull" value="' + h(p.heightCm == null ? "" : p.heightCm) + '"></label>' +
      '<label class="field grow">Poids (kg) — facultatif<input type="number" inputmode="decimal" data-bind="' + t + '.weightKg" data-type="numnull" value="' + h(p.weightKg == null ? "" : p.weightKg) + '"></label></div>' +
      '<p class="tiny muted">Profil local, sans compte en ligne. Une valeur non renseignée reste inconnue.</p></div>';
  }
  function secExperience(t, p) {
    var lv = [[1, L.level[1]], [2, L.level[2]], [3, L.level[3]]];
    return '<div class="card">' +
      '<label class="field">Musculation' + select(t + ".strengthExperience", lv, p.strengthExperience, "int") + "</label>" +
      '<label class="field">Combat / Muay thaï' + select(t + ".combatExperience", lv, p.combatExperience, "int") + "</label>" +
      '<label class="field">Garde préférée' + select(t + ".stance", Object.keys(L.stance).map(function (k) { return [k, L.stance[k]]; }), p.stance) + "</label>" +
      toggle("Je pratique aussi en club, encadré", t + ".hasSupervision", p.hasSupervision) + "</div>";
  }
  function secGoals(t, p) {
    return '<div class="card"><p class="small muted">Touche les objectifs dans ton ordre de priorité. Le premier est la priorité principale.</p><div class="list">' +
      Object.keys(L.goal).map(function (g) {
        var i = p.goals.indexOf(g);
        return '<button class="item" data-act="goal" data-t="' + t + '" data-g="' + g + '"><span class="icon">' + (i < 0 ? "○" : i + 1) + '</span><span class="grow">' + L.goal[g] + "</span>" + (i === 0 ? '<span class="badge">Priorité</span>' : "") + "</button>";
      }).join("") + "</div></div>";
  }
  function secEquipment(t, p) {
    return '<div class="card"><p class="small muted">Le poids du corps est toujours disponible.</p>' +
      Object.keys(L.equipment).filter(function (k) { return k !== "bodyweight"; }).map(function (k) {
        return toggleAct(L.equipment[k], "equip", { t: t, e: k }, p.equipment.indexOf(k) >= 0);
      }).join("") + '<div class="divider"></div><p class="small muted">Pas de charge disponibles (pour arrondir les suggestions)</p>' +
      '<div class="row"><label class="field grow">Barre (kg)<input type="number" inputmode="decimal" step="0.5" data-bind="' + t + '.barbellIncrementKg" data-type="num" value="' + p.barbellIncrementKg + '"></label>' +
      '<label class="field grow">Haltères (kg)<input type="number" inputmode="decimal" step="0.5" data-bind="' + t + '.dumbbellIncrementKg" data-type="num" value="' + p.dumbbellIncrementKg + '"></label>' +
      '<label class="field grow">Machines (kg)<input type="number" inputmode="decimal" step="0.5" data-bind="' + t + '.machineIncrementKg" data-type="num" value="' + p.machineIncrementKg + '"></label></div></div>';
  }
  function secSlots(t, p) {
    var days = [1, 2, 3, 4, 5, 6, 7].map(function (d) { return [d, L.weekday[d]]; });
    var durs = [15, 20, 30, 40, 45, 50, 60, 75, 90, 105, 120, 150, 180].map(function (m) { return [m, m + " min"]; });
    var purposes = Object.keys(L.slotPurpose).map(function (k) { return [k, L.slotPurpose[k]]; });
    var rows = p.slots.map(function (s, i) {
      var hh = String(Math.floor(s.startMinutes / 60)).padStart(2, "0") + ":" + String(s.startMinutes % 60).padStart(2, "0");
      return '<div class="card" style="background:var(--surface-2);gap:8px"><div class="row">' + select(t + ".slots." + i + ".weekday", days, s.weekday, "int") + select(t + ".slots." + i + ".purpose", purposes, s.purpose) + "</div>" +
        '<div class="row"><input type="time" value="' + hh + '" data-change="slotTime" data-t="' + t + '" data-i="' + i + '">' + select(t + ".slots." + i + ".durationMinutes", durs, s.durationMinutes, "int") +
        '<button class="btn danger small" data-act="delSlot" data-t="' + t + '" data-i="' + i + '" aria-label="Supprimer le créneau">✕</button></div></div>';
    }).join("");
    return '<div class="card"><p class="small muted">Les séances de l\'app ne sont placées que sur les créneaux « Disponible ». Natation et club entrent dans le calendrier commun.</p>' + rows +
      '<div class="btns">' + btn("+ Disponible", "addSlot", { t: t, p: "free" }, "secondary") + btn("+ Natation", "addSlot", { t: t, p: "swimming" }, "secondary") + btn("+ Club", "addSlot", { t: t, p: "club" }, "secondary") + "</div>" +
      '<label class="field">Durée préférée d\'une séance' + select(t + ".preferredSessionMinutes", [20, 30, 40, 45, 50, 60, 75, 90, 120].map(function (m) { return [m, m + " min"]; }), p.preferredSessionMinutes, "int") + "</label></div>";
  }
  function secRestrictions(t, p) {
    if (!ui.rform) ui.rform = { kind: "limitation", text: "", fam: [] };
    var list = p.restrictions.map(function (r, i) {
      return '<div class="row card" style="background:var(--surface-2)"><div class="grow"><div class="tiny muted">' + L.restriction[r.kind] + "</div><div>" + h(r.text) + "</div>" +
        (r.blockedFamilies.length ? '<div class="tiny muted">Évite : ' + r.blockedFamilies.map(function (f) { return L.family[f]; }).join(", ") + "</div>" : "") +
        '</div><button class="btn danger small" data-act="delRestriction" data-t="' + t + '" data-i="' + i + '">✕</button></div>';
    }).join("");
    return '<div class="card"><p class="small muted">Ces informations servent uniquement à filtrer le programme. L\'app ne pose aucun diagnostic.</p>' + list +
      '<label class="field">Type' + select("rform.kind", Object.keys(L.restriction).map(function (k) { return [k, L.restriction[k]]; }), ui.rform.kind) + "</label>" +
      '<label class="field">Description<input type="text" data-bind="rform.text" value="' + h(ui.rform.text) + '" placeholder="ex. : consigne du kiné"></label>' +
      '<p class="small muted">Familles de mouvement à éviter</p><div class="chip-row">' + Object.keys(L.family).map(function (f) {
        return '<button class="chip ' + (ui.rform.fam.indexOf(f) >= 0 ? "on" : "") + '" data-act="rfam" data-v="' + f + '">' + L.family[f] + "</button>";
      }).join("") + "</div>" + btn("Ajouter cette limitation", "addRestriction", { t: t }, "secondary") + "</div>";
  }
  function secAssessment(t, p) {
    if (!ui.aform) ui.aform = { label: "", value: "", source: "observation" };
    var sug = space() === "baki" ? ["Charge connue au développé", "Charge connue au squat", "Tractions possibles", "Amplitude confortable du squat"] : ["Expérience en club", "Déplacements connus", "Familiarité avec le sac", "Coordination ressentie"];
    return '<div class="card"><p class="small muted">Chaque élément est facultatif. Aucun essai maximal n\'est demandé. Mesure, observation, estimation et avis du coach restent distingués.</p>' +
      p.assessment.map(function (a, i) {
        return '<div class="row card" style="background:var(--surface-2)"><div class="grow"><div class="row"><strong>' + h(a.label) + '</strong><span class="tag">' + L.source[a.source] + "</span></div><div>" + h(a.value) + '</div></div><button class="btn danger small" data-act="delAssessment" data-t="' + t + '" data-i="' + i + '">✕</button></div>';
      }).join("") +
      '<div class="chip-row">' + sug.map(function (s) { return '<button class="chip" data-act="aSuggest" data-v="' + h(s) + '">' + h(s) + "</button>"; }).join("") + "</div>" +
      '<label class="field">Élément<input type="text" data-bind="aform.label" value="' + h(ui.aform.label) + '"></label>' +
      '<label class="field">Valeur ou observation<input type="text" data-bind="aform.value" value="' + h(ui.aform.value) + '"></label>' +
      '<label class="field">Origine' + select("aform.source", Object.keys(L.source).map(function (k) { return [k, L.source[k]]; }), ui.aform.source) + "</label>" +
      btn("Ajouter au bilan", "addAssessment", { t: t }, "secondary") + "</div>";
  }

  // =====================================================================
  // Proposition de programme
  // =====================================================================
  function isoDate(t) { var d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function proposalBody(isRoot) {
    var c0 = E.activeCycle(db);
    if (!ui.prop) ui.prop = { start: isoDate(now()), weeks: 4, base: c0 ? c0.revision : null };
    var parts = ui.prop.start.split("-");
    var start = new Date(+parts[0], +parts[1] - 1, +parts[2]).getTime();
    var pr = E.propose(db.profile, db, start, ui.prop.weeks, space());
    var c = pr.cycle, tpl = E.strengthTemplate(c.strengthTemplateID), mt = E.martialTemplate(c.martialLevel);
    return (isRoot ? "<h1>Ta proposition</h1>" : "") +
      '<div class="card"><div class="row"><label class="field grow">Début<input type="date" value="' + ui.prop.start + '" min="' + isoDate(now()) + '" data-bind="prop.start" data-rerender></label>' +
      '<label class="field grow">Durée' + select("prop.weeks", [3, 4, 5, 6, 8].map(function (w) { return [w, w + " semaines"]; }), ui.prop.weeks, "int", true) + "</label></div>" +
      (tpl ? '<div class="row between"><span class="muted">Musculation</span><span>' + h(tpl.name) + "</span></div>" : "") +
      '<div class="row between"><span class="muted">Niveau martial</span><span>' + L.level[c.martialLevel] + "</span></div></div>" +
      '<div class="section-title">Semaine type</div><div class="list">' + (c.plan.length ? c.plan.map(function (ps) {
        var title = ps.discipline === "strength" ? ((tpl && (tpl.blueprints.find(function (b) { return b.key === ps.blueprintKey; }) || {}).title) || "Musculation")
          : ps.discipline === "muayThai" ? "Muay thaï guidé · " + mt.rounds + " rounds max" : L.discipline[ps.discipline];
        var hh = String(Math.floor(ps.slot.startMinutes / 60)).padStart(2, "0") + "h" + String(ps.slot.startMinutes % 60).padStart(2, "0");
        return '<div class="item"><span class="icon">' + L.disciplineIcon[ps.discipline] + '</span><div class="grow"><strong>' + L.weekday[ps.slot.weekday] + " · " + hh + '</strong><div class="small muted">' + h(title) + '</div></div><span class="small">' + ps.minutes + " min</span></div>";
      }).join("") : '<div class="item muted">Aucun créneau : ajoute des disponibilités dans ton profil.</div>') + "</div>" +
      '<div class="card"><h3>Logique retenue</h3>' + c.rationale.map(function (r) { return "<p class=\"small\">" + h(r) + "</p>"; }).join("") +
      pr.warnings.map(function (w) { return '<p class="warn">' + h(w) + "</p>"; }).join("") + "</div>" +
      '<button class="btn" data-act="activate"' + (c.plan.length ? "" : " disabled") + ">Activer ce programme</button>" +
      '<p class="tiny muted center">Règles ' + c.rulesVersion + " · catalogue " + c.catalogVersion + ". Tu pourras raccourcir une séance, changer de matériel ou désactiver un mouvement à tout moment.</p>" +
      (isRoot ? btn("Modifier mon profil", "open", { type: "profileEdit" }, "secondary") : "");
  }

  // =====================================================================
  // Aujourd'hui
  // =====================================================================
  function nextSession(d) {
    var start = E.startOfDay(now());
    var list = db.sessions.filter(function (s) { return s.discipline === d && (s.status === "inProgress" || (s.status === "planned" && s.plannedDate >= start)); })
      .sort(function (a, b) { return (b.status === "inProgress") - (a.status === "inProgress") || a.plannedDate - b.plannedDate; });
    return list[0] || null;
  }
  function isStandalone() { return window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches; }

  function todayView() {
    var sp = space(), s = nextSession(disc()), name = db.profile.displayName;
    var t = E.tierFor(sp, db), set = settings();
    var motto = sp === "baki" ? "Ton dernier effort compte. Aujourd'hui, la technique avant la charge." : "Le déplacement précède la puissance. Travaille proprement, puis accélère.";
    var out = "<div><h1>" + h(name ? name : cap(E.dayLabel(now()))) + "</h1>" + (name ? '<p class="muted">' + cap(E.dayLabel(now())) + "</p>" : "") +
      (set.tone !== "minimal" ? '<p class="muted small">' + motto + "</p>" : "") + "</div>";
    if (!isStandalone()) out += '<div class="card soft"><strong>Installe l\'app sur ton écran d\'accueil</strong><p class="small">Dans Safari : touche <b>Partager</b> ⬆︎ puis <b>Sur l\'écran d\'accueil</b>. L\'app s\'ouvrira en plein écran et fonctionnera hors connexion.</p></div>';
    if (s) out += sessionCard(s);
    else out += '<div class="card"><h3>Aucune séance prévue</h3><p class="small muted">Repos ou programme terminé. Un repos prévu fait partie de la progression.</p>' + btn("Nouvelle proposition de programme", "open", { type: "proposal" }, "secondary") + "</div>";
    var others = E.sessionsOn(db, now()).filter(function (x) { return x.discipline !== disc(); });
    if (others.length) out += '<div class="card"><h3>Aussi aujourd\'hui</h3>' + others.map(function (x) {
      return '<button class="row" style="background:none;border:0;padding:4px 0;text-align:left" data-act="open" data-type="session" data-id="' + x.id + '"><span>' + L.disciplineIcon[x.discipline] + '</span><span class="grow">' + E.timeLabel(x.plannedDate) + " · " + h(x.title) + "</span>" + badge(x.status) + "</button>";
    }).join("") + "</div>";
    out += tierCard(t);
    out += '<div class="btns">' + btn("✎ Saisir une séance", "open", { type: "log" }, "secondary") + btn("💬 Coach", "open", { type: "coach" }, "secondary") + "</div>";
    var pl = db.playlists.filter(function (p) { return p.app === sp; })[0] || db.playlists[0];
    out += '<div class="card"><h3>Ta semaine</h3>' + E.weekly(db, now()).map(function (l) { return '<p class="small">' + h(l) + "</p>"; }).join("") +
      (pl ? '<a class="btn secondary" href="' + h(pl.url) + '" target="_blank" rel="noopener">♫ ' + h(pl.name) + "</a>" : "") + "</div>";
    return out;
  }

  function sessionCard(s) {
    var head = '<div class="row"><span class="icon">' + L.disciplineIcon[s.discipline] + '</span><div class="grow"><h3>' + h(s.title) + '</h3><div class="small muted">' +
      (E.sameDay(s.plannedDate, now()) ? "Aujourd'hui" : cap(E.dayLabel(s.plannedDate))) + " · " + E.timeLabel(s.plannedDate) + " · " + s.plannedMinutes + " min</div></div>" + badge(s.status) + "</div>";
    var note = s.adaptationNote ? '<div class="note">↻ ' + h(s.adaptationNote) + "</div>" : "";
    var detail = "";
    if (s.discipline === "strength") detail = s.plannedExercises.filter(function (x) { return !x.isSuspended; }).slice(0, 6).map(function (pe) {
      return '<div class="row between small"><span>' + h(E.exName(pe.exerciseID)) + '</span><span class="mono muted">' + pe.sets + " × " + reps(pe) + "</span></div>";
    }).join("");
    else if (s.discipline === "muayThai") detail = '<p class="small">' + s.plannedRounds + " rounds de " + E.dur(s.roundSeconds) + " · repos " + E.dur(s.restSeconds) + "</p>" +
      s.skillIDs.map(E.skill).filter(Boolean).map(function (k) { return '<p class="small">◎ ' + h(k.name) + "</p>"; }).join("");
    var actions = s.status === "inProgress" ? btn("Reprendre la séance", "start", { id: s.id })
      : btn("Point du jour et commencer", "checkin", { id: s.id }) + '<div class="btns">' + btn("Commencer sans point", "start", { id: s.id }, "secondary") + btn("Reporter", "postpone", { id: s.id }, "secondary") + "</div>";
    return '<div class="card">' + head + note + detail + actions + "</div>";
  }
  function reps(pe) { return pe.repMin === pe.repMax ? pe.repMin : pe.repMin + "–" + pe.repMax; }
  function tierCard(t) {
    return '<div class="card"><div class="row between"><strong>Palier : ' + t.name + '</strong><span class="small muted">' + (t.index + 1) + "/" + t.names.length + "</span></div>" +
      '<div class="progress" role="progressbar" aria-valuenow="' + Math.round(t.progress * 100) + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + Math.round(t.progress * 100) + '%"></i></div>' +
      '<p class="tiny muted">' + (t.next == null ? "Palier interne le plus élevé atteint. Ni grade ni titre officiel." : "La régularité prévue et les étapes validées font progresser. Aucun bonus pour dépasser le volume prescrit.") + "</p></div>";
  }

  // =====================================================================
  // Programme (Baki)
  // =====================================================================
  function programView() {
    var c = E.activeCycle(db), start = E.startOfDay(now()), tpl = E.strengthTemplate(c.strengthTemplateID);
    var up = db.sessions.filter(function (s) { return s.discipline === "strength" && E.isOpen(s) && s.plannedDate >= start; }).sort(function (a, b) { return a.plannedDate - b.plannedDate; });
    return "<h1>Programme</h1>" +
      '<div class="card"><div class="row between"><span class="muted">Cycle</span><span>Révision ' + c.revision + "</span></div>" +
      '<div class="row between"><span class="muted">Période</span><span class="small">' + new Date(c.startDate).toLocaleDateString("fr-FR") + " → " + new Date(E.cycleEnd(c)).toLocaleDateString("fr-FR") + "</span></div>" +
      (tpl ? '<div class="row between"><span class="muted">Modèle</span><span>' + h(tpl.name) + "</span></div>" : "") +
      "<details><summary class=\"small\">Logique retenue</summary>" + c.rationale.map(function (r) { return '<p class="small">' + h(r) + "</p>"; }).join("") + "</details></div>" +
      '<div class="section-title">Prochaines séances</div><div class="list">' + (up.length ? up.map(function (s) {
        return '<button class="item" data-act="open" data-type="planned" data-id="' + s.id + '"><div class="grow"><strong>' + h(s.title) + '</strong><div class="small muted">' + cap(E.dayLabel(s.plannedDate)) + " · " +
          s.plannedExercises.filter(function (x) { return !x.isSuspended; }).length + " exercices · ~" + E.estimatedMinutes(s.plannedExercises) + " min" + (s.adaptationNote ? " · ↻ adaptée" : "") + '</div></div><span class="chev">›</span></button>';
      }).join("") : '<div class="item muted">Aucune séance de musculation prévue.</div>') + "</div>" +
      '<div class="section-title">Bibliothèque (' + D.exercises.length + " fiches)</div>" +
      '<div class="row">' + select("libFamily", [["", "Toutes les familles"]].concat(Object.keys(L.family).map(function (k) { return [k, L.family[k]]; })), ui.libFamily, "str", true) + "</div>" +
      '<input type="text" placeholder="Rechercher un exercice" value="' + h(ui.libSearch) + '" data-search="lib">' +
      '<div class="list" id="lib-list">' + libList() + "</div>" +
      '<p class="tiny muted">Catalogue ' + D.version + " — contenus à valider par un coach qualifié avant diffusion.</p>";
  }
  function libList() {
    var f = new E.Filter(db.profile, db), q = ui.libSearch.toLowerCase();
    return D.exercises.filter(function (e) { return (!ui.libFamily || e.family === ui.libFamily) && (!q || e.name.toLowerCase().indexOf(q) >= 0); }).map(function (e) {
      var why = f.blockingReason(e);
      return '<button class="item" data-act="open" data-type="exercise" data-id="' + e.id + '"><div class="grow"><div>' + h(e.name) + '</div><div class="small muted">' + L.family[e.family] + " · " + L.level[e.level] + "</div></div>" + (why ? '<span class="tiny muted" style="max-width:110px;text-align:right">' + h(why) + "</span>" : "") + '<span class="chev">›</span></button>';
    }).join("") || '<div class="item muted">Aucun résultat.</div>';
  }

  // =====================================================================
  // Parcours (Al-ghūl)
  // =====================================================================
  function parcoursView() {
    var f = new E.Filter(db.profile, db);
    var out = "<h1>Parcours</h1>" + seg("skillLevel", [[0, "Tous"], [1, "Débutant"], [2, "Interm."], [3, "Confirmé"]], ui.skillLevel) +
      '<p class="tiny muted">Muay thaï et préparation physique. Les contenus avec partenaire ou sparring ne sont jamais prescrits seul.</p>';
    Object.keys(L.domain).forEach(function (d) {
      var list = D.skills.filter(function (s) { return s.domain === d && (!ui.skillLevel || s.level === ui.skillLevel); });
      if (!list.length) return;
      out += '<div class="section-title">' + L.domain[d] + '</div><div class="list">' + list.map(function (s) {
        var p = db.skills[s.id] || { state: 0 }, icon = ["◌", "📖", "🥊", p.validatedBy === "coach" ? "🏅" : "✅"][p.state];
        return '<button class="item" data-act="open" data-type="skill" data-id="' + s.id + '"><span class="icon">' + icon + '</span><div class="grow"><div>' + h(s.name) + '</div><div class="small muted">' + L.skillState[p.state] + " · " + L.level[s.level] + (s.context !== "solo" ? " · " + L.context[s.context] : "") + "</div></div>" + (f.prerequisitesMet(s) ? "" : '<span aria-label="Prérequis non atteints">🔒</span>') + '<span class="chev">›</span></button>';
      }).join("") + "</div>";
    });
    return out;
  }

  // =====================================================================
  // Progression
  // =====================================================================
  function weeksBack(n) { var ws = E.startOfWeek(now()), out = []; for (var i = n - 1; i >= 0; i--) out.push(E.addDays(ws, -7 * i)); return out; }
  function barChart(series, labels, colors) {
    var W = 320, H = 150, pad = 22, max = 1;
    series.forEach(function (s) { s.forEach(function (v) { max = Math.max(max, v); }); });
    var n = labels.length, gw = (W - pad) / n, bw = Math.max(4, (gw - 6) / series.length);
    var bars = "";
    labels.forEach(function (lab, i) {
      series.forEach(function (s, j) {
        var hgt = (s[i] / max) * (H - 30), x = pad + i * gw + 3 + j * bw;
        bars += '<rect x="' + x.toFixed(1) + '" y="' + (H - 18 - hgt).toFixed(1) + '" width="' + (bw - 2).toFixed(1) + '" height="' + hgt.toFixed(1) + '" rx="3" fill="' + colors[j] + '"/>';
      });
      bars += '<text x="' + (pad + i * gw + gw / 2).toFixed(1) + '" y="' + (H - 4) + '" text-anchor="middle">' + lab + "</text>";
    });
    bars += '<text x="2" y="12">' + max + "</text>";
    return '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" width="100%" role="img">' + bars + "</svg>";
  }
  function lineChart(points) {
    if (points.length < 2) return '<p class="small muted">Il faut au moins deux séances pour tracer une courbe.</p>';
    var W = 320, H = 160, pad = 26;
    var ys = points.map(function (p) { return p.y; }), min = Math.min.apply(null, ys), max = Math.max.apply(null, ys);
    if (max === min) { max += 1; min = Math.max(0, min - 1); }
    var pts = points.map(function (p, i) { return [pad + i * (W - pad - 8) / (points.length - 1), 10 + (1 - (p.y - min) / (max - min)) * (H - 34)]; });
    return '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" width="100%" role="img"><polyline fill="none" stroke="var(--accent)" stroke-width="2.5" points="' + pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + '"/>' +
      pts.map(function (p) { return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.5" fill="var(--accent)"/>'; }).join("") +
      '<text x="2" y="14">' + E.fmtNum(max) + '</text><text x="2" y="' + (H - 20) + '">' + E.fmtNum(min) + "</text></svg>";
  }

  function progressView() {
    return space() === "baki" ? bakiProgress() : alghulProgress();
  }
  function bakiProgress() {
    var weeks = weeksBack(8), planned = [], done = [];
    weeks.forEach(function (ws) {
      var inW = db.sessions.filter(function (s) { return s.discipline === "strength" && s.plannedDate >= ws && s.plannedDate < E.addDays(ws, 7); });
      planned.push(inW.filter(function (s) { return s.isMandatory && s.status !== "skipped"; }).length);
      done.push(inW.filter(E.isDone).length);
    });
    var labels = weeks.map(function (w) { return new Date(w).getDate() + "/" + (new Date(w).getMonth() + 1); });
    var ids = {}; db.sessions.forEach(function (s) { s.sets.forEach(function (x) { if (!x.isWarmup) ids[x.exerciseID] = 1; }); });
    var trained = Object.keys(ids).sort(function (a, b) { return E.exName(a).localeCompare(E.exName(b)); });
    var out = "<h1>Progression</h1>" + tierCard(E.tierFor("baki", db)) +
      '<div class="card"><h3>Régularité — 8 semaines</h3>' + barChart([planned, done], labels, ["color-mix(in srgb, var(--metal) 45%, transparent)", "var(--accent)"]) +
      '<p class="tiny muted">Barre claire : séances prévues. Barre pleine : séances réalisées.</p></div><div class="card"><h3>Par exercice</h3>';
    if (!trained.length) out += '<p class="small muted">Ton historique apparaîtra après ta première séance.</p>';
    else {
      if (!ui.progEx || trained.indexOf(ui.progEx) < 0) ui.progEx = trained[0];
      var hist = E.history(db, ui.progEx).map(function (hh) {
        var w = hh.sets.filter(function (x) { return !x.isWarmup; });
        return { date: hh.session.startedAt || hh.session.plannedDate, y: Math.max.apply(null, w.map(function (x) { return x.loadKg || 0; }).concat([0])), vol: w.reduce(function (a, x) { return a + (x.loadKg || 0) * x.reps; }, 0) };
      });
      var best = E.bestSet(db, ui.progEx);
      out += select("progEx", trained.map(function (id) { return [id, E.exName(id)]; }), ui.progEx, "str", true) + lineChart(hist) +
        (best ? '<p class="small">Record enregistré dans l\'app : ' + (best.loadKg != null ? E.fmtNum(best.loadKg) + " kg × " : "") + best.reps + "</p>" : "") +
        hist.slice().reverse().map(function (p) { return '<div class="row between small"><span>' + new Date(p.date).toLocaleDateString("fr-FR") + '</span><span class="mono">max ' + E.fmtNum(p.y) + " kg · volume " + Math.round(p.vol) + " kg</span></div>"; }).join("");
    }
    return out + "</div>" + '<div class="card"><h3>Comprendre les indicateurs</h3><p class="small">Volume = charge × répétitions des séries de travail, sur un mouvement identique. Les variantes ne sont jamais mélangées. Un record est un record saisi dans l\'app, pas une mesure de force absolue.</p><p class="tiny muted">' + E.LOAD_FORMULA + "</p></div>";
  }
  function alghulProgress() {
    var counts = [1, 2, 3].map(function (st) { return Object.keys(db.skills).filter(function (k) { return db.skills[k].state === st; }).length; });
    var coach = Object.keys(db.skills).filter(function (k) { return db.skills[k].validatedBy === "coach"; }).length;
    var weeks = weeksBack(8), rounds = [], loadNow = 0;
    weeks.forEach(function (ws, i) {
      var d = db.sessions.filter(function (s) { return E.isCombat(s.discipline) && E.isDone(s) && s.plannedDate >= ws && s.plannedDate < E.addDays(ws, 7); });
      rounds.push(d.reduce(function (a, s) { return a + E.completedRounds(s); }, 0));
      if (i === weeks.length - 1) loadNow = d.reduce(function (a, s) { return a + (E.sessionLoad(s) || 0); }, 0);
    });
    var labels = weeks.map(function (w) { return new Date(w).getDate() + "/" + (new Date(w).getMonth() + 1); });
    var react = db.profile.assessment.filter(function (a) { return a.key === "reaction_test"; }).sort(function (a, b) { return b.date - a.date; }).slice(0, 5);
    var log = db.sessions.filter(function (s) { return E.isCombat(s.discipline) && E.isDone(s); }).sort(function (a, b) { return b.plannedDate - a.plannedDate; }).slice(0, 10);
    return "<h1>Progression</h1>" + tierCard(E.tierFor("alghul", db)) +
      '<div class="card"><h3>Compétences</h3><div class="row">' + [1, 2, 3].map(function (st, i) {
        return '<div class="grow center"><div style="font-size:28px;font-weight:800">' + counts[i] + '</div><div class="tiny muted">' + L.skillState[st] + "</div></div>";
      }).join("") + '</div><p class="tiny muted">Dont ' + coach + " validée(s) par le coach. Autoévaluation et validation du coach restent distinguées.</p></div>" +
      '<div class="card"><h3>Rounds effectués par semaine</h3>' + barChart([rounds], labels, ["var(--accent)"]) + '<p class="small">Charge de séance cette semaine : ' + loadNow + '</p><p class="tiny muted">' + E.LOAD_FORMULA + "</p></div>" +
      '<div class="card"><h3>Test de réactivité sur écran</h3><p class="small muted">Indicateur de réponse à un signal dans l\'app, pas une mesure de réflexes en combat. Compare uniquement des essais faits dans les mêmes conditions.</p>' +
      react.map(function (r) { return '<div class="row between small"><span>' + new Date(r.date).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) + '</span><span class="mono">' + h(r.value) + "</span></div>"; }).join("") +
      btn("Faire le test", "open", { type: "reaction" }, "secondary") + "</div>" +
      '<div class="card"><h3>Journal des séances de combat</h3>' + (log.length ? log.map(function (s) {
        return '<div><div class="row between"><strong class="small">' + h(s.title) + "</strong>" + badge(s.status) + '</div><div class="tiny muted">' + new Date(s.plannedDate).toLocaleDateString("fr-FR") + " · " + (s.actualMinutes || s.plannedMinutes) + " min" +
          (s.discipline === "muayThai" ? " · " + E.completedRounds(s) + "/" + s.plannedRounds + " rounds" : "") + (s.rpe != null ? " · RPE " + s.rpe : "") + "</div>" + (s.toWork ? '<div class="tiny">À travailler : ' + h(s.toWork) + "</div>" : "") + "</div>";
      }).join('<div class="divider"></div>') : '<p class="small muted">Aucune séance réalisée pour l\'instant.</p>') + "</div>";
  }

  // =====================================================================
  // Profil et données
  // =====================================================================
  function profileView() {
    var p = db.profile, s = settings();
    return "<h1>Profil</h1>" +
      '<div class="list"><button class="item" data-act="open" data-type="profileEdit"><div class="grow"><strong>' + h(p.displayName || "Mon profil sportif") + '</strong><div class="small muted">' + p.goals.map(function (g) { return L.goal[g]; }).join(" › ") + '</div></div><span class="chev">›</span></button>' +
      '<button class="item" data-act="open" data-type="proposal"><span class="grow">Nouvelle proposition de programme</span><span class="chev">›</span></button>' +
      '<button class="item" data-act="open" data-type="adaptations"><span class="grow">Journal des adaptations</span><span class="chev">›</span></button>' +
      '<button class="item" data-act="open" data-type="playlists"><span class="grow">Playlists YouTube</span><span class="chev">›</span></button></div>' +
      '<div class="section-title">Réglages</div><div class="card">' +
      '<label class="field">Thème' + seg("setTheme", [["dark", "Sombre"], ["light", "Clair"], ["system", "Système"]], s.theme) + "</label>" +
      '<label class="field">Ton du coach' + select("form.tone", Object.keys(L.tone).map(function (k) { return [k, L.tone[k]]; }), s.tone) + "</label>" +
      toggleAct("Consignes vocales", "setting", { k: "voiceCues" }, s.voiceCues) +
      toggleAct("Signaux sonores", "setting", { k: "sounds" }, s.sounds) +
      toggleAct("Garder l'écran allumé pendant les séances", "setting", { k: "keepAwake" }, s.keepAwake) +
      '<p class="tiny muted">Changer de thème ou de ton ne modifie aucune donnée.</p></div>' +
      '<div class="section-title">Données et confidentialité</div><div class="card">' +
      '<div class="row between small"><span class="muted">Stockage</span><span>Sur cet iPhone uniquement</span></div>' +
      '<div class="row between small"><span class="muted">Révision des données</span><span>' + db.revision + "</span></div>" +
      '<div class="row between small"><span class="muted">Dernier export</span><span>' + (db.lastExport ? new Date(db.lastExport).toLocaleDateString("fr-FR") : "jamais") + "</span></div>" +
      btn("Exporter une archive chiffrée", "open", { type: "export" }, "secondary") +
      '<label class="btn secondary">Importer / restaurer une archive<input type="file" hidden data-change="importFile"></label>' +
      btn("Supprimer toutes mes données", "resetAll", {}, "danger") +
      '<p class="tiny muted">Aucun compte, aucun serveur, aucune publicité. Les données restent dans Safari sur cet iPhone : exporte régulièrement une archive, surtout avant de changer de téléphone ou d\'effacer les données de Safari.</p></div>' +
      '<div class="card"><h3>À propos</h3><p class="small">Catalogue ' + D.version + " · règles " + E.RULES + '</p><p class="tiny muted">Outil d\'entraînement sportif : pas de diagnostic médical, pas de promesse de physique fictif, pas de score de puissance présenté comme une mesure scientifique. Contenus à faire valider par un coach qualifié.</p></div>';
  }

  // =====================================================================
  // Feuilles (sheets)
  // =====================================================================
  function head(title, back) {
    return '<div class="sheet-head"><button class="btn ghost" data-act="closeSheet">' + (back ? "‹ Retour" : "Fermer") + "</button><h3 class=\"grow center\">" + h(title) + '</h3><span style="width:70px"></span></div>';
  }
  function sheetView(sh) {
    var fn = SHEETS[sh.type];
    var back = ui.sheets.length > 1;
    var r = fn ? fn(sh) : { title: "", body: "" };
    return head(r.title, back) + '<div class="sheet-body">' + r.body + "</div>";
  }

  var SHEETS = {
    calendar: function () {
      var today = E.startOfDay(now()), days = [];
      for (var i = 0; i < 21; i++) days.push(ui.calPast ? E.addDays(today, -(i + 1)) : E.addDays(today, i));
      return { title: "Calendrier commun", body: seg("calPast", [["0", "À venir"], ["1", "Historique"]], ui.calPast ? "1" : "0") + days.map(function (d) {
        var ss = E.sessionsOn(db, d);
        return '<div class="section-title">' + cap(E.dayLabel(d)) + '</div><div class="list">' + (ss.length ? ss.map(function (s) {
          return '<button class="item" data-act="open" data-type="session" data-id="' + s.id + '"><span>' + L.disciplineIcon[s.discipline] + '</span><div class="grow"><div class="small"><strong>' + h(s.title) + '</strong></div><div class="tiny muted">' + E.timeLabel(s.plannedDate) + " · " + (s.actualMinutes || s.plannedMinutes) + " min" + (s.isLockedByUser ? " · 🔒" : "") + "</div></div>" + badge(s.status) + "</button>";
        }).join("") : '<div class="item muted small">🛌 Repos</div>') + "</div>";
      }).join("") };
    },
    session: function (sh) {
      var s = E.findSession(db, sh.id);
      if (!s) return { title: "Séance", body: "<p>Séance introuvable.</p>" };
      var b = '<div class="card">' + [["Discipline", L.discipline[s.discipline]], ["Date", cap(E.dayLabel(s.plannedDate)) + " · " + E.timeLabel(s.plannedDate)], ["Statut", L.status[s.status]], ["Durée prévue", s.plannedMinutes + " min"]]
        .concat(s.actualMinutes != null ? [["Durée réelle", s.actualMinutes + " min"]] : []).concat(s.rpe != null ? [["Effort perçu", s.rpe + "/10"]] : []).concat(E.sessionLoad(s) != null ? [["Charge de séance", E.sessionLoad(s)]] : [])
        .map(function (r) { return '<div class="row between small"><span class="muted">' + r[0] + "</span><span>" + h(r[1]) + "</span></div>"; }).join("") + "</div>";
      if (s.adaptationNote) b += '<div class="note">↻ ' + h(s.adaptationNote) + "</div>";
      if (s.discipline === "strength" && s.plannedExercises.length) b += '<div class="card"><h3>Exercices</h3>' + s.plannedExercises.map(function (pe) {
        var n = s.sets.filter(function (x) { return x.plannedExerciseID === pe.id && !x.isWarmup; }).length;
        return '<div class="small"><span class="' + (pe.isSuspended ? "strike" : "") + '">' + h(E.exName(pe.exerciseID)) + '</span> <span class="muted">— prévu ' + pe.sets + " × " + reps(pe) + " · réalisé " + n + "</span></div>";
      }).join("") + "</div>";
      if (s.discipline === "muayThai") b += '<div class="card"><div class="row between small"><span class="muted">Rounds prévus</span><span>' + s.plannedRounds + '</span></div><div class="row between small"><span class="muted">Rounds effectués</span><span>' + E.completedRounds(s) + "</span></div></div>";
      if (s.notes) b += '<div class="card small">' + h(s.notes) + "</div>";
      if (E.isOpen(s)) {
        b += '<div class="card">' + toggleAct("Verrouiller (le moteur demandera avant de modifier)", "lock", { id: s.id }, s.isLockedByUser) + "</div>";
        if (s.discipline === disc() || (s.discipline === "strength" || s.discipline === "muayThai")) b += btn("Commencer", "start", { id: s.id });
        if (["swimming", "club", "mobility"].indexOf(s.discipline) >= 0) b += btn("Marquer comme réalisée", "open", { type: "feedback", id: s.id, partial: "0" });
        b += btn("Reporter", "postpone", { id: s.id }, "secondary") + btn("Annuler cette séance", "cancelSession", { id: s.id }, "danger");
      }
      return { title: s.title, body: b };
    },
    checkin: function (sh) {
      var f = sh.f, s = E.findSession(db, sh.id);
      if (f.proposal) return { title: "Adaptation automatique", body: proposalHTML(f.proposal, sh) };
      var b = '<div class="card"><h3>Comment te sens-tu ?</h3><p class="small">Fatigue</p>' + rating("ciFatigue", [1, 5], f.fatigue, "Frais", "Épuisé") +
        toggle("Renseigner mon sommeil", "sheetF.sleepOn", f.sleepOn, " data-rerender") +
        (f.sleepOn ? '<div class="stepper">' + '<button data-act="ciSleep" data-v="-0.5">−</button><span class="val">' + E.fmtNum(f.sleep) + ' h</span><button data-act="ciSleep" data-v="0.5">+</button></div>' : "") +
        toggle("Moins de temps que prévu", "sheetF.minOn", f.minOn, " data-rerender") +
        (f.minOn ? '<div class="stepper"><button data-act="ciMin" data-v="-5">−</button><span class="val">' + f.minutes + ' min</span><button data-act="ciMin" data-v="5">+</button></div>' : "") +
        '<p class="tiny muted">Tout est facultatif. Une information non renseignée reste inconnue.</p></div>' +
        '<div class="card"><h3>Gêne éventuelle</h3><textarea data-bind="sheetF.discomfort" placeholder="Décris une gêne (facultatif)">' + h(f.discomfort) + "</textarea>" +
        (s && s.discipline === "strength" ? '<p class="small muted">Sur quels mouvements ?</p>' + s.plannedExercises.map(function (pe) {
          return '<label class="check"><input type="checkbox" data-change="ciEx" data-v="' + pe.exerciseID + '"' + (f.ids.indexOf(pe.exerciseID) >= 0 ? " checked" : "") + ">" + h(E.exName(pe.exerciseID)) + "</label>";
        }).join("") : "") + "</div>" + btn("Voir l'adaptation automatique", "ciEval");
      return { title: "Point du jour", body: b };
    },
    feedback: function (sh) {
      var f = sh.f;
      return { title: "Retour de séance", body: '<div class="card"><h3>' + (f.partial ? "Séance arrêtée — enregistrée comme partielle" : "Comment s'est passée la séance ?") + "</h3>" +
        '<p class="small">Durée réellement effectuée</p><div class="stepper"><button data-act="fbMin" data-v="-5">−</button><span class="val">' + f.minutes + ' min</span><button data-act="fbMin" data-v="5">+</button></div>' +
        '<p class="small">Effort perçu (RPE)</p>' + rating("fbRpe", [1, 10], f.rpe, "Très facile", "Maximal") +
        '<p class="small">Fatigue</p>' + rating("fbFatigue", [1, 5], f.fatigue, "Frais", "Épuisé") +
        '<p class="small">Intensité</p>' + chips("fbInt", [["", "—"], ["light", "Légère"], ["moderate", "Modérée"], ["hard", "Difficile"]], f.intensity || "") +
        '<p class="tiny muted">RPE : effort perçu de 1 à 10. Il sert à la charge de séance (durée × RPE), un repère d\'entraînement, pas une mesure médicale.</p></div>' +
        '<div class="card"><textarea data-bind="sheetF.discomfort" placeholder="Gêne éventuelle">' + h(f.discomfort) + '</textarea><textarea data-bind="sheetF.toWork" placeholder="Points à travailler">' + h(f.toWork) + '</textarea><textarea data-bind="sheetF.notes" placeholder="Remarques">' + h(f.notes) + "</textarea>" +
        '<p class="tiny muted">' + E.DISCOMFORT + "</p></div>" + btn("Enregistrer", "fbSave") };
    },
    log: function (sh) {
      var f = sh.f;
      return { title: "Saisir une séance", body: '<div class="card"><label class="field">Discipline' + select("sheetF.discipline", ["club", "muayThai", "swimming", "strength", "mobility"].map(function (k) { return [k, L.discipline[k]]; }), f.discipline) + "</label>" +
        '<label class="field">Date et heure<input type="datetime-local" data-bind="sheetF.date" value="' + h(f.date) + '"></label>' +
        '<p class="small">Durée</p><div class="stepper"><button data-act="logMin" data-v="-5">−</button><span class="val">' + f.minutes + ' min</span><button data-act="logMin" data-v="5">+</button></div>' +
        '<p class="small">Effort perçu (RPE)</p>' + rating("logRpe", [1, 10], f.rpe, "Très facile", "Maximal") +
        '<p class="small">Intensité</p>' + chips("logInt", [["", "—"], ["light", "Légère"], ["moderate", "Modérée"], ["hard", "Difficile"]], f.intensity || "") +
        '<textarea data-bind="sheetF.notes" placeholder="Notes (sparring encadré, thème du cours…)">' + h(f.notes) + "</textarea>" +
        '<p class="tiny muted">Cette séance entre dans le calendrier commun. Une séance difficile est prise en compte par Baki avant ta prochaine séance de force.</p></div>' + btn("Enregistrer", "logSave") };
    },
    coach: function () {
      var s = nextSession(disc());
      var lines = (s ? E.explain(s, settings().tone) : []).concat([""]).concat(E.weekly(db, now()));
      return { title: "Coach", body: '<div class="card"><h3>⚙︎ Adaptation automatique</h3>' + lines.map(function (l) { return l ? '<p class="small">' + h(l) + "</p>" : '<div class="divider"></div>'; }).join("") +
        '<p class="tiny muted">Produit par le moteur de règles, sans IA ni connexion.</p></div><div class="card"><h3>Indicateurs</h3><p class="small">' + E.LOAD_FORMULA + "</p></div>" +
        '<div class="card"><h3>Coach conversationnel</h3><p class="small muted">Prévu dans la version native (modèle local sur l\'iPhone). Indisponible dans la version web, sans conséquence sur ton programme ni ton journal.</p></div>' };
    },
    planned: function (sh) {
      var s = E.findSession(db, sh.id);
      if (!s) return { title: "Séance", body: "" };
      return { title: s.title, body: (s.adaptationNote ? '<div class="note">↻ ' + h(s.adaptationNote) + "</div>" : "") +
        '<div class="card"><h3>Échauffement</h3>' + D.strengthWarmup.map(function (x) { return '<p class="small">• ' + h(x) + "</p>"; }).join("") + "</div>" +
        s.plannedExercises.map(function (pe) {
          return '<div class="card"><div class="row between"><strong class="' + (pe.isSuspended ? "strike" : "") + '">' + h(E.exName(pe.exerciseID)) + '</strong><span class="mono">' + pe.sets + " × " + reps(pe) + "</span></div>" +
            '<div class="tiny muted">Repos ' + E.dur(pe.restSeconds) + (pe.targetRIR != null ? " · " + pe.targetRIR + " répétition(s) en réserve" : "") + "</div>" +
            (pe.suggestedLoadKg != null ? '<div class="small">Suggestion : ' + E.fmtNum(pe.suggestedLoadKg) + " kg</div>" : "") +
            (pe.progressionNote ? '<div class="tiny muted">' + h(pe.progressionNote) + "</div>" : "") +
            (pe.substitutedFrom ? '<div class="tiny">Remplace ' + h(E.exName(pe.substitutedFrom)) + (pe.substitutionReason ? " — " + h(pe.substitutionReason) : "") + "</div>" : "") +
            (E.isOpen(s) && !pe.isSuspended ? '<div class="btns">' + btn("Remplacer", "open", { type: "substitute", sid: s.id, pid: pe.id }, "secondary small") + btn("Fiche", "open", { type: "exercise", id: pe.exerciseID }, "secondary small") + "</div>" : "") + "</div>";
        }).join("") + '<div class="card"><h3>Fin de séance</h3>' + D.strengthCooldown.map(function (x) { return '<p class="small">• ' + h(x) + "</p>"; }).join("") + "</div>" };
    },
    substitute: function (sh) {
      var s = E.findSession(db, sh.sid), pe = s && s.plannedExercises.find(function (x) { return x.id === sh.pid; });
      if (!pe) return { title: "Remplacer", body: "" };
      var opts = new E.Filter(db.profile, db).substitutes(pe.exerciseID);
      if (!sh.reason) sh.reason = "Matériel occupé";
      return { title: "Remplacer " + E.exName(pe.exerciseID), body: '<p class="small muted">Motif</p>' + chips("subReason", ["Matériel occupé", "Matériel indisponible", "Préférence", "Gêne sur ce mouvement", "Manque de temps"].map(function (r) { return [r, r]; }), sh.reason) +
        '<div class="section-title">Alternatives compatibles</div><div class="list">' + (opts.length ? opts.map(function (e) {
          return '<button class="item" data-act="subApply" data-id="' + e.id + '"><div class="grow"><div>' + h(e.name) + '</div><div class="small muted">' + L.family[e.family] + " · " + L.level[e.level] + "</div></div></button>";
        }).join("") : '<div class="item muted small">Aucune alternative compatible avec ton matériel et tes restrictions.</div>') + "</div>" +
        '<p class="tiny muted">Les séries déjà confirmées gardent leur exercice d\'origine : l\'historique n\'est pas réécrit.</p>' };
    },
    pain: function (sh) {
      return { title: "Signaler une gêne", body: '<div class="card"><p>' + E.DISCOMFORT + '</p><textarea data-bind="sheetF.note" placeholder="Décris la gêne (facultatif)">' + h(sh.f.note) + "</textarea></div>" +
        btn("Arrêter cet exercice", "painSave", { all: "0" }) + btn("Arrêter la séance ici", "painSave", { all: "1" }, "secondary") +
        '<p class="tiny muted">Aucune hausse de charge ne sera proposée sur ce mouvement tant que la gêne n\'est pas levée (fiche de l\'exercice).</p>' };
    },
    exercise: function (sh) {
      var e = E.exercise(sh.id);
      if (!e) return { title: "Exercice", body: "" };
      var best = E.bestSet(db, e.id), pain = E.activePain(db, e.id), disabled = db.profile.disabledExerciseIDs.indexOf(e.id) >= 0;
      return { title: e.name, body: '<div class="card"><div class="row between small"><span class="muted">Famille</span><span>' + L.family[e.family] + '</span></div><div class="row between small"><span class="muted">Niveau</span><span>' + L.level[e.level] + '</span></div><div class="row between small"><span class="muted">Matériel</span><span>' + e.equipment.map(function (x) { return L.equipment[x]; }).join(", ") + "</span></div></div>" +
        '<div class="card"><h3>Étapes</h3>' + e.steps.map(function (x, i) { return '<p class="small">' + (i + 1) + ". " + h(x) + "</p>"; }).join("") + "</div>" +
        '<div class="card"><h3>Points d\'attention</h3>' + e.cues.map(function (x) { return '<p class="small">✓ ' + h(x) + "</p>"; }).join("") + "<h3>Erreurs courantes</h3>" + e.errors.map(function (x) { return '<p class="small">✕ ' + h(x) + "</p>"; }).join("") + "</div>" +
        '<div class="card"><h3>Alternatives</h3>' + e.alternatives.map(E.exercise).filter(Boolean).map(function (a) { return '<button class="btn ghost" style="justify-content:flex-start" data-act="open" data-type="exercise" data-id="' + a.id + '">' + h(a.name) + " ›</button>"; }).join("") + "</div>" +
        (best ? '<div class="card"><h3>Record enregistré dans l\'app</h3><p>' + (best.loadKg != null ? E.fmtNum(best.loadKg) + " kg × " : "") + best.reps + ' répétitions</p><p class="tiny muted">Record saisi sur ce mouvement précis, pas une mesure de force absolue.</p></div>' : "") +
        '<div class="card">' + toggleAct("Désactiver ce mouvement", "disableEx", { id: e.id }, disabled) +
        (pain ? '<p class="small">Gêne signalée le ' + new Date(pain.date).toLocaleDateString("fr-FR") + " : progression automatique bloquée.</p>" + btn("La gêne a disparu", "resolvePain", { id: pain.id }, "secondary") : "") + "</div>" +
        '<p class="tiny muted">Illustration et démonstration originales à intégrer avant diffusion. Source : ' + h(e.source) + ".</p>" };
    },
    skill: function (sh) {
      var s = E.skill(sh.id);
      if (!s) return { title: "Compétence", body: "" };
      var p = db.skills[s.id] || { state: 0, practicedRounds: 0, difficulties: "" }, f = new E.Filter(db.profile, db), why = f.skillBlockingReason(s), pain = E.activePain(db, null, s.id);
      if (sh.diff == null) sh.diff = p.difficulties || "";
      return { title: s.name, body: '<div class="card"><h3>' + h(s.objective) + '</h3><div class="row between small"><span class="muted">Niveau</span><span>' + L.level[s.level] + '</span></div><div class="row between small"><span class="muted">Contexte</span><span>' + L.context[s.context] + '</span></div><div class="row between small"><span class="muted">Matériel</span><span>' + s.equipment.map(function (x) { return L.equipment[x]; }).join(", ") + "</span></div></div>" +
        (why ? '<div class="note">⚠︎ ' + h(why) + "</div>" : "") +
        (s.prerequisites.length ? '<div class="section-title">Prérequis (au moins « pratiquée »)</div><div class="list">' + s.prerequisites.map(E.skill).filter(Boolean).map(function (q) {
          return '<button class="item" data-act="open" data-type="skill" data-id="' + q.id + '"><span class="grow">' + h(q.name) + '</span><span class="small muted">' + L.skillState[(db.skills[q.id] || { state: 0 }).state] + "</span></button>";
        }).join("") + "</div>" : "") +
        '<div class="card"><h3>Étapes</h3>' + s.steps.map(function (x, i) { return '<p class="small">' + (i + 1) + ". " + h(x) + "</p>"; }).join("") + "<h3>Erreurs à surveiller</h3>" + s.errors.map(function (x) { return '<p class="small">👁 ' + h(x) + "</p>"; }).join("") + "</div>" +
        '<div class="card"><h3>Ma progression</h3><div class="row between small"><span class="muted">État</span><span>' + L.skillState[p.state] + (p.validatedBy ? " · " + (p.validatedBy === "coach" ? "par le coach" : "autoévaluation") : "") + '</span></div><div class="row between small"><span class="muted">Rounds pratiqués</span><span>' + (p.practicedRounds || 0) + "</span></div>" +
        '<textarea data-bind="topSheet.diff" placeholder="Difficultés rencontrées">' + h(sh.diff) + "</textarea>" +
        btn("J'ai étudié la fiche", "skillState", { id: s.id, v: "1" }, "secondary") + btn("Je l'ai pratiquée", "skillState", { id: s.id, v: "2" }, "secondary") +
        btn("Je la valide (autoévaluation)", "skillState", { id: s.id, v: "3", by: "self" }, "secondary") + btn("Validée par mon coach", "skillState", { id: s.id, v: "3", by: "coach" }, "secondary") +
        (p.state > 0 ? btn("Réinitialiser l'état", "skillState", { id: s.id, v: "0" }, "danger") : "") +
        '<p class="tiny muted">Un nombre de rounds ne certifie pas la qualité d\'un geste : la validation est une décision explicite, la tienne ou celle de ton coach.</p></div>' +
        (pain ? btn("La gêne a disparu", "resolvePain", { id: pain.id }, "secondary") : btn("Signaler une gêne sur ce geste", "skillPain", { id: s.id }, "danger")) };
    },
    profileEdit: function () {
      if (!ui.edit) ui.edit = E.clone(db.profile);
      var p = ui.edit;
      return { title: "Profil sportif", body: secIdentity("edit", p) + '<div class="section-title">Expérience</div>' + secExperience("edit", p) + '<div class="section-title">Objectifs</div>' + secGoals("edit", p) +
        '<div class="section-title">Matériel</div>' + secEquipment("edit", p) + '<div class="section-title">Disponibilités</div>' + secSlots("edit", p) +
        '<div class="section-title">Limitations</div>' + secRestrictions("edit", p) + '<div class="section-title">Bilan</div>' + secAssessment("edit", p) + btn("Enregistrer le profil", "saveProfile") };
    },
    proposal: function () { return { title: "Nouvelle proposition", body: proposalBody(false) }; },
    adaptations: function () {
      var list = db.adaptations.slice().reverse();
      var dec = { pending: "En attente", accepted: "Acceptée", refused: "Refusée", automatic: "Automatique" };
      return { title: "Adaptations", body: list.length ? list.map(function (a) {
        var s = a.previous && E.findSession(db, a.previous.id), canRevert = a.previous && a.decision !== "refused" && s && E.isOpen(s);
        return '<div class="card"><div class="row between"><strong>' + L.action[a.action] + '</strong><span class="badge">' + dec[a.decision] + '</span></div><p class="tiny muted">' + new Date(a.date).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) + " · " + a.rulesVersion + "</p>" +
          '<p class="small">Motif : ' + h(a.reason) + "</p>" + (a.dataUsed.length ? '<p class="tiny">Données : ' + h(a.dataUsed.join(" ; ")) + "</p>" : "") + (a.changes.length ? '<p class="tiny">Changements : ' + h(a.changes.join(" ; ")) + "</p>" : "") +
          (canRevert ? btn("Revenir à l'ancienne version", "revert", { id: a.id }, "secondary small") : "") + "</div>";
      }).join("") : '<p class="muted">Aucune adaptation pour le moment.</p>' };
    },
    playlists: function (sh) {
      var f = sh.f, valid = /^https:\/\/((www|m|music)\.)?(youtube\.com|youtu\.be)\//i.test(f.url);
      return { title: "Playlists", body: '<div class="list">' + (db.playlists.length ? db.playlists.map(function (p) {
        return '<div class="item"><a class="grow" href="' + h(p.url) + '" target="_blank" rel="noopener">' + h(p.name) + '</a><span class="tiny muted">' + (p.app === "baki" ? "Baki" : "Al-ghūl") + '</span><button class="btn danger small" data-act="delPlaylist" data-id="' + p.id + '">✕</button></div>';
      }).join("") : '<div class="item muted small">Aucune playlist.</div>') + "</div>" +
        '<p class="tiny muted">Lance ta musique dans YouTube puis reviens à la séance. La lecture en arrière-plan dépend de YouTube ; l\'app ne télécharge ni n\'extrait aucun son.</p>' +
        '<div class="card"><label class="field">Nom<input type="text" data-bind="sheetF.name" value="' + h(f.name) + '"></label><label class="field">Lien https://www.youtube.com/…<input type="url" data-bind="sheetF.url" data-rerender-change value="' + h(f.url) + '" autocapitalize="off"></label>' +
        (f.url && !valid ? '<p class="small" style="color:var(--danger)">Colle un lien YouTube commençant par https://</p>' : "") + btn("Enregistrer", "addPlaylist", {}, "secondary") + "</div>" };
    },
    export: function (sh) {
      return { title: "Export chiffré", body: '<div class="card"><label class="field">Mot de passe (8 caractères min.)<input type="password" data-bind="sheetF.pw" value="' + h(sh.f.pw) + '" autocomplete="new-password"></label>' +
        '<p class="tiny muted">L\'archive contient profil, programmes et historique, chiffrés (AES-GCM, clé dérivée PBKDF2). Sans ce mot de passe, elle ne peut pas être ouverte. Range-la dans Fichiers ou iCloud Drive.</p></div>' + btn("Créer l'archive", "doExport") };
    },
    import: function (sh) {
      return { title: "Import", body: '<div class="card"><label class="field">Mot de passe de l\'archive<input type="password" data-bind="sheetF.pw" value="' + h(sh.f.pw) + '"></label>' +
        seg("importMode", [["merge", "Fusionner (sans doublons)"], ["replace", "Remplacer tout"]], sh.f.mode) + "</div>" + btn("Importer", "doImport") };
    },
    absence: function (sh) {
      return { title: "Rounds hors écran", body: '<div class="card"><p>Pendant ton absence (appel, verrouillage, autre app), le temps a continué. Le minuteur est en pause.</p>' +
        sh.rounds.map(function (n) { return '<label class="check"><input type="checkbox" data-change="absCheck" data-v="' + n + '"' + (sh.checked.indexOf(n) >= 0 ? " checked" : "") + ">J'ai réellement fait le round " + n + "</label>"; }).join("") +
        '<p class="tiny muted">Les rounds non cochés ne seront pas comptés comme réalisés.</p></div>' + btn("Valider", "absValidate"), noClose: true };
    },
    rpe: function () {
      return { title: "Comprendre l'effort", body: '<div class="card"><h3>RPE — effort perçu</h3><p class="small">Note de 1 à 10 de la difficulté ressentie. 10 = impossible de faire une répétition de plus.</p></div><div class="card"><h3>RIR — répétitions en réserve</h3><p class="small">Nombre de répétitions que tu penses encore pouvoir faire avec une bonne technique. RIR 2 = tu t\'arrêtes avec 2 répétitions en réserve.</p></div><p class="small muted">Les deux sont facultatifs tant que tu ne sais pas les estimer. Sans eux, la progression se base sur les répétitions réalisées.</p>' + btn("Compris", "closeSheet") };
    },
    reaction: function (sh) {
      var r = sh.r, colors = { ready: "#555", waiting: "#555", go: "var(--accent)", tooSoon: "#d9822b", done: "#555" };
      var labels = { ready: "Touche pour commencer, puis touche dès que l'écran change", waiting: "Attends le signal…", go: "Touche !", tooSoon: "Trop tôt — touche pour recommencer cet essai", done: "Test terminé" };
      var med = null;
      if (r.results.length) { var s = r.results.slice().sort(function (a, b) { return a - b; }); med = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; }
      return { title: "Réactivité", body: '<p class="center"><strong>Essai ' + Math.min(r.results.length + 1, 5) + " / 5</strong></p>" +
        '<div class="react" id="react-pad" style="background:' + colors[r.phase] + '" data-act="reactTap">' + labels[r.phase] + "</div>" +
        (r.results.length ? '<p class="center mono">' + r.results.map(function (x) { return Math.round(x) + " ms"; }).join(" · ") + "</p>" : "") +
        (r.phase === "done" ? '<p class="center"><strong>Médiane : ' + Math.round(med) + " ms</strong></p>" + btn("Enregistrer le résultat", "reactSave", { m: Math.round(med) }) : "") +
        '<p class="tiny muted center">Indicateur de réponse à un signal visuel sur écran : il dépend de l\'appareil, de l\'attention et des conditions. Ce n\'est pas une mesure de réflexes en combat.</p>' };
    }
  };

  function proposalHTML(p, sh) {
    var b = '<div class="card"><h3>' + (p.action === "keep" ? "✓ Séance conservée" : "↻ Proposition : " + L.action[p.action].toLowerCase()) + "</h3>" + p.reasons.map(function (r) { return '<p class="small">' + h(r) + "</p>"; }).join("") +
      '<p class="tiny muted">Règles ' + E.RULES + ", sans IA. Tu peux refuser.</p></div>";
    if (p.safetyMessage) b += '<div class="note">✚ ' + h(p.safetyMessage) + "</div>";
    if (p.changes.length) b += '<div class="card"><h3>Changements</h3>' + p.changes.map(function (c) { return '<p class="small">• ' + h(c) + "</p>"; }).join("") + "</div>";
    if (p.dataUsed.length) b += '<div class="card"><h3>Données utilisées</h3>' + p.dataUsed.map(function (c) { return '<p class="small">' + h(c) + "</p>"; }).join("") + "</div>";
    if (p.missingInfo.length) b += '<div class="card"><h3>Informations manquantes</h3>' + p.missingInfo.map(function (c) { return '<p class="small muted">' + h(c) + "</p>"; }).join("") + "</div>";
    if (p.action === "keep") return b + btn("Commencer", "ciStart");
    if (p.requiresExplicitConsent) b += '<div class="card">' + toggle("Tu avais verrouillé cette séance. Modifier quand même ?", "sheetF.consent", sh.f.consent, " data-rerender") + "</div>";
    if (p.action === "replace" && p.proposed.discipline === "mobility") b += btn("Reporter plutôt", "postpone", { id: p.original.id, close: "1" }, "secondary");
    b += '<button class="btn" data-act="ciAccept"' + (p.requiresExplicitConsent && !sh.f.consent ? " disabled" : "") + ">Accepter" + (p.proposed.discipline === p.original.discipline ? " et commencer" : "") + "</button>";
    b += btn("Refuser et garder la séance prévue", "ciRefuse", {}, "secondary");
    return b;
  }

  // =====================================================================
  // Séance plein écran
  // =====================================================================
  function fullView() {
    var f = ui.full, s = E.findSession(db, f.id);
    if (!s) return '<main class="screen"><p>Séance introuvable.</p>' + btn("Fermer", "quitFull") + "</main>";
    return f.type === "workout" ? workoutView(f, s) : roundsView(f, s);
  }
  function fullHead(s, extra) {
    return '<div class="topbar"><button class="btn ghost" data-act="quitFull" aria-label="Quitter la séance (les saisies confirmées sont enregistrées)">✕ Quitter</button><strong class="grow center small">' + h(s.title) + "</strong>" + (extra || '<span style="width:70px"></span>') + "</div>";
  }

  // ---------- Musculation (BAK03, BAK04) ----------
  function workoutView(f, s) {
    var out = '<main class="screen" style="padding-bottom:calc(30px + var(--safe-b))">' + fullHead(s, '<button class="btn ghost" data-act="open" data-type="rpe">RPE ?</button>');
    if (s.adaptationNote) out += '<div class="note">↻ ' + h(s.adaptationNote) + "</div>";
    if (f.rest) out += '<div class="card"><div class="row"><div class="grow"><div class="small muted" id="rest-label">Repos</div><div class="rest-clock" id="rest-clock">' + clock(restRemaining(f)) + "</div></div>" +
      btn(f.rest.paused != null ? "Reprendre" : "Pause", "restPause", {}, "secondary small") + btn("Passer", "restSkip", {}, "secondary small") + "</div></div>";
    out += '<div class="card"><h3>Échauffement</h3>' + D.strengthWarmup.map(function (x, i) {
      return '<label class="check"><input type="checkbox" data-change="warm" data-v="' + i + '"' + (f.warm.indexOf(i) >= 0 ? " checked" : "") + ">" + h(x) + "</label>";
    }).join("") + "</div>";
    s.plannedExercises.forEach(function (pe) { out += exerciseCard(f, s, pe); });
    out += '<div class="card"><h3>Fin de séance</h3>' + D.strengthCooldown.map(function (x) { return '<p class="small">• ' + h(x) + "</p>"; }).join("") + "</div>" +
      btn("Terminer la séance", "finishWorkout", { partial: "0" }) + btn("Fin anticipée", "finishWorkout", { partial: "1" }, "secondary") + "</main>";
    return out;
  }
  function exerciseCard(f, s, pe) {
    var done = s.sets.filter(function (x) { return x.plannedExerciseID === pe.id; }), work = done.filter(function (x) { return !x.isWarmup; });
    var open = f.expanded === pe.id;
    var out = '<div class="card"><button class="row" style="background:none;border:0;padding:0;text-align:left;width:100%" data-act="wxToggle" data-id="' + pe.id + '"><div class="grow"><h3 class="' + (pe.isSuspended ? "strike" : "") + '">' + h(E.exName(pe.exerciseID)) + '</h3><div class="small muted">' +
      pe.sets + " × " + reps(pe) + " · repos " + E.dur(pe.restSeconds) + (pe.targetRIR != null ? " · RIR " + pe.targetRIR : "") + '</div></div><strong class="mono" aria-label="' + work.length + " séries sur " + pe.sets + '">' + work.length + "/" + pe.sets + "</strong><span class=\"muted\">" + (open ? "▴" : "▾") + "</span></button>";
    if (pe.isSuspended) return out + '<p class="small muted">Exercice suspendu pour cette séance.</p></div>';
    if (!open) return out + "</div>";
    if (pe.progressionNote) out += '<p class="tiny muted">' + h(pe.progressionNote) + "</p>";
    var last = lastPerformance(pe.exerciseID, s.id);
    if (last) out += '<p class="small">Dernière fois : ' + h(last) + "</p>";
    out += done.map(function (x) {
      return '<div class="set-row"><span>' + (x.isWarmup ? "Approche" : "Série " + x.index) + '</span><span class="mono">' + (x.loadKg != null ? E.fmtNum(x.loadKg) + " kg × " : "") + x.reps + (x.rir != null ? " · RIR " + x.rir : "") + ' <span style="color:var(--accent)">✓</span></span></div>';
    }).join("");
    var warmDone = done.filter(function (x) { return x.isWarmup; }).length;
    if (pe.warmupSets > 0 && warmDone < pe.warmupSets && pe.suggestedLoadKg != null) out += '<p class="tiny">Série d\'approche suggérée : ' + E.fmtNum(Math.round(pe.suggestedLoadKg * (warmDone ? 0.75 : 0.5) * 2) / 2) + " kg × 5</p>";
    if (work.length < pe.sets) {
      var d = draftFor(f, s, pe), ex = E.exercise(pe.exerciseID), usesLoad = ex && ex.loadType !== "bodyweight" && ex.loadType !== "band";
      if (usesLoad) out += '<p class="small">Charge</p><div class="stepper"><button data-act="wxLoad" data-id="' + pe.id + '" data-v="-1" aria-label="Diminuer la charge">−</button><span class="val">' + (d.load != null ? E.fmtNum(d.load) : "—") + ' kg</span><button data-act="wxLoad" data-id="' + pe.id + '" data-v="1" aria-label="Augmenter la charge">+</button></div>' +
        (pe.suggestedLoadKg != null ? '<p class="tiny muted">Suggestion : ' + E.fmtNum(pe.suggestedLoadKg) + " kg — à confirmer, rien n'est enregistré avant validation.</p>" : "");
      out += '<p class="small">Répétitions</p><div class="stepper"><button data-act="wxReps" data-id="' + pe.id + '" data-v="-1">−</button><span class="val">' + d.reps + '</span><button data-act="wxReps" data-id="' + pe.id + '" data-v="1">+</button></div>' +
        '<p class="small">Répétitions en réserve (RIR, facultatif)</p>' + chips("wxRir", [["", "—"], [0, "0"], [1, "1"], [2, "2"], [3, "3"], [4, "4+"]], d.rir == null ? "" : d.rir, { id: pe.id }) +
        '<div class="btns">' + (pe.warmupSets > 0 ? btn("Valider l'approche", "wxConfirm", { id: pe.id, warm: "1" }, "secondary") : "") + btn("Valider la série " + (work.length + 1), "wxConfirm", { id: pe.id, warm: "0" }) + "</div>";
    } else out += '<p style="color:var(--accent)"><strong>✓ Exercice terminé</strong></p>';
    out += '<div class="btns">' + btn("Remplacer", "open", { type: "substitute", sid: s.id, pid: pe.id }, "secondary small") + btn("Passer", "wxSkip", { id: pe.id }, "secondary small") + btn("Gêne", "open", { type: "pain", sid: s.id, pid: pe.id }, "secondary small") + "</div>" +
      btn("Voir la fiche", "open", { type: "exercise", id: pe.exerciseID }, "ghost");
    return out + "</div>";
  }
  function draftFor(f, s, pe) {
    if (!f.drafts[pe.id]) {
      var prev = s.sets.filter(function (x) { return x.plannedExerciseID === pe.id && !x.isWarmup; }).pop();
      f.drafts[pe.id] = { load: prev ? prev.loadKg : pe.suggestedLoadKg, reps: prev ? prev.reps : pe.repMax, rir: null };
    }
    return f.drafts[pe.id];
  }
  function lastPerformance(exID, sid) {
    var hst = E.history(db, exID).filter(function (x) { return x.session.id !== sid; }), last = hst[hst.length - 1];
    if (!last) return null;
    var w = last.sets.filter(function (x) { return !x.isWarmup; });
    return w.map(function (x) { return (x.loadKg != null ? E.fmtNum(x.loadKg) : "PDC") + "×" + x.reps; }).join(", ");
  }
  function restRemaining(f) { if (!f.rest) return 0; return f.rest.paused != null ? f.rest.paused : Math.max(0, (f.rest.endsAt - now()) / 1000); }

  // ---------- Muay thaï (ALG05–ALG08) ----------
  function roundsView(f, s) {
    var out = '<main class="screen" style="padding-bottom:calc(30px + var(--safe-b))">' + fullHead(s);
    if (f.stage === "intro") {
      var obj = s.skillIDs.map(E.skill).filter(Boolean).map(function (k) { return k.objective; }).join(" ") || "Garde, appuis et déplacements propres.";
      out += '<div class="card"><h3>Objectif</h3><p>' + h(obj) + '</p><div class="divider"></div><p class="small">👤 Contexte : seul</p><p class="small">🎒 Matériel : ' + h(equipText(s)) + '</p><p class="tiny muted">Exercices avec partenaire et sparring exclus. Gants et bandes obligatoires pour le sac.</p></div>' +
        (s.adaptationNote ? '<div class="note">↻ ' + h(s.adaptationNote) + "</div>" : "") +
        '<div class="card"><h3>Échauffement</h3>' + D.martialWarmup.map(function (x, i) { return '<label class="check"><input type="checkbox" data-change="warm" data-v="' + i + '"' + (f.warm.indexOf(i) >= 0 ? " checked" : "") + ">" + h(x) + "</label>"; }).join("") + "</div>" +
        btn("Apprentissage technique", "rdStage", { v: "technique" });
    } else if (f.stage === "technique") {
      out += s.skillIDs.map(E.skill).filter(Boolean).map(function (k) {
        return '<div class="card"><h3>' + h(k.name) + '</h3><p class="small muted">' + h(k.objective) + "</p>" + k.steps.map(function (x, i) { return '<p class="small">' + (i + 1) + ". " + h(x) + "</p>"; }).join("") + '<p class="tiny">À surveiller : ' + h(k.errors.join(" · ")) + "</p></div>";
      }).join("") + '<div class="card"><h3>Rounds prévus</h3><p>' + s.plannedRounds + " × " + E.dur(s.roundSeconds) + ", repos " + E.dur(s.restSeconds) + "</p>" + s.roundFocus.map(function (x, i) { return '<p class="tiny">Round ' + (i + 1) + " : " + h(x) + "</p>"; }).join("") + "</div>" +
        '<p class="tiny muted center">Astuce : garde l\'app ouverte pendant les rounds. Si tu la quittes, le temps continue et les rounds écoulés te seront demandés au retour.</p>' +
        btn("Lancer les rounds", "rdStart");
    } else if (f.stage === "rounds") {
      var pos = f.timer ? E.tPosition(f.timer, now()) : null, ph = pos && pos.phase;
      out += '<div class="stack center" style="margin-top:10px"><h2 id="rd-title">' + phaseTitle(pos, s) + "</h2>" +
        '<div class="big-clock' + (ph && ph.kind === "rest" ? " rest" : "") + '" id="rd-clock">' + clock(pos ? pos.remaining : 0) + "</div>" +
        (f.timer && E.tPaused(f.timer) ? "<p><strong>⏸ En pause</strong></p>" : "") +
        (ph && ph.kind === "round" && s.roundFocus[ph.round - 1] ? "<h3>" + h(s.roundFocus[ph.round - 1]) + "</h3>" : "") +
        '<div class="call" id="rd-call" ' + (f.call && ph && ph.kind === "round" ? "" : "hidden") + ">" + h(f.call || "") + "</div>" +
        '<p class="small muted">Rounds effectués : ' + E.completedRounds(s) + " / prévus : " + s.plannedRounds + "</p></div>" +
        '<div class="btns" style="margin-top:20px">' + btn(f.timer && E.tPaused(f.timer) ? "Reprendre" : "Pause", "rdPause") + btn("Passer", "rdSkip", {}, "secondary") + "</div>" +
        btn("Arrêter la séance", "rdStop", {}, "secondary");
    } else {
      out += '<div class="card"><p>' + (f.stopped ? "Séance arrêtée : elle sera enregistrée comme partielle." : "Rounds terminés. La régularité construit la maîtrise.") + '</p><div class="row between small"><span class="muted">Rounds prévus</span><span>' + s.plannedRounds + '</span></div><div class="row between small"><span class="muted">Rounds effectués</span><span>' + E.completedRounds(s) + "</span></div></div>" +
        '<div class="card"><h3>Retour au calme</h3>' + D.martialCooldown.map(function (x) { return '<p class="small">• ' + h(x) + "</p>"; }).join("") + "</div>" +
        (s.skillIDs.length ? '<div class="card"><h3>Compétences travaillées</h3>' + s.skillIDs.map(E.skill).filter(Boolean).map(function (k) {
          return '<label class="check"><input type="checkbox" data-change="practiced" data-v="' + k.id + '"' + (f.practiced.indexOf(k.id) >= 0 ? " checked" : "") + ">" + h(k.name) + "</label>";
        }).join("") + '<p class="tiny muted">Elles passent à « pratiquée ». La validation reste une décision explicite, depuis le parcours.</p></div>' : "") +
        btn("Terminer et noter la séance", "rdFinish");
    }
    return out + "</main>";
  }
  function phaseTitle(pos, s) {
    if (!pos) return "Prêt";
    if (pos.finished) return "Terminé";
    return pos.phase.kind === "round" ? "Round " + pos.phase.round + " / " + s.plannedRounds : "Repos — round " + pos.phase.round + " ensuite";
  }
  function equipText(s) {
    var eq = {};
    s.skillIDs.map(E.skill).filter(Boolean).forEach(function (k) { k.equipment.forEach(function (x) { if (x !== "bodyweight") eq[L.equipment[x]] = 1; }); });
    if (s.roundFocus.some(function (x) { return x.indexOf("Sac") === 0; })) { eq[L.equipment.heavyBag] = 1; eq[L.equipment.gloves] = 1; }
    return Object.keys(eq).sort().join(", ") || "aucun";
  }

  // =====================================================================
  // Son, voix, écran allumé
  // =====================================================================
  var audioCtx = null, wakeLock = null;
  function unlockAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch (e) { /* audio facultatif */ }
  }
  function beep(kind) {
    if (!settings().sounds || !audioCtx) return;
    try {
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = kind === "end" ? 520 : 880;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + (kind === "end" ? 0.6 : 0.25));
      o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.7);
    } catch (e) { /* facultatif */ }
  }
  function speak(text) {
    if (!settings().voiceCues || !window.speechSynthesis) return;
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "fr-FR"; u.rate = 1.05;
      var v = speechSynthesis.getVoices().find(function (x) { return x.lang && x.lang.indexOf("fr") === 0; });
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (e) { /* facultatif */ }
  }
  function keepAwake(on) {
    if (!("wakeLock" in navigator)) return;
    if (on && settings().keepAwake) {
      if (!wakeLock) navigator.wakeLock.request("screen").then(function (l) { wakeLock = l; l.addEventListener("release", function () { wakeLock = null; }); }).catch(function () {});
    } else if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; }
  }

  // =====================================================================
  // Boucle du minuteur et gestion des absences (IOS01, T03)
  // =====================================================================
  function persistRound() {
    var f = ui.full;
    if (!f || f.type !== "rounds") return;
    try { localStorage.setItem(TKEY + f.id, JSON.stringify({ stage: f.stage, timer: f.timer, lastObs: f.lastObs, stopped: f.stopped, practiced: f.practiced, warm: f.warm })); } catch (e) { /* non bloquant */ }
  }
  function recordRound(sid, n, planned, actual, completed, afterAbsence) {
    commit(function (d) {
      var s = E.findSession(d, sid);
      if (!s || s.rounds.some(function (r) { return r.index === n; })) return;
      if (s.status === "planned") { s.status = "inProgress"; s.startedAt = now(); }
      s.rounds.push({ id: E.uid(), index: n, plannedSeconds: planned, actualSeconds: actual, focus: s.roundFocus[n - 1] || "", completed: completed, confirmedAfterAbsence: afterAbsence, confirmedAt: now() });
      s.updatedAt = now();
    });
  }
  function handleReturn(t) {
    var f = ui.full;
    if (!f || f.type !== "rounds") return;
    f.away = false; f.lastTick = t;
    if (f.stage !== "rounds" || !f.timer) return;
    var ended = E.tEndedDuringAbsence(f.timer, f.lastObs, t);
    if (E.tRunning(f.timer) && ended.length) {
      E.tPause(f.timer, t);
      ui.sheets.push({ type: "absence", rounds: ended, checked: [] });
    }
    f.lastObs = E.tPosition(f.timer, t).index;
    persistRound();
    render();
    keepAwake(true);
  }
  function finishRounds() {
    var f = ui.full;
    f.stage = "cooldown"; f.call = null;
    beep("end"); speak("Séance terminée");
    keepAwake(false);
    persistRound(); render();
  }

  setInterval(function () {
    var f = ui.full, t = now();
    if (!f) return;
    if (f.type === "workout" && f.rest) {
      var rem = restRemaining(f), el = document.getElementById("rest-clock");
      if (el) el.textContent = clock(rem);
      if (rem <= 0 && f.rest.paused == null && !f.rest.signaled) {
        f.rest.signaled = true; beep("end"); speak("Repos terminé");
        var lab = document.getElementById("rest-label"); if (lab) lab.textContent = "Repos terminé";
      }
      return;
    }
    if (f.type !== "rounds" || f.stage !== "rounds" || !f.timer || f.away || ui.sheets.length) return;
    if (E.tRunning(f.timer) && t - f.lastTick > 2000) { handleReturn(t); return; }
    f.lastTick = t;
    var s = E.findSession(db, f.id);
    if (!s) return;
    var pos = E.tPosition(f.timer, t);
    if (pos.index > f.lastObs) {
      for (var i = f.lastObs; i < Math.min(pos.index, f.timer.phases.length); i++) {
        var ph = f.timer.phases[i];
        if (ph.kind === "round") recordRound(f.id, ph.round, ph.seconds, ph.seconds, true, false);
      }
      f.lastObs = pos.index;
      persistRound();
      if (pos.finished) { finishRounds(); return; }
      if (pos.phase.kind === "round") { beep("start"); speak("Round " + pos.phase.round); f.nextCallAt = t + 6000; }
      else { beep("end"); speak("Repos"); f.call = null; }
      render();
      return;
    }
    if (E.tRunning(f.timer) && pos.phase && pos.phase.kind === "round" && t >= f.nextCallAt) {
      var combos = new E.Filter(db.profile, db).allowedCombos().map(function (c) { return c.call; });
      var pool = combos.length ? combos : ["Garde", "Avance", "Recule", "Côté"];
      f.call = pool[Math.floor(Math.random() * pool.length)];
      f.nextCallAt = t + 6000 + Math.random() * 5000;
      if (settings().voiceCues) speak(f.call); else beep("start");
      var c = document.getElementById("rd-call"); if (c) { c.textContent = f.call; c.hidden = false; }
    }
    var cl = document.getElementById("rd-clock"); if (cl) cl.textContent = clock(pos.remaining);
  }, 250);

  document.addEventListener("visibilitychange", function () {
    var f = ui.full;
    if (!f || f.type !== "rounds") return;
    if (document.hidden) { f.away = true; persistRound(); }
    else handleReturn(now());
  });

  // =====================================================================
  // Actions
  // =====================================================================
  function openSheet(o) { ui.sheets.push(o); render(); }
  function topSheet() { return ui.sheets[ui.sheets.length - 1]; }
  function closeSheet() { ui.sheets.pop(); if (!ui.sheets.some(function (s) { return s.type === "profileEdit"; })) ui.edit = null; render(); }
  Object.defineProperty(ui, "sheetF", { get: function () { var t = topSheet(); return t && t.f; } });
  Object.defineProperty(ui, "topSheet", { get: function () { return topSheet(); } });
  function draft(t) { return t === "edit" ? ui.edit : ui.ob.p; }

  function startSession(id) {
    var s = E.findSession(db, id);
    if (!s) return;
    if (s.discipline !== "strength" && s.discipline !== "muayThai") { openSheet({ type: "feedback", id: id, f: feedbackForm(s, false) }); return; }
    if (s.status === "planned") commit(function (d) { var x = E.findSession(d, id); x.status = "inProgress"; x.startedAt = now(); });
    unlockAudio();
    ui.sheets = [];
    if (s.discipline === "strength") {
      var first = s.plannedExercises.find(function (x) { return !x.isSuspended; });
      ui.full = { type: "workout", id: id, expanded: first ? first.id : null, drafts: {}, rest: null, warm: [] };
      if (!settings().hasSeenRPEExplanation) { commit(function (d) { d.settings.hasSeenRPEExplanation = true; }); ui.sheets.push({ type: "rpe" }); }
      keepAwake(true);
    } else {
      var saved = null;
      try { saved = JSON.parse(localStorage.getItem(TKEY + id) || "null"); } catch (e) { saved = null; }
      ui.full = Object.assign({ type: "rounds", id: id, stage: "intro", timer: null, lastObs: 0, lastTick: now(), away: false, call: null, nextCallAt: 0, stopped: false, practiced: s.skillIDs.slice(), warm: [] }, saved || {});
      if (saved && saved.stage === "rounds" && saved.timer && E.tRunning(saved.timer)) { ui.full.away = true; handleReturn(now()); return; }
      if (ui.full.stage === "rounds") keepAwake(true);
    }
    render();
  }
  function feedbackForm(s, partial) {
    var m = s.startedAt ? Math.max(1, Math.round((now() - s.startedAt) / 60000)) : s.plannedMinutes;
    return { partial: partial, minutes: Math.min(240, m), rpe: null, fatigue: null, intensity: null, discomfort: "", toWork: "", notes: "" };
  }
  function quitFull() {
    var f = ui.full;
    if (f && f.type === "rounds" && f.stage === "rounds" && f.timer && E.tRunning(f.timer)) { E.tPause(f.timer, now()); persistRound(); }
    ui.full = null; keepAwake(false);
    if (window.speechSynthesis) speechSynthesis.cancel();
    render();
  }

  var A = {
    tab: function (d) { ui.tab = d.v; window.scrollTo(0, 0); render(); },
    space: function (d) { commit(function (x) { x.settings.space = d.v; }); render(); },
    open: function (d) {
      var o = { type: d.type, id: d.id, sid: d.sid, pid: d.pid };
      if (d.type === "checkin") return;
      if (d.type === "log") { var n = new Date(); n.setMinutes(n.getMinutes() - n.getTimezoneOffset()); o.f = { discipline: "club", date: n.toISOString().slice(0, 16), minutes: 60, rpe: null, intensity: null, notes: "" }; }
      if (d.type === "feedback") o.f = feedbackForm(E.findSession(db, d.id), d.partial === "1");
      if (d.type === "pain") o.f = { note: "" };
      if (d.type === "playlists") o.f = { name: "", url: "" };
      if (d.type === "export") o.f = { pw: "" };
      if (d.type === "reaction") o.r = { phase: "ready", results: [], t0: 0, timer: null };
      if (d.type === "proposal") { var c = E.activeCycle(db); ui.prop = { start: isoDate(now()), weeks: 4, base: c ? c.revision : null }; }
      if (d.type === "profileEdit" && !ui.edit) ui.edit = E.clone(db.profile);
      openSheet(o);
    },
    closeSheet: function () { var t = topSheet(); if (t && t.type === "reaction" && t.r.timer) clearTimeout(t.r.timer); closeSheet(); },
    sheetBackdrop: function (d, el, ev) {
      if (ev.target !== el) return;
      var t = topSheet();
      if (t && (t.type === "absence" || t.type === "feedback")) return;
      A.closeSheet();
    },

    // Onboarding et profil
    obNext: function () { ui.ob.step++; window.scrollTo(0, 0); render(); },
    obPrev: function () { ui.ob.step--; window.scrollTo(0, 0); render(); },
    obFinish: function () {
      var p = E.clone(ui.ob.p); p.updatedAt = now();
      if (commit(function (d) { d.profile = p; })) { try { localStorage.removeItem(OBKEY); } catch (e) { /* rien */ } ui.ob = null; ui.prop = null; ui.rform = null; ui.aform = null; window.scrollTo(0, 0); render(); }
    },
    goal: function (d) { var p = draft(d.t), i = p.goals.indexOf(d.g); if (i >= 0) p.goals.splice(i, 1); else p.goals.push(d.g); render(); },
    addSlot: function (d) {
      var p = draft(d.t), used = p.slots.map(function (s) { return s.weekday; });
      var wd = [1, 2, 3, 4, 5, 6, 7].find(function (x) { return used.indexOf(x) < 0; }) || 1;
      p.slots.push(E.newSlot(wd, d.p)); render();
    },
    delSlot: function (d) { draft(d.t).slots.splice(+d.i, 1); render(); },
    rfam: function (d) { var i = ui.rform.fam.indexOf(d.v); if (i >= 0) ui.rform.fam.splice(i, 1); else ui.rform.fam.push(d.v); render(); },
    addRestriction: function (d) {
      if (!ui.rform.text.trim()) { toast("Ajoute une description."); return; }
      draft(d.t).restrictions.push({ id: E.uid(), kind: ui.rform.kind, text: ui.rform.text.trim(), blockedFamilies: ui.rform.fam.slice(), blockedExerciseIDs: [], blockedSkillIDs: [], isActive: true, createdAt: now() });
      ui.rform = null; render();
    },
    delRestriction: function (d) { draft(d.t).restrictions.splice(+d.i, 1); render(); },
    aSuggest: function (d) { ui.aform.label = d.v; render(); },
    addAssessment: function (d) {
      if (!ui.aform.label.trim() || !ui.aform.value.trim()) { toast("Renseigne l'élément et la valeur."); return; }
      draft(d.t).assessment.push({ id: E.uid(), app: space(), key: ui.aform.label.toLowerCase(), label: ui.aform.label, value: ui.aform.value, source: ui.aform.source, date: now() });
      ui.aform = null; render();
    },
    delAssessment: function (d) { draft(d.t).assessment.splice(+d.i, 1); render(); },
    saveProfile: function () {
      if (!ui.edit.goals.length) { toast("Choisis au moins un objectif."); return; }
      var p = E.clone(ui.edit); p.updatedAt = now();
      if (commit(function (d) { d.profile = p; })) {
        ui.edit = null; ui.sheets.pop();
        var c = E.activeCycle(db); ui.prop = { start: isoDate(now()), weeks: 4, base: c ? c.revision : null };
        ui.sheets.push({ type: "proposal" });
        toast("Profil enregistré. Le programme en cours n'a pas changé : voici une nouvelle proposition, à activer si elle te convient.");
        render();
      }
    },
    activate: function () {
      var parts = ui.prop.start.split("-"), start = new Date(+parts[0], +parts[1] - 1, +parts[2]).getTime();
      var pr = E.propose(db.profile, db, start, ui.prop.weeks, space()), base = ui.prop.base;
      if (commit(function (d) { E.activate(pr, base, d, now()); })) { ui.prop = null; ui.sheets = []; ui.tab = "today"; toast("Programme activé."); render(); }
    },

    // Aujourd'hui
    checkin: function (d) { var s = E.findSession(db, d.id); openSheet({ type: "checkin", id: d.id, f: { fatigue: null, sleepOn: false, sleep: 7, minOn: false, minutes: s.plannedMinutes, discomfort: "", ids: [], proposal: null, consent: false } }); },
    start: function (d) { startSession(d.id); },
    postpone: function (d) {
      if (commit(function (x) { E.postpone(x, d.id, now(), space()); })) {
        var s = E.findSession(db, d.id);
        toast(s && s.status === "skipped" ? "Aucun créneau libre dans les 4 jours : séance annulée sans report forcé." : "Séance reportée au " + E.dayLabel(s.plannedDate) + ".");
      }
      if (d.close) ui.sheets = [];
      render();
    },
    ciFatigue: function (d) { ui.sheetF.fatigue = d.v === "" ? null : +d.v; render(); },
    ciSleep: function (d) { var f = ui.sheetF; f.sleep = Math.max(0, Math.min(14, f.sleep + +d.v)); render(); },
    ciMin: function (d) { var f = ui.sheetF; f.minutes = Math.max(10, Math.min(180, f.minutes + +d.v)); render(); },
    ciEval: function () {
      var sh = topSheet(), f = sh.f;
      var c = { id: E.uid(), date: now(), sessionID: sh.id, fatigue: f.fatigue, sleepHours: f.sleepOn ? f.sleep : null, discomfort: f.discomfort.trim() || null, discomfortExerciseIDs: f.ids.slice(), availableMinutes: f.minOn ? f.minutes : null, source: "entered", origin: space() };
      commit(function (d) {
        d.checkIns.push(c);
        f.ids.forEach(function (id) { d.painReports.push({ id: E.uid(), date: now(), exerciseID: id, skillID: null, note: f.discomfort || "Gêne signalée au point du jour", isResolved: false, resolvedAt: null }); });
      });
      f.proposal = E.evaluate(E.findSession(db, sh.id), c, db, now());
      render();
    },
    ciStart: function () { var id = topSheet().id; ui.sheets = []; startSession(id); },
    ciAccept: function () {
      var sh = topSheet(), p = sh.f.proposal, ok = false;
      commit(function (d) { ok = E.applyProposal(d, p, space(), sh.f.consent, now()); });
      if (!ok) { toast("Cette séance ne peut plus être modifiée."); return; }
      ui.sheets = [];
      if (p.proposed.discipline === p.original.discipline) startSession(sh.id); else { toast("Séance remplacée par une récupération active, visible dans le calendrier."); render(); }
    },
    ciRefuse: function () { var sh = topSheet(); commit(function (d) { E.refuseProposal(d, sh.f.proposal, space()); }); ui.sheets = []; startSession(sh.id); },

    // Séance de musculation
    wxToggle: function (d) { ui.full.expanded = ui.full.expanded === d.id ? null : d.id; render(); },
    wxLoad: function (d) {
      var f = ui.full, s = E.findSession(db, f.id), pe = s.plannedExercises.find(function (x) { return x.id === d.id; }), dr = draftFor(f, s, pe);
      var step = E.stepFor(E.exercise(pe.exerciseID), db.profile) || 2.5;
      dr.load = Math.max(0, Math.round(((dr.load || 0) + +d.v * step) * 100) / 100); render();
    },
    wxReps: function (d) { var f = ui.full, s = E.findSession(db, f.id), pe = s.plannedExercises.find(function (x) { return x.id === d.id; }), dr = draftFor(f, s, pe); dr.reps = Math.max(0, Math.min(50, dr.reps + +d.v)); render(); },
    wxRir: function (d) { var f = ui.full, s = E.findSession(db, f.id), pe = s.plannedExercises.find(function (x) { return x.id === d.id; }); draftFor(f, s, pe).rir = d.v === "" ? null : +d.v; render(); },
    wxConfirm: function (d) {
      var f = ui.full, s = E.findSession(db, f.id), pe = s.plannedExercises.find(function (x) { return x.id === d.id; }), dr = draftFor(f, s, pe), warm = d.warm === "1";
      var idx = warm ? 0 : s.sets.filter(function (x) { return x.plannedExerciseID === pe.id && !x.isWarmup; }).length + 1;
      var entry = { id: E.uid(), plannedExerciseID: pe.id, exerciseID: pe.exerciseID, index: idx, isWarmup: warm, loadKg: dr.load, reps: dr.reps, rpe: null, rir: dr.rir, note: "", confirmedAt: now() };
      if (!commit(function (x) { var ss = E.findSession(x, f.id); if (ss.status === "planned") { ss.status = "inProgress"; ss.startedAt = now(); } ss.sets.push(entry); ss.updatedAt = now(); })) return;
      if (navigator.vibrate) navigator.vibrate(30);
      if (!warm) {
        unlockAudio();
        f.rest = { endsAt: now() + pe.restSeconds * 1000, paused: null, signaled: false };
        s = E.findSession(db, f.id);
        if (s.sets.filter(function (x) { return x.plannedExerciseID === pe.id && !x.isWarmup; }).length >= pe.sets) {
          var nx = s.plannedExercises.find(function (p) { return !p.isSuspended && s.sets.filter(function (x) { return x.plannedExerciseID === p.id && !x.isWarmup; }).length < p.sets; });
          f.expanded = nx ? nx.id : null;
        }
      }
      render();
    },
    wxSkip: function (d) { var id = ui.full.id; commit(function (x) { var s = E.findSession(x, id), pe = s.plannedExercises.find(function (p) { return p.id === d.id; }); pe.isSuspended = true; pe.substitutionReason = "Exercice passé"; }); render(); },
    restPause: function () { var r = ui.full.rest; if (r.paused != null) { r.endsAt = now() + r.paused * 1000; r.paused = null; } else r.paused = Math.max(0, (r.endsAt - now()) / 1000); render(); },
    restSkip: function () { ui.full.rest = null; render(); },
    finishWorkout: function (d) {
      if (d.partial === "1" && !confirm("Terminer maintenant ? Les séries confirmées sont conservées ; la séance sera enregistrée comme partielle.")) return;
      openSheet({ type: "feedback", id: ui.full.id, f: feedbackForm(E.findSession(db, ui.full.id), d.partial === "1") });
    },
    quitFull: function () { quitFull(); },
    warm: function () {},
    subReason: function (d) { topSheet().reason = d.v; render(); },
    subApply: function (d) {
      var sh = topSheet(), why = sh.reason;
      commit(function (x) {
        var s = E.findSession(x, sh.sid), pe = s.plannedExercises.find(function (p) { return p.id === sh.pid; }), e = E.exercise(d.id), orig = pe.exerciseID;
        pe.substitutedFrom = pe.substitutedFrom || orig; pe.substitutionReason = why; pe.exerciseID = e.id; pe.family = e.family;
        var sg = E.suggest(x, x.profile, e.id, pe.repMin, pe.repMax, pe.sets, pe.targetRIR); pe.suggestedLoadKg = sg.load; pe.progressionNote = sg.note;
        if (why === "Gêne sur ce mouvement") x.painReports.push({ id: E.uid(), date: now(), exerciseID: orig, skillID: null, note: "Signalée lors d'un remplacement", isResolved: false, resolvedAt: null });
      });
      if (ui.full && ui.full.drafts) delete ui.full.drafts[sh.pid];
      closeSheet();
    },
    painSave: function (d) {
      var sh = topSheet(), all = d.all === "1", note = sh.f.note.trim() || "Gêne signalée pendant la séance";
      commit(function (x) {
        var s = E.findSession(x, sh.sid), pe = s.plannedExercises.find(function (p) { return p.id === sh.pid; });
        x.painReports.push({ id: E.uid(), date: now(), exerciseID: pe.exerciseID, skillID: null, note: note, isResolved: false, resolvedAt: null });
        s.plannedExercises.forEach(function (p) {
          var has = s.sets.some(function (z) { return z.plannedExerciseID === p.id && !z.isWarmup; });
          if (p.id === pe.id || (all && !has)) p.isSuspended = true;
        });
      });
      closeSheet();
      if (all) A.finishWorkout({ partial: "0" });
    },

    // Séance martiale
    rdStage: function (d) { ui.full.stage = d.v; persistRound(); window.scrollTo(0, 0); render(); },
    rdStart: function () {
      var f = ui.full, s = E.findSession(db, f.id), t = now();
      unlockAudio();
      f.timer = E.timerNew(Math.max(1, s.plannedRounds), Math.max(30, s.roundSeconds), s.restSeconds);
      E.tStart(f.timer, t);
      f.lastObs = 0; f.lastTick = t; f.stage = "rounds"; f.nextCallAt = t + 8000;
      beep("start"); speak("Round 1"); keepAwake(true); persistRound(); render();
    },
    rdPause: function () {
      var f = ui.full, t = now();
      if (E.tPaused(f.timer)) { E.tResume(f.timer, t); f.nextCallAt = t + 4000; } else { E.tPause(f.timer, t); f.call = null; }
      f.lastTick = t; persistRound(); render();
    },
    rdSkip: function () {
      var f = ui.full, t = now(), sk = E.tSkip(f.timer, t);
      if (sk && sk.phase.kind === "round") recordRound(f.id, sk.phase.round, sk.phase.seconds, Math.round(sk.done), false, false);
      var pos = E.tPosition(f.timer, t);
      f.lastObs = pos.index; f.lastTick = t; persistRound();
      if (pos.finished) finishRounds(); else render();
    },
    rdStop: function () {
      if (!confirm("Arrêter la séance ? Les rounds terminés sont conservés ; la séance sera enregistrée comme partielle.")) return;
      var f = ui.full, t = now();
      if (f.timer) {
        var pos = E.tPosition(f.timer, t);
        if (pos.phase && pos.phase.kind === "round" && pos.elapsed >= 5) recordRound(f.id, pos.phase.round, pos.phase.seconds, Math.round(pos.elapsed), false, false);
        E.tStop(f.timer, t);
      }
      f.stopped = true; f.stage = "cooldown"; f.call = null; keepAwake(false); persistRound(); render();
    },
    rdFinish: function () {
      var f = ui.full, s = E.findSession(db, f.id), done = E.completedRounds(s), ids = f.practiced.slice();
      commit(function (x) {
        ids.forEach(function (id) {
          var p = x.skills[id] || { skillID: id, state: 0, validatedBy: null, practicedRounds: 0, difficulties: "", updatedAt: now() };
          if (p.state < 2) p.state = 2;
          p.practicedRounds = (p.practicedRounds || 0) + done; p.updatedAt = now();
          x.skills[id] = p;
        });
      });
      openSheet({ type: "feedback", id: f.id, f: feedbackForm(s, f.stopped) });
    },
    absValidate: function () {
      var sh = topSheet(), f = ui.full;
      sh.checked.forEach(function (n) {
        var ph = f.timer.phases.find(function (p) { return p.kind === "round" && p.round === n; });
        recordRound(f.id, n, ph ? ph.seconds : 0, ph ? ph.seconds : 0, true, true);
      });
      ui.sheets.pop();
      if (E.tPosition(f.timer, now()).finished) finishRounds(); else { persistRound(); render(); }
    },

    // Retour de séance
    fbMin: function (d) { var f = ui.sheetF; f.minutes = Math.max(1, Math.min(240, f.minutes + +d.v)); render(); },
    fbRpe: function (d) { ui.sheetF.rpe = d.v === "" ? null : +d.v; render(); },
    fbFatigue: function (d) { ui.sheetF.fatigue = d.v === "" ? null : +d.v; render(); },
    fbInt: function (d) { ui.sheetF.intensity = d.v || null; render(); },
    fbSave: function () {
      var sh = topSheet(), f = sh.f;
      commit(function (x) {
        var s = E.findSession(x, sh.id);
        if (!s || !E.isOpen(s)) return; // une séance réalisée n'est jamais réécrite
        s.status = f.partial ? "partial" : "completed";
        if (!s.startedAt) s.startedAt = now() - f.minutes * 60000;
        s.endedAt = now(); s.actualMinutes = f.minutes; s.rpe = f.rpe; s.fatigue = f.fatigue; s.intensity = f.intensity;
        s.discomfort = f.discomfort.trim() || null; s.toWork = f.toWork.trim();
        if (f.notes.trim()) s.notes = s.notes ? s.notes + "\n" + f.notes.trim() : f.notes.trim();
        s.updatedAt = now();
      });
      try { localStorage.removeItem(TKEY + sh.id); } catch (e) { /* rien */ }
      ui.sheets = []; ui.full = null; keepAwake(false);
      if (window.speechSynthesis) speechSynthesis.cancel();
      toast("Séance enregistrée. Beau travail.");
      render();
    },

    // Saisie externe
    logMin: function (d) { var f = ui.sheetF; f.minutes = Math.max(5, Math.min(240, f.minutes + +d.v)); render(); },
    logRpe: function (d) { ui.sheetF.rpe = d.v === "" ? null : +d.v; render(); },
    logInt: function (d) { ui.sheetF.intensity = d.v || null; render(); },
    logSave: function () {
      var f = ui.sheetF, date = new Date(f.date).getTime();
      if (!date || date > now() + 60000) { toast("Choisis une date passée."); return; }
      commit(function (x) { E.logExternal(x, { discipline: f.discipline, date: date, minutes: f.minutes, rpe: f.rpe, intensity: f.intensity, notes: f.notes }); });
      closeSheet(); toast("Séance ajoutée au calendrier commun.");
    },

    // Calendrier
    calPast: function (d) { ui.calPast = d.v === "1"; render(); },
    cancelSession: function (d) {
      if (!confirm("Annuler cette séance ?")) return;
      commit(function (x) { var s = E.findSession(x, d.id); s.status = "skipped"; s.updatedAt = now(); });
      closeSheet();
    },

    // Exercices et compétences
    resolvePain: function (d) { commit(function (x) { var p = x.painReports.find(function (r) { return r.id === d.id; }); p.isResolved = true; p.resolvedAt = now(); }); render(); },
    skillState: function (d) {
      var sh = topSheet(), diff = sh.diff || "";
      commit(function (x) {
        var p = x.skills[d.id] || { skillID: d.id, state: 0, validatedBy: null, practicedRounds: 0, difficulties: "", updatedAt: now() };
        var v = +d.v;
        if (v === 0) { p.state = 0; p.validatedBy = null; }
        else if (v === 3) { p.state = 3; p.validatedBy = d.by === "coach" ? "coach" : "selfAssessed"; }
        else if (p.state < v) p.state = v;
        p.difficulties = diff; p.updatedAt = now();
        x.skills[d.id] = p;
      });
      toast("Progression enregistrée."); render();
    },
    skillPain: function (d) { commit(function (x) { x.painReports.push({ id: E.uid(), date: now(), exerciseID: null, skillID: d.id, note: "Gêne signalée depuis le parcours", isResolved: false, resolvedAt: null }); }); toast(E.DISCOMFORT); render(); },
    skillLevel: function (d) { ui.skillLevel = +d.v; render(); },

    // Réglages et données
    setTheme: function (d) { commit(function (x) { x.settings.theme = d.v; }); render(); },
    revert: function (d) { commit(function (x) { E.revert(x, d.id); }); render(); },
    addPlaylist: function () {
      var f = ui.sheetF;
      if (!f.name.trim() || !/^https:\/\/((www|m|music)\.)?(youtube\.com|youtu\.be)\//i.test(f.url)) { toast("Renseigne un nom et un lien YouTube https://"); return; }
      commit(function (x) { x.playlists.push({ id: E.uid(), name: f.name.trim(), url: f.url.trim(), app: space() }); });
      f.name = ""; f.url = ""; render();
    },
    delPlaylist: function (d) { commit(function (x) { x.playlists = x.playlists.filter(function (p) { return p.id !== d.id; }); }); render(); },
    doExport: function () {
      var pw = ui.sheetF.pw;
      if (pw.length < 8) { toast("Mot de passe trop court (8 caractères minimum)."); return; }
      encrypt(JSON.stringify(db), pw).then(function (blobText) {
        var name = "baki-alghul-" + isoDate(now()) + ".arena";
        var file = new File([blobText], name, { type: "application/octet-stream" });
        var done = function () { commit(function (x) { x.lastExport = now(); }); closeSheet(); toast("Archive créée. Teste une restauration avant de changer de téléphone."); };
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: name }).then(done).catch(function (e) { if (e && e.name !== "AbortError") download(file, name, done); });
        } else download(file, name, done);
      }).catch(function () { toast("Chiffrement impossible sur cet appareil."); });
    },
    importMode: function (d) { ui.sheetF.mode = d.v; render(); },
    doImport: function () {
      var sh = topSheet();
      decrypt(sh.text, sh.f.pw).then(function (plain) {
        var incoming = E.validateDB(JSON.parse(plain));
        if (!db || sh.f.mode === "replace") {
          incoming.revision = Math.max(incoming.revision || 0, db ? db.revision : 0) + 1;
          localStorage.setItem(KEY, JSON.stringify(incoming)); db = incoming; loadError = null;
          toast("Archive restaurée (" + incoming.sessions.length + " séances).");
        } else {
          var r = null;
          commit(function (x) { r = E.merge(incoming, x); });
          toast("Import terminé : " + r.added + " ajouté(s), " + r.updated + " mis à jour, " + r.duplicates + " doublon(s) ignoré(s).");
        }
        ui.sheets = []; render();
      }).catch(function (e) { toast(e && e.message && e.message.indexOf("version") >= 0 ? e.message : "Mot de passe incorrect ou archive endommagée."); });
    },
    restoreBackup: function () {
      try {
        var raw = localStorage.getItem(BAK);
        if (!raw) throw new Error("Aucune copie disponible.");
        var d = E.validateDB(JSON.parse(raw));
        localStorage.setItem(KEY, raw); db = d; loadError = null; toast("Dernière copie valide restaurée."); render();
      } catch (e) { toast((e.message || "Copie illisible") + " Importe une archive si tu en as une."); }
    },
    resetAll: function () {
      if (!confirm("Supprimer le profil, l'historique et les réglages de cet iPhone ? Les archives déjà exportées restent à supprimer séparément.")) return;
      Object.keys(localStorage).forEach(function (k) { if (k.indexOf("arena.") === 0) localStorage.removeItem(k); });
      db = E.emptyDB(); loadError = null; ui = Object.assign(ui, { tab: "today", sheets: [], full: null, ob: null, edit: null, prop: null });
      render();
    },
    reactTap: function () {
      var r = topSheet().r;
      if (r.phase === "ready" || r.phase === "tooSoon") {
        r.phase = "waiting"; render();
        r.timer = setTimeout(function () { r.phase = "go"; r.t0 = performance.now(); render(); }, 1500 + Math.random() * 2500);
      } else if (r.phase === "waiting") { clearTimeout(r.timer); r.phase = "tooSoon"; render(); }
      else if (r.phase === "go") { r.results.push(performance.now() - r.t0); r.phase = r.results.length >= 5 ? "done" : "ready"; render(); }
    },
    reactSave: function (d) {
      commit(function (x) { x.profile.assessment.push({ id: E.uid(), app: "alghul", key: "reaction_test", label: "Test de réactivité sur écran", value: d.m + " ms (médiane de 5 essais)", source: "entered", date: now() }); });
      closeSheet(); toast("Résultat enregistré.");
    }
  };

  // Changements de champs (cases, heures, fichiers)
  var CHANGE = {
    equip: function (d, el) { var p = draft(d.t); var i = p.equipment.indexOf(d.e); if (el.checked && i < 0) p.equipment.push(d.e); if (!el.checked && i >= 0) p.equipment.splice(i, 1); saveOnboarding(); },
    slotTime: function (d, el) { var v = el.value.split(":"); if (v.length === 2) draft(d.t).slots[+d.i].startMinutes = (+v[0]) * 60 + (+v[1]); saveOnboarding(); },
    ciEx: function (d, el) { var ids = ui.sheetF.ids, i = ids.indexOf(d.v); if (el.checked && i < 0) ids.push(d.v); if (!el.checked && i >= 0) ids.splice(i, 1); },
    warm: function (d, el) { var w = ui.full.warm, v = +d.v, i = w.indexOf(v); if (el.checked && i < 0) w.push(v); if (!el.checked && i >= 0) w.splice(i, 1); persistRound(); },
    practiced: function (d, el) { var w = ui.full.practiced, i = w.indexOf(d.v); if (el.checked && i < 0) w.push(d.v); if (!el.checked && i >= 0) w.splice(i, 1); persistRound(); },
    absCheck: function (d, el) { var c = topSheet().checked, v = +d.v, i = c.indexOf(v); if (el.checked && i < 0) c.push(v); if (!el.checked && i >= 0) c.splice(i, 1); },
    lock: function (d, el) { commit(function (x) { var s = E.findSession(x, d.id); s.isLockedByUser = el.checked; s.updatedAt = now(); }); render(); },
    disableEx: function (d, el) {
      commit(function (x) { var l = x.profile.disabledExerciseIDs, i = l.indexOf(d.id); if (el.checked && i < 0) l.push(d.id); if (!el.checked && i >= 0) l.splice(i, 1); x.profile.updatedAt = now(); });
      render();
    },
    setting: function (d, el) { commit(function (x) { x.settings[d.k] = el.checked; }); },
    importFile: function (d, el) {
      var file = el.files && el.files[0];
      if (!file) return;
      file.text().then(function (text) { ui.sheets.push({ type: "import", text: text, f: { pw: "", mode: db ? "merge" : "replace" } }); render(); });
      el.value = "";
    }
  };

  function bindValue(el) {
    var t = el.dataset.type || "str", v;
    if (t === "bool") v = el.checked;
    else if (t === "int") v = parseInt(el.value, 10);
    else if (t === "num") { v = parseFloat(String(el.value).replace(",", ".")); if (isNaN(v)) return; }
    else if (t === "numnull") { v = el.value === "" ? null : parseFloat(String(el.value).replace(",", ".")); if (v != null && isNaN(v)) v = null; }
    else v = el.value;
    setPath(el.dataset.bind, v);
    saveOnboarding();
    if (el.dataset.bind === "form.tone") commit(function (x) { x.settings.tone = v; });
  }

  document.addEventListener("click", function (ev) {
    var el = ev.target.closest("[data-act]");
    if (!el) return;
    var fn = A[el.dataset.act];
    if (!fn) return;
    if (el.tagName === "A") return;
    // Le fond d'une feuille ne réagit qu'à un toucher direct : les champs à l'intérieur gardent leur comportement natif.
    if (el.dataset.act === "sheetBackdrop" && ev.target !== el) return;
    ev.preventDefault();
    fn(el.dataset, el, ev);
  });
  document.addEventListener("input", function (ev) {
    var el = ev.target;
    if (el.dataset.bind && el.type !== "checkbox" && el.tagName !== "SELECT") bindValue(el);
    if (el.dataset.search === "lib") { ui.libSearch = el.value; var l = document.getElementById("lib-list"); if (l) l.innerHTML = libList(); }
  });
  document.addEventListener("change", function (ev) {
    var el = ev.target;
    if (el.dataset.bind) { bindValue(el); if (el.dataset.rerender !== undefined || el.tagName === "SELECT" || el.dataset.rerenderChange !== undefined) render(); }
    if (el.dataset.change && CHANGE[el.dataset.change]) CHANGE[el.dataset.change](el.dataset, el);
  });

  // =====================================================================
  // Chiffrement de l'archive (WebCrypto : PBKDF2-SHA256 + AES-GCM)
  // =====================================================================
  function b64(buf) { var s = "", b = new Uint8Array(buf); for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
  function unb64(s) { var bin = atob(s), b = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; }
  function deriveKey(pw, salt) {
    return crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]).then(function (k) {
      return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: 210000, hash: "SHA-256" }, k, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    });
  }
  function encrypt(text, pw) {
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    return deriveKey(pw, salt).then(function (key) { return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, new TextEncoder().encode(text)); })
      .then(function (ct) { return JSON.stringify({ format: "arena-archive-web", version: 1, exportedAt: now(), salt: b64(salt), iv: b64(iv), data: b64(ct) }); });
  }
  function decrypt(text, pw) {
    var o;
    try { o = JSON.parse(text); } catch (e) { return Promise.reject(new Error("Ce fichier n'est pas une archive Baki / Al-ghūl.")); }
    if (!o || o.format !== "arena-archive-web") return Promise.reject(new Error("Ce fichier n'est pas une archive Baki / Al-ghūl."));
    if (o.version > 1) return Promise.reject(new Error("Archive issue d'une version plus récente de l'app."));
    return deriveKey(pw, unb64(o.salt)).then(function (key) { return crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(o.iv) }, key, unb64(o.data)); })
      .then(function (pt) { return new TextDecoder().decode(pt); });
  }
  function download(file, name, done) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    done();
  }

  // =====================================================================
  // Démarrage : séances manquées, matérialisation, hors connexion
  // =====================================================================
  function onForeground() {
    if (!db || !db.profile || !E.activeCycle(db)) return;
    commit(function (x) { E.reconcileMissed(x, now(), space()); E.materialize(x, now(), 14); });
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden && !ui.full) { db = loadDB() || db; onForeground(); render(); } });
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", function () { if (settings().theme === "system") render(); });

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () { /* hors connexion indisponible */ }); });
  }
  var params = new URLSearchParams(location.search);
  if (db && params.get("space") && (params.get("space") === "baki" || params.get("space") === "alghul")) commit(function (x) { x.settings.space = params.get("space"); });
  onForeground();
  render();
  window.__arena = { get db() { return db; }, ui: ui, render: render };
})();
