/*
 * Moteur commun Baki / Al-ghūl — portage JavaScript du socle natif ArenaCore.
 * Logique pure, sans interface ni réseau : profil, planification, adaptation, progression, minuteur, archive.
 * Le moteur s'appelle « adaptation automatique » : aucune IA n'intervient (INT01).
 */
(function (root) {
  "use strict";
  var DATA = typeof module !== "undefined" ? require("./data.js") : root.ARENA_DATA;

  var DAY = 86400000;
  var RULES = DATA.rules;
  var SCHEMA = 1;

  // ---------- Libellés ----------
  var L = {
    discipline: { strength: "Musculation", muayThai: "Muay thaï", swimming: "Natation", club: "Séance de club", mobility: "Mobilité", rest: "Repos" },
    disciplineIcon: { strength: "🏋️", muayThai: "🥊", swimming: "🏊", club: "🤝", mobility: "🧘", rest: "🛌" },
    goal: { hypertrophy: "Hypertrophie", strength: "Force", bodyComposition: "Composition corporelle", mobility: "Mobilité", endurance: "Endurance", martialTechnique: "Technique martiale" },
    level: { 1: "Débutant", 2: "Intermédiaire", 3: "Confirmé" },
    equipment: { bodyweight: "Poids du corps", dumbbells: "Haltères", barbell: "Barre olympique", rack: "Rack / cage", bench: "Banc", pullupBar: "Barre de traction", cable: "Poulie", machines: "Machines guidées", kettlebell: "Kettlebell", bands: "Élastiques", heavyBag: "Sac de frappe", gloves: "Gants", jumpRope: "Corde à sauter", shinGuards: "Protège-tibias", pads: "Paos (avec partenaire)" },
    family: { horizontalPush: "Poussée horizontale", verticalPush: "Poussée verticale", horizontalPull: "Tirage horizontal", verticalPull: "Tirage vertical", squat: "Squat / jambes", hinge: "Charnière de hanche", lunge: "Fente / unilatéral", core: "Gainage", carry: "Porté", arms: "Bras (accessoire)", shoulders: "Épaules (accessoire)", calves: "Mollets (accessoire)" },
    domain: { stance: "Garde et appuis", footwork: "Déplacements", strikes: "Gestes fondamentaux", defense: "Défenses simples", combinations: "Enchaînements", rhythm: "Rythme et distance", conditioning: "Condition physique", mobility: "Mobilité" },
    context: { solo: "Seul", partner: "Avec partenaire", supervised: "Sous supervision" },
    status: { planned: "Prévue", inProgress: "En cours", completed: "Terminée", partial: "Partielle", skipped: "Annulée", missed: "Manquée", postponed: "Reportée" },
    statusIcon: { planned: "○", inProgress: "▶", completed: "✓", partial: "◐", skipped: "✕", missed: "–", postponed: "↷" },
    slotPurpose: { free: "Disponible", swimming: "Natation", club: "Club" },
    restriction: { limitation: "Limitation déclarée", pain: "Douleur signalée", professionalInstruction: "Consigne d'un professionnel", avoidMovement: "Mouvement à éviter" },
    source: { entered: "Mesure saisie", observation: "Observation personnelle", estimate: "Estimation calculée", coach: "Évaluation du coach" },
    skillState: { 0: "À découvrir", 1: "Étudiée", 2: "Pratiquée", 3: "Validée" },
    intensity: { light: "Légère", moderate: "Modérée", hard: "Difficile" },
    action: { keep: "Conserver", lighten: "Alléger", shorten: "Raccourcir", replace: "Remplacer", postpone: "Reporter", reschedule: "Recalculer", suspendExercise: "Suspendre un exercice", returnProtocol: "Retour progressif" },
    stance: { unknown: "Inconnue", orthodox: "Orthodoxe (gauche devant)", southpaw: "Fausse garde (droite devant)" },
    weekday: ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"],
    tone: { direct: "Direct et énergique", sober: "Sobre", minimal: "Messages réduits" }
  };
  var STRENGTH_GOALS = ["hypertrophy", "strength", "bodyComposition"];
  var MARTIAL_GOALS = ["martialTechnique", "mobility", "endurance"];
  var LOWER = ["squat", "hinge", "lunge", "calves"];

  // ---------- Utilitaires ----------
  function uid() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function startOfDay(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function addDays(t, n) { var d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); }
  function weekday(t) { var w = new Date(t).getDay(); return w === 0 ? 7 : w; }
  function startOfWeek(t) { var s = startOfDay(t); return addDays(s, -(weekday(s) - 1)); }
  function sameDay(a, b) { return startOfDay(a) === startOfDay(b); }
  function fmtNum(v) { return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ","); }
  function dur(sec) { var m = Math.floor(sec / 60), s = sec % 60; if (!m) return s + " s"; return s ? m + " min " + s + " s" : m + " min"; }
  function dayLabel(t) {
    return new Date(t).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  }
  function timeLabel(t) { var d = new Date(t); return String(d.getHours()).padStart(2, "0") + "h" + String(d.getMinutes()).padStart(2, "0"); }
  function isOpen(s) { return s.status === "planned" || s.status === "inProgress"; }
  function isDone(s) { return s.status === "completed" || s.status === "partial"; }
  function isCombat(d) { return d === "muayThai" || d === "club"; }
  function isHard(s) { return s.intensity === "hard" || (s.rpe || 0) >= 8; }

  var exIndex = {}, skIndex = {};
  DATA.exercises.forEach(function (e) { exIndex[e.id] = e; });
  DATA.skills.forEach(function (s) { skIndex[s.id] = s; });
  function exercise(id) { return exIndex[id] || null; }
  function skill(id) { return skIndex[id] || null; }
  function exName(id) { var e = exIndex[id]; return e ? e.name : id; }
  function strengthTemplate(id) { return DATA.strength.find(function (t) { return t.id === id; }) || null; }
  function templateForSessions(n) { if (n < 1) return null; if (n <= 2) return DATA.strength[0]; if (n === 3) return DATA.strength[1]; return DATA.strength[2]; }
  function martialTemplate(level) { return DATA.martial[Math.max(0, Math.min(2, level - 1))]; }
  function martialTotal(t) { return t.warmupMinutes + t.techniqueMinutes + t.cooldownMinutes + Math.floor(t.rounds * (t.roundSeconds + t.restSeconds) / 60); }

  // ---------- Modèles par défaut ----------
  function defaultSettings() {
    return { theme: "dark", tone: "direct", voiceCues: true, sounds: true, keepAwake: true, restEndAlerts: true, hasSeenRPEExplanation: false, space: "baki" };
  }
  function emptyDB() {
    return { schemaVersion: SCHEMA, revision: 0, updatedAt: Date.now(), profile: null, cycles: [], sessions: [], checkIns: [], adaptations: [], skills: {}, painReports: [], playlists: [], settings: defaultSettings(), lastExport: null };
  }
  function newProfile() {
    var now = Date.now();
    return { id: uid(), displayName: "", isAdultConfirmed: false, heightCm: null, weightKg: null, strengthExperience: 1, combatExperience: 1, goals: [], equipment: ["bodyweight"], slots: [], preferredSessionMinutes: 60, disabledExerciseIDs: [], restrictions: [], stance: "unknown", hasSupervision: false, barbellIncrementKg: 2.5, dumbbellIncrementKg: 2, machineIncrementKg: 5, assessment: [], createdAt: now, updatedAt: now };
  }
  function newSlot(weekdayN, purpose) {
    var defaults = { free: [18 * 60, 60], swimming: [7 * 60, 45], club: [19 * 60, 90] }[purpose || "free"];
    return { id: uid(), weekday: weekdayN, startMinutes: defaults[0], durationMinutes: defaults[1], purpose: purpose || "free" };
  }
  function newSession(o) {
    return Object.assign({ id: uid(), discipline: "strength", title: "", plannedDate: Date.now(), plannedMinutes: 60, origin: "manual", cycleID: null, cycleRevision: null, blueprintKey: null, slotID: null, status: "planned", startedAt: null, endedAt: null, actualMinutes: null, rpe: null, fatigue: null, discomfort: null, intensity: null, notes: "", toWork: "", plannedExercises: [], sets: [], plannedRounds: 0, roundSeconds: 0, restSeconds: 0, roundFocus: [], rounds: [], skillIDs: [], adaptationNote: null, isLockedByUser: false, isMandatory: true, updatedAt: Date.now() }, o);
  }
  function freeSlots(p) { return p.slots.filter(function (s) { return s.purpose === "free"; }).sort(chrono); }
  function chrono(a, b) { return a.weekday === b.weekday ? a.startMinutes - b.startMinutes : a.weekday - b.weekday; }
  function activeCycle(db) { return db.cycles.find(function (c) { return c.isActive; }) || null; }
  function findSession(db, id) { return db.sessions.find(function (s) { return s.id === id; }) || null; }
  function upsert(db, s) {
    s.updatedAt = Date.now();
    var i = db.sessions.findIndex(function (x) { return x.id === s.id; });
    if (i >= 0) db.sessions[i] = s; else db.sessions.push(s);
  }
  function sessionsOn(db, day) { return db.sessions.filter(function (s) { return sameDay(s.plannedDate, day); }).sort(function (a, b) { return a.plannedDate - b.plannedDate; }); }
  function activePain(db, exerciseID, skillID) {
    for (var i = db.painReports.length - 1; i >= 0; i--) {
      var p = db.painReports[i];
      if (!p.isResolved && ((exerciseID && p.exerciseID === exerciseID) || (skillID && p.skillID === skillID))) return p;
    }
    return null;
  }
  function history(db, exerciseID) {
    return db.sessions.filter(function (s) { return isDone(s) || s.status === "inProgress"; })
      .map(function (s) { return { session: s, sets: s.sets.filter(function (x) { return x.exerciseID === exerciseID; }) }; })
      .filter(function (h) { return h.sets.length; })
      .sort(function (a, b) { return (a.session.startedAt || a.session.plannedDate) - (b.session.startedAt || b.session.plannedDate); });
  }
  function completedRounds(s) { return s.rounds.filter(function (r) { return r.completed; }).length; }
  function workingSets(s) { return s.sets.filter(function (x) { return !x.isWarmup; }); }

  // ---------- Filtre de contenu ----------
  function Filter(profile, db) { this.p = profile; this.db = db; }
  Filter.prototype.available = function () { var a = this.p.equipment.slice(); if (a.indexOf("bodyweight") < 0) a.push("bodyweight"); return a; };
  Filter.prototype.blockingReason = function (e) {
    var av = this.available();
    if (!e.equipment.every(function (x) { return av.indexOf(x) >= 0; })) return "Matériel indisponible";
    if (this.p.disabledExerciseIDs.indexOf(e.id) >= 0) return "Mouvement désactivé";
    var r = this.p.restrictions.find(function (r) { return r.isActive && (r.blockedFamilies.indexOf(e.family) >= 0 || r.blockedExerciseIDs.indexOf(e.id) >= 0); });
    if (r) return "Restriction : " + r.text;
    if (activePain(this.db, e.id)) return "Douleur signalée";
    return null;
  };
  Filter.prototype.isAllowed = function (e) { return this.blockingReason(e) === null; };
  Filter.prototype.pick = function (slot, excluding) {
    var self = this;
    var preferred = slot.preferred.map(exercise).filter(Boolean);
    var others = DATA.exercises.filter(function (e) { return e.family === slot.family && slot.preferred.indexOf(e.id) < 0; });
    var cands = preferred.concat(others).filter(function (e) { return self.isAllowed(e) && excluding.indexOf(e.id) < 0; });
    var lvl = this.p.strengthExperience;
    return cands.find(function (e) { return e.level <= lvl; }) || cands.find(function (e) { return e.level <= lvl + 1; }) || null;
  };
  Filter.prototype.substitutes = function (exerciseID) {
    var self = this, base = exercise(exerciseID);
    if (!base) return [];
    var all = DATA.exercises.filter(function (e) { return e.family === base.family && e.id !== base.id && self.isAllowed(e); });
    var listed = base.alternatives.map(function (id) { return all.find(function (e) { return e.id === id; }); }).filter(Boolean);
    return listed.concat(all.filter(function (e) { return base.alternatives.indexOf(e.id) < 0; }));
  };
  Filter.prototype.skillBlockingReason = function (s) {
    var av = this.available();
    if (!s.equipment.every(function (x) { return av.indexOf(x) >= 0; })) return "Matériel indisponible";
    var r = this.p.restrictions.find(function (r) { return r.isActive && r.blockedSkillIDs.indexOf(s.id) >= 0; });
    if (r) return "Restriction : " + r.text;
    if (activePain(this.db, null, s.id)) return "Douleur signalée";
    if (s.context !== "solo" && !this.p.hasSupervision) return "Exige : " + L.context[s.context].toLowerCase() + " — non prescrit seul";
    return null;
  };
  Filter.prototype.isAllowedSolo = function (s) { return s.context === "solo" && this.skillBlockingReason(s) === null; };
  Filter.prototype.state = function (id) { var p = this.db.skills[id]; return p ? p.state : 0; };
  Filter.prototype.prerequisitesMet = function (s) { var self = this; return s.prerequisites.every(function (id) { return self.state(id) >= 2; }); };
  Filter.prototype.nextSkills = function (limit) {
    var self = this, lvl = this.p.combatExperience;
    var pool = DATA.skills.filter(function (s) { return self.isAllowedSolo(s) && s.level <= lvl && self.state(s.id) < 3; });
    var unlocked = pool.filter(function (s) { return self.prerequisitesMet(s); });
    unlocked.sort(function (a, b) { var x = self.state(a.id), y = self.state(b.id); return x === y ? a.level - b.level : x - y; });
    if (unlocked.length) return unlocked.slice(0, limit);
    return pool.filter(function (s) { return !s.prerequisites.length; }).slice(0, limit);
  };
  Filter.prototype.allowedCombos = function () {
    var self = this, lvl = this.p.combatExperience;
    return DATA.combos.filter(function (c) {
      return c.level <= lvl && c.skillIDs.every(function (id) {
        var s = skill(id);
        return s && self.isAllowedSolo(s) && (self.state(id) >= 1 || s.level === 1);
      });
    });
  };

  // ---------- Progression (BAK05) ----------
  function stepFor(e, p) {
    switch (e.loadType) {
      case "barbell": return p.barbellIncrementKg;
      case "dumbbell": case "kettlebell": return p.dumbbellIncrementKg;
      case "machine": return p.machineIncrementKg;
      default: return null;
    }
  }
  function roundToAvailable(load, step) { if (!step) return load; return Math.max(0, Math.floor(load / step + 1e-9) * step); }
  function suggest(db, profile, exerciseID, repMin, repMax, sets, targetRIR) {
    var e = exercise(exerciseID), hist = history(db, exerciseID), last = hist[hist.length - 1];
    if (!last) return { load: null, inc: false, pain: false, note: "Première fois : choisis une charge qui laisse environ 3 répétitions en réserve." };
    var w = last.sets.filter(function (x) { return !x.isWarmup; });
    if (!w.length) return { load: null, inc: false, pain: false, note: "Aucune série de travail enregistrée." };
    var loads = w.map(function (x) { return x.loadKg; }).filter(function (x) { return x != null; });
    var lastLoad = loads.length ? Math.max.apply(null, loads) : null;
    if (activePain(db, exerciseID)) return { load: lastLoad, inc: false, pain: true, note: "Proposition automatique bloquée : une douleur a été signalée sur ce mouvement." };
    var allTop = w.length >= sets && w.every(function (x) { return x.reps >= repMax; });
    var anyBelow = w.some(function (x) { return x.reps < repMin; });
    var effortOK = true, effortKnown = w.every(function (x) { return x.rir != null || x.rpe != null; });
    if (targetRIR != null) {
      var rirs = w.map(function (x) { return x.rir; }).filter(function (x) { return x != null; });
      if (rirs.length === w.length) effortOK = Math.min.apply(null, rirs) >= targetRIR - 1;
    }
    var step = e ? stepFor(e, profile) : null;
    if (!step || lastLoad == null) {
      return allTop ? { load: null, inc: false, pain: false, note: "Haut de fourchette atteint : ajoute 1 à 2 répétitions ou passe à une variante plus difficile." }
        : { load: null, inc: false, pain: false, note: "Vise " + repMax + " répétitions sur chaque série." };
    }
    if (allTop && effortOK) {
      var next = roundToAvailable(lastLoad + step, step);
      return { load: next, inc: next > lastLoad, pain: false, note: "Conditions remplies : +" + fmtNum(step) + " kg proposés" + (effortKnown ? "." : " (effort non renseigné : reste attentif à la technique).") };
    }
    if (anyBelow) return { load: lastLoad, inc: false, pain: false, note: "Consolide : atteins " + repMin + " répétitions sur toutes les séries avant d'augmenter." };
    return { load: lastLoad, inc: false, pain: false, note: "Même charge : vise " + repMax + " répétitions sur chaque série." };
  }
  function bestSet(db, exerciseID) {
    var all = [];
    history(db, exerciseID).forEach(function (h) { h.sets.forEach(function (x) { if (!x.isWarmup) all.push(x); }); });
    all.sort(function (a, b) { return (b.loadKg || 0) - (a.loadKg || 0) || b.reps - a.reps; });
    return all[0] || null;
  }

  // ---------- Planification (PLN01, PRO03) ----------
  function propose(profile, db, start, weeks, origin) {
    weeks = weeks || 4;
    var warnings = [], rationale = [], free = freeSlots(profile), n = free.length;
    var goals = profile.goals;
    var wantsS = !goals.length || goals.some(function (g) { return STRENGTH_GOALS.indexOf(g) >= 0; });
    var wantsM = !goals.length || goals.some(function (g) { return MARTIAL_GOALS.indexOf(g) >= 0; });
    var sFirst = goals.length ? STRENGTH_GOALS.indexOf(goals[0]) >= 0 : true;
    var s = 0, m = 0;
    if (wantsS && !wantsM) { s = Math.min(n, 4); m = n - s; }
    else if (!wantsS && wantsM) { m = n; }
    else if (n === 1) { if (sFirst) s = 1; else m = 1; }
    else if (n >= 2) { s = Math.round(n * (sFirst ? 0.6 : 0.4)); s = Math.min(Math.max(s, 1), n - 1, 4); m = n - s; }
    var tpl = templateForSessions(s), mt = martialTemplate(profile.combatExperience);
    var kinds = [], rs = s, rm = m, nextS = sFirst;
    while (rs + rm > 0) { if ((nextS && rs > 0) || rm === 0) { kinds.push("strength"); rs--; } else { kinds.push("muayThai"); rm--; } nextS = !nextS; }
    var plan = [], bi = 0;
    free.forEach(function (slot, i) {
      if (i >= kinds.length) return;
      var minutes = Math.min(slot.durationMinutes, profile.preferredSessionMinutes);
      if (kinds[i] === "strength" && tpl) { plan.push({ slot: slot, discipline: "strength", blueprintKey: tpl.blueprints[bi % tpl.blueprints.length].key, minutes: minutes }); bi++; }
      else plan.push({ slot: slot, discipline: "muayThai", blueprintKey: null, minutes: minutes });
    });
    profile.slots.filter(function (x) { return x.purpose !== "free"; }).forEach(function (slot) {
      plan.push({ slot: slot, discipline: slot.purpose === "swimming" ? "swimming" : "club", blueprintKey: null, minutes: slot.durationMinutes });
    });
    plan.sort(function (a, b) { return chrono(a.slot, b.slot); });
    if (!n) warnings.push("Aucun créneau disponible : ajoute au moins un créneau pour générer des séances.");
    if (tpl) rationale.push(s + " séance(s) de musculation — modèle « " + tpl.name + " ». " + tpl.rationale);
    if (m > 0) rationale.push(m + " séance(s) guidée(s) de Muay thaï — jusqu'à " + mt.rounds + " rounds de " + dur(mt.roundSeconds) + " (niveau " + L.level[profile.combatExperience].toLowerCase() + ").");
    var swims = profile.slots.filter(function (x) { return x.purpose === "swimming"; }).length;
    var clubs = profile.slots.filter(function (x) { return x.purpose === "club"; }).length;
    if (swims) rationale.push(swims + " créneau(x) de natation conservé(s) tels que déclarés.");
    if (clubs) rationale.push(clubs + " séance(s) de club intégrée(s) au calendrier commun.");
    if (goals.length) rationale.push("Priorité principale : " + L.goal[goals[0]].toLowerCase() + ".");
    rationale.push("Aucune séance obligatoire n'est ajoutée au-delà des " + n + " créneau(x) disponible(s).");
    if (profile.preferredSessionMinutes < 40) warnings.push("Séances courtes : les exercices accessoires seront retirés en priorité.");
    if (profile.restrictions.some(function (r) { return r.isActive; })) rationale.push("Restrictions déclarées appliquées comme filtres (aucun diagnostic).");
    var maxRev = db.cycles.reduce(function (a, c) { return Math.max(a, c.revision); }, 0);
    return {
      cycle: { id: uid(), revision: maxRev + 1, startDate: startOfDay(start), weeks: weeks, strengthTemplateID: tpl ? tpl.id : null, martialLevel: profile.combatExperience, plan: plan, rulesVersion: RULES, catalogVersion: DATA.version, rationale: rationale, isActive: false, createdAt: Date.now(), createdBy: origin },
      warnings: warnings
    };
  }
  function cycleEnd(c) { return addDays(c.startDate, c.weeks * 7); }

  /** Active un cycle ; refuse une proposition préparée sur un état obsolète (SYN02). */
  function activate(proposal, basedOnActiveRevision, db, now) {
    now = now || Date.now();
    var cur = activeCycle(db), curRev = cur ? cur.revision : null;
    if (curRev !== basedOnActiveRevision) throw new Error("Une version plus récente du programme (révision " + (curRev || 0) + ") a été activée entre-temps. Recharge la proposition.");
    var c = clone(proposal.cycle);
    c.revision = db.cycles.reduce(function (a, x) { return Math.max(a, x.revision); }, 0) + 1;
    c.isActive = true;
    db.cycles.forEach(function (x) { x.isActive = false; });
    var today = startOfDay(now);
    db.sessions = db.sessions.filter(function (s) { return !(s.status === "planned" && s.plannedDate >= today && s.cycleID && !s.isLockedByUser); });
    db.cycles.push(c);
    materialize(db, now, 14);
  }

  function materialize(db, now, days) {
    var c = activeCycle(db), p = db.profile, created = [];
    if (!c || !p) return created;
    var start = Math.max(startOfDay(now || Date.now()), c.startDate), end = cycleEnd(c);
    for (var o = 0; o < (days || 14); o++) {
      var day = addDays(start, o);
      if (day >= end) continue;
      var wd = weekday(day);
      c.plan.forEach(function (ps) {
        if (ps.slot.weekday !== wd) return;
        var exists = db.sessions.some(function (s) { return s.slotID === ps.slot.id && sameDay(s.plannedDate, day); });
        if (exists) return;
        var d = new Date(day); d.setMinutes(ps.slot.startMinutes);
        var s = buildSession(ps, d.getTime(), c, p, db);
        db.sessions.push(s); created.push(s.id);
      });
    }
    return created;
  }

  function buildSession(ps, date, c, p, db) {
    var base = { plannedDate: date, plannedMinutes: ps.minutes, cycleID: c.id, cycleRevision: c.revision, slotID: ps.slot.id };
    if (ps.discipline === "strength") {
      var t = strengthTemplate(c.strengthTemplateID);
      var bp = t ? (t.blueprints.find(function (b) { return b.key === ps.blueprintKey; }) || t.blueprints[0]) : null;
      return newSession(Object.assign(base, { discipline: "strength", title: bp ? bp.title : "Musculation", origin: "baki", blueprintKey: bp ? bp.key : null, plannedExercises: bp ? strengthExercises(bp, ps.minutes, p, db) : [] }));
    }
    if (ps.discipline === "muayThai") return martialSession(date, ps.minutes, c, ps.slot.id, p, db);
    return newSession(Object.assign(base, { discipline: ps.discipline, title: L.discipline[ps.discipline], origin: "manual" }));
  }

  function strengthExercises(bp, minutes, p, db) {
    var f = new Filter(p, db), used = [], list = [];
    bp.slots.forEach(function (slot, i) {
      var e = f.pick(slot, used);
      if (!e) return;
      used.push(e.id);
      var warm = slot.isMain && e.loadType !== "bodyweight" && e.loadType !== "band" ? (i === 0 ? 2 : 1) : 0;
      var sg = suggest(db, p, e.id, slot.repMin, slot.repMax, slot.sets, slot.targetRIR);
      list.push({ id: uid(), exerciseID: e.id, family: e.family, isMain: slot.isMain, sets: slot.sets, repMin: slot.repMin, repMax: slot.repMax, restSeconds: slot.restSeconds, targetRIR: slot.targetRIR, warmupSets: warm, suggestedLoadKg: sg.load, progressionNote: sg.note, substitutedFrom: null, substitutionReason: null, isSuspended: false });
    });
    return fit(list, minutes);
  }
  function estimatedMinutes(list) {
    var w = list.filter(function (x) { return !x.isSuspended; }).reduce(function (a, x) { return a + x.sets * (45 + x.restSeconds) / 60 + x.warmupSets * 1.5; }, 0);
    return Math.ceil(8 + w);
  }
  function fit(input, minutes) {
    var list = input.slice();
    function lastAcc() { for (var i = list.length - 1; i >= 0; i--) if (!list[i].isMain) return i; return -1; }
    while (estimatedMinutes(list) > minutes && lastAcc() >= 0) list.splice(lastAcc(), 1);
    var g = 0;
    while (estimatedMinutes(list) > minutes && g++ < 20) {
      var idx = -1, mx = 2;
      list.forEach(function (x, i) { if (x.sets > mx) { mx = x.sets; idx = i; } });
      if (idx < 0) break;
      list[idx] = Object.assign({}, list[idx], { sets: list[idx].sets - 1 });
    }
    while (estimatedMinutes(list) > minutes && list.length > 2) list.pop();
    return list;
  }

  function martialSession(date, minutes, c, slotID, p, db) {
    var t = martialTemplate(p.combatExperience), f = new Filter(p, db), skills = f.nextSkills(2);
    var rounds = t.rounds, fixed = t.warmupMinutes + t.techniqueMinutes + t.cooldownMinutes;
    while (rounds > 2 && fixed + Math.floor(rounds * (t.roundSeconds + t.restSeconds) / 60) > minutes) rounds--;
    var hasBag = p.equipment.indexOf("heavyBag") >= 0 && p.equipment.indexOf("gloves") >= 0;
    var focus = [];
    for (var r = 0; r < rounds; r++) {
      var name = skills.length ? skills[r % skills.length].name.toLowerCase() : "garde et déplacements";
      if (r < 2 || !hasBag) focus.push(r === 0 ? "Shadow : déplacements + " + name : "Shadow guidé : " + name);
      else focus.push("Sac : " + name + ", technique propre");
    }
    return newSession({ discipline: "muayThai", title: skills.length ? "Muay thaï — " + skills[0].name : "Muay thaï — fondations", plannedDate: date, plannedMinutes: minutes, origin: "alghul", cycleID: c ? c.id : null, cycleRevision: c ? c.revision : null, slotID: slotID, plannedRounds: rounds, roundSeconds: t.roundSeconds, restSeconds: t.restSeconds, roundFocus: focus, skillIDs: skills.map(function (s) { return s.id; }) });
  }

  /** Séances passées non réalisées → manquées ; la suivante reprend le contenu, sans doubler (T04). */
  function reconcileMissed(db, now, origin) {
    var today = startOfDay(now || Date.now()), out = [];
    db.sessions.forEach(function (s) {
      if (s.status !== "planned" || s.plannedDate >= today) return;
      s.status = "missed"; s.updatedAt = now;
      var c = activeCycle(db), p = db.profile;
      if (s.discipline !== "strength" || !s.blueprintKey || !c || !p || s.cycleID !== c.id) return;
      var weekEnd = addDays(startOfWeek(s.plannedDate), 7);
      var next = db.sessions.filter(function (x) { return x.discipline === "strength" && x.status === "planned" && x.plannedDate >= today && x.plannedDate < weekEnd && !x.isLockedByUser && x.blueprintKey !== s.blueprintKey; })
        .sort(function (a, b) { return a.plannedDate - b.plannedDate; })[0];
      var t = strengthTemplate(c.strengthTemplateID), bp = t && t.blueprints.find(function (b) { return b.key === s.blueprintKey; });
      if (!next || !bp) return;
      var prev = clone(next);
      next.blueprintKey = bp.key; next.title = bp.title;
      next.plannedExercises = strengthExercises(bp, prev.plannedMinutes, p, db);
      next.adaptationNote = "Séance « " + bp.title + " » manquée : reprise ici, sans doubler le travail.";
      next.updatedAt = now;
      var a = { id: uid(), date: now, sessionID: next.id, action: "reschedule", reason: "La séance du " + dayLabel(s.plannedDate) + " n'a pas été réalisée.", dataUsed: ["Statut de la séance du " + dayLabel(s.plannedDate), "Rotation du modèle " + c.strengthTemplateID], changes: ["« " + prev.title + " » devient « " + bp.title + " »", "Aucune séance supplémentaire ajoutée"], previous: prev, rulesVersion: RULES, decision: "automatic", origin: origin };
      db.adaptations.push(a); out.push(a);
    });
    return out;
  }

  function postpone(db, sessionID, now, origin) {
    var s = findSession(db, sessionID);
    if (!s || !isOpen(s)) return null;
    var prev = clone(s), d0 = new Date(s.plannedDate), target = null;
    for (var d = 1; d <= 4; d++) {
      var day = addDays(startOfDay(Math.max(now, s.plannedDate)), d);
      var busy = db.sessions.some(function (x) { return x.id !== sessionID && x.isMandatory && isOpen(x) && sameDay(x.plannedDate, day); });
      if (!busy) { var t = new Date(day); t.setHours(d0.getHours(), d0.getMinutes()); target = t.getTime(); break; }
    }
    var changes;
    if (target) { s.plannedDate = target; s.adaptationNote = "Reportée au " + dayLabel(target) + "."; changes = ["Séance déplacée au " + dayLabel(target)]; }
    else { s.status = "skipped"; s.adaptationNote = "Aucun créneau libre dans les 4 jours : séance annulée sans report forcé."; changes = ["Séance annulée (aucun créneau libre)"]; }
    s.updatedAt = now;
    var a = { id: uid(), date: now, sessionID: sessionID, action: "postpone", reason: "Report demandé.", dataUsed: ["Calendrier commun des 4 prochains jours"], changes: changes, previous: prev, rulesVersion: RULES, decision: "accepted", origin: origin };
    db.adaptations.push(a);
    return a;
  }

  function logExternal(db, o) {
    var end = o.date + o.minutes * 60000;
    var existing = db.sessions.find(function (s) { return s.discipline === o.discipline && s.status === "planned" && sameDay(s.plannedDate, o.date); });
    if (existing) {
      Object.assign(existing, { status: "completed", startedAt: o.date, endedAt: end, actualMinutes: o.minutes, rpe: o.rpe, intensity: o.intensity, notes: o.notes || "", updatedAt: Date.now() });
      return existing;
    }
    var s = newSession({ discipline: o.discipline, title: L.discipline[o.discipline], plannedDate: o.date, plannedMinutes: o.minutes, origin: "manual", status: "completed", startedAt: o.date, endedAt: end, actualMinutes: o.minutes, rpe: o.rpe, intensity: o.intensity, notes: o.notes || "", isMandatory: false });
    db.sessions.push(s);
    return s;
  }

  function daysSinceLastDone(db, now) {
    var t = db.sessions.filter(isDone).map(function (s) { return s.endedAt || s.plannedDate; });
    if (!t.length) return null;
    return Math.round((startOfDay(now) - startOfDay(Math.max.apply(null, t))) / DAY);
  }

  // ---------- Adaptation avant séance (PLN02) ----------
  var DISCOMFORT = "L'app ne peut pas identifier la cause d'une gêne. Si elle est nouvelle, inhabituelle, persistante ou s'aggrave, arrête l'exercice et demande l'avis d'un professionnel de santé.";

  function lighten(s, changes, loadFactor) {
    if (s.discipline === "strength") {
      s.plannedExercises.forEach(function (pe) {
        if (pe.isSuspended) return;
        pe.sets = Math.max(pe.isMain ? 2 : 1, pe.sets - 1);
        pe.targetRIR = (pe.targetRIR == null ? 2 : pe.targetRIR) + 1;
        if (loadFactor && pe.suggestedLoadKg != null) pe.suggestedLoadKg = Math.floor(pe.suggestedLoadKg * loadFactor * 2) / 2;
      });
      changes.push("Une série de moins par exercice, une répétition en réserve de plus" + (loadFactor ? ", charges réduites d'environ 10 %" : ""));
    } else if (s.discipline === "muayThai") {
      var b = s.plannedRounds;
      s.plannedRounds = Math.max(2, s.plannedRounds - 2);
      s.roundFocus = s.roundFocus.slice(0, s.plannedRounds);
      changes.push("Rounds : " + b + " → " + s.plannedRounds + ", intensité technique");
    }
  }
  function shorten(s, minutes, changes) {
    if (s.discipline === "strength") {
      var b = s.plannedExercises.filter(function (x) { return !x.isSuspended; }).length;
      s.plannedExercises = fit(s.plannedExercises, minutes);
      changes.push("Séance courte : " + b + " → " + s.plannedExercises.filter(function (x) { return !x.isSuspended; }).length + " exercices, accessoires retirés en priorité");
    } else if (s.discipline === "muayThai") {
      var br = s.plannedRounds, r = s.plannedRounds;
      while (r > 2 && (8 + 6 + Math.floor(r * (s.roundSeconds + s.restSeconds) / 60)) > minutes) r--;
      s.plannedRounds = r; s.roundFocus = s.roundFocus.slice(0, r);
      changes.push("Séance courte : rounds " + br + " → " + r);
    }
    s.plannedMinutes = minutes;
  }
  function recentHardCombat(db, date, now) {
    var ref = Math.max(date, now);
    return db.sessions.filter(function (s) {
      var end = s.endedAt || s.plannedDate;
      return isCombat(s.discipline) && isDone(s) && isHard(s) && end <= ref && ref - end <= 30 * 3600000;
    }).sort(function (a, b) { return (b.endedAt || b.plannedDate) - (a.endedAt || a.plannedDate); })[0] || null;
  }
  function lastLoad(db, id) {
    var h = history(db, id), last = h[h.length - 1];
    if (!last) return null;
    var l = last.sets.filter(function (x) { return !x.isWarmup && x.loadKg != null; }).map(function (x) { return x.loadKg; });
    return l.length ? Math.max.apply(null, l) : null;
  }

  function evaluate(session, checkIn, db, now) {
    now = now || Date.now();
    var p = clone(session), reasons = [], data = [], changes = [], actions = [], missing = [], safety = null;
    if (checkIn) {
      if (checkIn.fatigue != null) data.push("Fatigue déclarée : " + checkIn.fatigue + "/5"); else missing.push("Fatigue");
      if (checkIn.sleepHours != null) data.push("Sommeil déclaré : " + fmtNum(checkIn.sleepHours) + " h"); else missing.push("Sommeil (inconnu, pas zéro)");
      if (checkIn.availableMinutes != null) data.push("Temps disponible : " + checkIn.availableMinutes + " min"); else missing.push("Temps disponible");
    } else missing = ["Point du jour non renseigné"];

    if (checkIn && checkIn.discomfortExerciseIDs && checkIn.discomfortExerciseIDs.length && session.discipline === "strength") {
      p.plannedExercises.forEach(function (pe) {
        if (checkIn.discomfortExerciseIDs.indexOf(pe.exerciseID) >= 0) { pe.isSuspended = true; pe.suggestedLoadKg = null; changes.push(exName(pe.exerciseID) + " suspendu"); }
      });
      reasons.push("Gêne signalée sur un ou plusieurs mouvements."); data.push("Gêne déclarée"); actions.push("suspendExercise"); safety = DISCOMFORT;
    } else if (checkIn && checkIn.discomfort && checkIn.discomfort.trim()) {
      lighten(p, changes); reasons.push("Gêne déclarée : séance allégée par prudence."); data.push("Gêne déclarée"); actions.push("lighten"); safety = DISCOMFORT;
    }

    if (checkIn && (checkIn.fatigue || 0) >= 5 && checkIn.sleepHours != null && checkIn.sleepHours < 5) {
      var light = clone(session);
      Object.assign(light, { discipline: "mobility", title: "Mobilité et récupération active", plannedMinutes: Math.min(25, session.plannedMinutes), plannedExercises: [], plannedRounds: 0, roundFocus: [], notes: "Marche légère, mobilité des hanches et des épaules, respiration. Une séance de récupération prévue compte dans ta progression." });
      changes.push("« " + session.title + " » remplacée par « " + light.title + " »");
      reasons.push("Fatigue maximale et sommeil court déclarés.");
      return finish("replace", session, light, reasons, data, changes, missing, safety);
    }

    if (session.discipline === "strength") {
      var hard = recentHardCombat(db, session.plannedDate, now);
      if (hard && p.plannedExercises.some(function (x) { return LOWER.indexOf(x.family) >= 0; })) {
        p.plannedExercises.forEach(function (pe) {
          if (LOWER.indexOf(pe.family) < 0 || pe.isSuspended) return;
          if (pe.sets > 2) pe.sets -= 1;
          pe.targetRIR = Math.max(pe.targetRIR == null ? 2 : pe.targetRIR, 3);
          var ll = lastLoad(db, pe.exerciseID); if (ll != null) pe.suggestedLoadKg = ll;
        });
        changes.push("Jambes : une série de moins, 3 répétitions en réserve minimum, pas de hausse de charge");
        reasons.push("Séance difficile de " + L.discipline[hard.discipline].toLowerCase() + " le " + dayLabel(hard.endedAt || hard.plannedDate) + ".");
        data.push("Séance " + L.discipline[hard.discipline].toLowerCase() + " : effort " + (hard.rpe != null ? hard.rpe + "/10" : "non renseigné") + ", intensité " + (hard.intensity ? L.intensity[hard.intensity].toLowerCase() : "non renseignée"));
        actions.push("lighten");
      }
    }
    if (checkIn && ((checkIn.fatigue || 0) >= 4 || (checkIn.sleepHours != null && checkIn.sleepHours < 6)) && actions.indexOf("lighten") < 0) {
      lighten(p, changes); reasons.push("Fatigue élevée ou sommeil court déclaré."); actions.push("lighten");
    }
    if (checkIn && checkIn.availableMinutes != null && checkIn.availableMinutes < session.plannedMinutes * 0.8) {
      shorten(p, checkIn.availableMinutes, changes); reasons.push("Temps disponible réduit (" + checkIn.availableMinutes + " min au lieu de " + session.plannedMinutes + ")."); actions.push("shorten");
    }
    var days = daysSinceLastDone(db, now);
    if (days != null && days >= 14 && actions.indexOf("lighten") < 0) {
      lighten(p, changes, 0.9); reasons.push("Reprise après " + days + " jours sans séance : retour progressif. Un nouveau point de niveau est conseillé."); data.push("Dernière séance réalisée il y a " + days + " jours"); actions.push("returnProtocol");
    }
    if (session.discipline === "strength" && db.profile) {
      var f = new Filter(db.profile, db);
      p.plannedExercises.forEach(function (pe) {
        if (pe.isSuspended) return;
        var e = exercise(pe.exerciseID);
        if (!e || f.isAllowed(e)) return;
        if (checkIn && checkIn.discomfortExerciseIDs && checkIn.discomfortExerciseIDs.indexOf(e.id) >= 0) return;
        var sub = f.substitutes(e.id)[0], why = f.blockingReason(e);
        if (sub) { pe.substitutedFrom = e.id; pe.substitutionReason = why; pe.exerciseID = sub.id; pe.family = sub.family; pe.suggestedLoadKg = null; changes.push(e.name + " → " + sub.name + " (" + why + ")"); }
        else { pe.isSuspended = true; changes.push(e.name + " suspendu (aucune alternative compatible)"); }
        actions.push("replace");
      });
    }
    var main = ["replace", "suspendExercise", "returnProtocol", "lighten", "shorten"].find(function (a) { return actions.indexOf(a) >= 0; }) || "keep";
    if (main === "keep") reasons.push(missing.length ? "Proposition prudente : séance conservée, informations manquantes affichées." : "Rien ne justifie de modifier la séance.");
    return finish(main, session, p, reasons, data, changes, missing, safety);
  }
  function finish(action, original, proposed, reasons, data, changes, missing, safety) {
    if (action !== "keep") proposed.adaptationNote = reasons.join(" ");
    return { action: action, reasons: reasons, dataUsed: data, changes: changes, missingInfo: missing, original: original, proposed: proposed, requiresExplicitConsent: !!original.isLockedByUser && action !== "keep", safetyMessage: safety };
  }
  function applyProposal(db, proposal, origin, consent, now) {
    var s = findSession(db, proposal.original.id);
    if (!s || !isOpen(s)) return false;
    if (proposal.requiresExplicitConsent && !consent) return false;
    var prev = clone(s), next = clone(proposal.proposed);
    next.updatedAt = now || Date.now();
    db.sessions[db.sessions.indexOf(s)] = next;
    db.adaptations.push({ id: uid(), date: now || Date.now(), sessionID: prev.id, action: proposal.action, reason: proposal.reasons.join(" "), dataUsed: proposal.dataUsed, changes: proposal.changes, previous: prev, rulesVersion: RULES, decision: "accepted", origin: origin });
    return true;
  }
  function refuseProposal(db, proposal, origin) {
    db.adaptations.push({ id: uid(), date: Date.now(), sessionID: proposal.original.id, action: proposal.action, reason: proposal.reasons.join(" "), dataUsed: proposal.dataUsed, changes: proposal.changes, previous: null, rulesVersion: RULES, decision: "refused", origin: origin });
  }
  function revert(db, adaptationID) {
    var a = db.adaptations.find(function (x) { return x.id === adaptationID; });
    if (!a || !a.previous) return false;
    var s = findSession(db, a.previous.id);
    if (!s || !isOpen(s)) return false;
    var r = clone(a.previous); r.updatedAt = Date.now();
    db.sessions[db.sessions.indexOf(s)] = r;
    a.decision = "refused";
    return true;
  }

  // ---------- Paliers (EXP01) ----------
  var TH = [0, 12, 36, 80];
  var TIER_NAMES = { baki: ["Fondations", "Construction", "Puissance", "Maîtrise"], alghul: ["Initiation", "Discipline", "Précision", "Maîtrise"] };
  function bakiPoints(db) {
    return db.sessions.reduce(function (a, s) {
      if (s.discipline === "strength" && s.status === "completed") return a + 1;
      if (s.discipline === "strength" && s.status === "partial") return a + (s.adaptationNote ? 1 : 0.5);
      if ((s.discipline === "swimming" || s.discipline === "mobility") && s.status === "completed") return a + 0.5;
      return a;
    }, 0);
  }
  function alghulPoints(db) {
    var sp = db.sessions.reduce(function (a, s) {
      if (isCombat(s.discipline) && s.status === "completed") return a + 1;
      if (isCombat(s.discipline) && s.status === "partial") return a + (s.adaptationNote ? 1 : 0.5);
      if (s.discipline === "mobility" && s.status === "completed") return a + 0.5;
      return a;
    }, 0);
    return Object.keys(db.skills).reduce(function (a, k) {
      var p = db.skills[k];
      if (p.state === 3) return a + (p.validatedBy === "coach" ? 2 : 1);
      if (p.state === 2) return a + 0.5;
      return a;
    }, sp);
  }
  function tier(points, names) {
    var idx = 0; TH.forEach(function (t, i) { if (points >= t) idx = i; });
    var next = idx + 1 < TH.length ? TH[idx + 1] : null;
    return { name: names[idx], index: idx, points: points, next: next, progress: next == null ? 1 : Math.min(1, Math.max(0, (points - TH[idx]) / (next - TH[idx]))), names: names };
  }
  function tierFor(space, db) { return tier(space === "baki" ? bakiPoints(db) : alghulPoints(db), TIER_NAMES[space]); }

  // ---------- Minuteur d'intervalles fondé sur des dates (IOS01) ----------
  function timerNew(rounds, roundSeconds, restSeconds) {
    var phases = [];
    for (var r = 1; r <= Math.max(1, rounds); r++) {
      phases.push({ kind: "round", round: r, seconds: roundSeconds });
      if (r < rounds && restSeconds > 0) phases.push({ kind: "rest", round: r + 1, seconds: restSeconds });
    }
    return { phases: phases, startedAt: null, pausedAt: null, pausedTotal: 0, skipOffset: 0, stoppedAt: null };
  }
  function tRunning(t) { return t.startedAt != null && t.pausedAt == null && t.stoppedAt == null; }
  function tPaused(t) { return t.pausedAt != null && t.stoppedAt == null; }
  function tStart(t, now) { if (t.startedAt == null) t.startedAt = now; }
  function tPause(t, now) { if (tRunning(t)) t.pausedAt = now; }
  function tResume(t, now) { if (t.pausedAt != null && t.stoppedAt == null) { t.pausedTotal += Math.max(0, now - t.pausedAt); t.pausedAt = null; } }
  function tElapsed(t, now) {
    if (t.startedAt == null) return 0;
    var end = t.stoppedAt != null ? t.stoppedAt : (t.pausedAt != null ? t.pausedAt : now);
    return Math.max(0, (end - t.startedAt - t.pausedTotal) / 1000 + t.skipOffset);
  }
  function tPosition(t, now) {
    var e = tElapsed(t, now);
    for (var i = 0; i < t.phases.length; i++) {
      var d = t.phases[i].seconds;
      if (e < d) return { index: i, phase: t.phases[i], elapsed: e, remaining: d - e, finished: false };
      e -= d;
    }
    return { index: t.phases.length, phase: null, elapsed: 0, remaining: 0, finished: true };
  }
  function tSkip(t, now) {
    var p = tPosition(t, now);
    if (!p.phase) return null;
    t.skipOffset += p.remaining;
    return { phase: p.phase, done: p.elapsed };
  }
  function tStop(t, now) { if (t.stoppedAt == null) t.stoppedAt = t.pausedAt != null ? t.pausedAt : now; }
  /** Rounds terminés pendant l'absence : jamais comptés automatiquement (T03). */
  function tEndedDuringAbsence(t, lastObserved, now) {
    var p = tPosition(t, now), out = [];
    for (var i = lastObserved; i < Math.min(p.index, t.phases.length); i++) if (t.phases[i].kind === "round") out.push(t.phases[i].round);
    return out;
  }

  // ---------- Archive (DAT02) ----------
  function merge(incoming, db) {
    var r = { added: 0, updated: 0, duplicates: 0 };
    function list(key, newer) {
      var cur = db[key], idx = {};
      cur.forEach(function (x, i) { idx[x.id] = i; });
      (incoming[key] || []).forEach(function (x) {
        if (idx[x.id] == null) { cur.push(x); idx[x.id] = cur.length - 1; r.added++; }
        else if (JSON.stringify(cur[idx[x.id]]) === JSON.stringify(x)) r.duplicates++;
        else if (newer && newer(x, cur[idx[x.id]])) { cur[idx[x.id]] = x; r.updated++; }
        else r.duplicates++;
      });
    }
    list("sessions", function (a, b) { return a.updatedAt > b.updatedAt; });
    list("checkIns", function (a, b) { return a.date > b.date; });
    list("adaptations");
    list("painReports", function (a, b) { return (a.resolvedAt || a.date) > (b.resolvedAt || b.date); });
    list("playlists");
    list("cycles");
    var newest = db.cycles.filter(function (c) { return c.isActive; }).sort(function (a, b) { return b.revision - a.revision; })[0];
    if (newest) db.cycles.forEach(function (c) { c.isActive = c.id === newest.id; });
    Object.keys(incoming.skills || {}).forEach(function (k) {
      var p = incoming.skills[k], c = db.skills[k];
      if (!c) { db.skills[k] = p; r.added++; }
      else if (p.updatedAt > c.updatedAt) { db.skills[k] = p; r.updated++; }
      else r.duplicates++;
    });
    if (incoming.profile && (!db.profile || incoming.profile.updatedAt > db.profile.updatedAt)) { db.profile = incoming.profile; r.updated++; }
    return r;
  }
  function validateDB(d) {
    if (!d || typeof d !== "object" || !Array.isArray(d.sessions) || !Array.isArray(d.cycles)) throw new Error("Données illisibles.");
    if ((d.schemaVersion || 0) > SCHEMA) throw new Error("Données issues d'une version plus récente de l'app. Mets l'app à jour.");
    var base = emptyDB();
    Object.keys(base).forEach(function (k) { if (d[k] === undefined) d[k] = base[k]; });
    d.settings = Object.assign(defaultSettings(), d.settings || {});
    return d;
  }

  // ---------- Explications déterministes ----------
  function explain(s, tone) {
    var lines = [];
    if (s.discipline === "strength") {
      var act = s.plannedExercises.filter(function (x) { return !x.isSuspended; });
      lines.push(s.title + " : " + act.length + " exercices, environ " + estimatedMinutes(s.plannedExercises) + " min.");
      var mains = act.filter(function (x) { return x.isMain; }).map(function (x) { return exName(x.exerciseID); });
      if (mains.length) lines.push("Exercices principaux : " + mains.join(", ") + ".");
      var ups = act.filter(function (x) { return (x.progressionNote || "").indexOf("Conditions remplies") === 0; }).map(function (x) { return exName(x.exerciseID); });
      if (ups.length) lines.push("Hausse de charge proposée sur : " + ups.join(", ") + " — tu as atteint le haut de la fourchette.");
    } else if (s.discipline === "muayThai") {
      lines.push(s.title + " : " + s.plannedRounds + " rounds de " + dur(s.roundSeconds) + ", repos " + dur(s.restSeconds) + ".");
      var sk = s.skillIDs.map(skill).filter(Boolean).map(function (x) { return x.name; });
      if (sk.length) lines.push("Compétences travaillées : " + sk.join(", ") + ".");
    } else lines.push(s.title + " — " + s.plannedMinutes + " min.");
    if (s.adaptationNote) lines.push("Adaptation : " + s.adaptationNote);
    if (tone === "direct") lines.push(s.discipline === "muayThai" ? "Le déplacement précède la puissance. Travaille proprement, puis accélère." : "Consolide la technique avant d'augmenter la charge.");
    else if (tone === "sober") lines.push(s.discipline === "muayThai" ? "Reste calme et précis." : "Qualité d'abord.");
    return lines;
  }
  function weekly(db, now) {
    var ws = startOfWeek(now), we = addDays(ws, 7);
    var inW = db.sessions.filter(function (s) { return s.plannedDate >= ws && s.plannedDate < we; });
    var done = inW.filter(isDone), planned = inW.filter(function (s) { return s.isMandatory && s.status !== "skipped"; });
    var out = [done.length + " séance(s) réalisée(s) sur " + planned.length + " prévue(s) cette semaine."];
    var minutes = done.reduce(function (a, s) { return a + (s.actualMinutes || 0); }, 0);
    if (minutes) out.push("Durée totale saisie : " + minutes + " min.");
    var rpes = done.map(function (s) { return s.rpe; }).filter(function (x) { return x != null; });
    if (rpes.length) out.push("Effort perçu moyen : " + fmtNum(Math.round(rpes.reduce(function (a, b) { return a + b; }, 0) / rpes.length * 10) / 10) + "/10.");
    return out;
  }
  function sessionLoad(s) { return s.actualMinutes != null && s.rpe != null ? s.actualMinutes * s.rpe : null; }
  var LOAD_FORMULA = "Charge de séance = durée réelle (min) × effort perçu (0–10). C'est un repère d'entraînement : ce n'est ni une mesure médicale de la récupération, ni la preuve d'une absence de risque.";

  var E = {
    DATA: DATA, L: L, RULES: RULES, SCHEMA: SCHEMA, DISCOMFORT: DISCOMFORT, LOAD_FORMULA: LOAD_FORMULA, TIER_NAMES: TIER_NAMES, LOWER: LOWER,
    uid: uid, clone: clone, startOfDay: startOfDay, addDays: addDays, weekday: weekday, startOfWeek: startOfWeek, sameDay: sameDay,
    fmtNum: fmtNum, dur: dur, dayLabel: dayLabel, timeLabel: timeLabel, isOpen: isOpen, isDone: isDone, isCombat: isCombat,
    exercise: exercise, skill: skill, exName: exName, strengthTemplate: strengthTemplate, martialTemplate: martialTemplate, martialTotal: martialTotal,
    defaultSettings: defaultSettings, emptyDB: emptyDB, newProfile: newProfile, newSlot: newSlot, newSession: newSession, freeSlots: freeSlots,
    activeCycle: activeCycle, findSession: findSession, upsert: upsert, sessionsOn: sessionsOn, activePain: activePain, history: history,
    completedRounds: completedRounds, workingSets: workingSets, Filter: Filter, stepFor: stepFor, roundToAvailable: roundToAvailable,
    suggest: suggest, bestSet: bestSet, propose: propose, cycleEnd: cycleEnd, activate: activate, materialize: materialize,
    strengthExercises: strengthExercises, estimatedMinutes: estimatedMinutes, fit: fit, martialSession: martialSession,
    reconcileMissed: reconcileMissed, postpone: postpone, logExternal: logExternal, daysSinceLastDone: daysSinceLastDone,
    evaluate: evaluate, applyProposal: applyProposal, refuseProposal: refuseProposal, revert: revert,
    bakiPoints: bakiPoints, alghulPoints: alghulPoints, tier: tier, tierFor: tierFor,
    timerNew: timerNew, tRunning: tRunning, tPaused: tPaused, tStart: tStart, tPause: tPause, tResume: tResume, tElapsed: tElapsed,
    tPosition: tPosition, tSkip: tSkip, tStop: tStop, tEndedDuringAbsence: tEndedDuringAbsence,
    merge: merge, validateDB: validateDB, explain: explain, weekly: weekly, sessionLoad: sessionLoad
  };
  if (typeof module !== "undefined") module.exports = E; else root.Engine = E;
})(typeof self !== "undefined" ? self : this);
