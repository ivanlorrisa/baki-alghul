// Tests du moteur web — mêmes scénarios de recette que le socle natif (T01 à T09).
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../engine.js");

const MONDAY = new Date(2026, 9, 19, 8, 0).getTime(); // lundi 19 octobre 2026, 8 h

function profile(opts = {}) {
  const p = E.newProfile();
  p.isAdultConfirmed = true;
  p.strengthExperience = 2;
  p.combatExperience = 1;
  p.goals = ["hypertrophy", "martialTechnique"];
  p.equipment = opts.equipment || ["dumbbells", "bench", "barbell", "rack", "pullupBar", "heavyBag", "gloves"];
  p.preferredSessionMinutes = 75;
  p.slots = (opts.free || [1, 3, 5]).map((d) => Object.assign(E.newSlot(d, "free"), { durationMinutes: 75 }))
    .concat((opts.swim || [2, 6]).map((d) => E.newSlot(d, "swimming")));
  if (opts.restrictions) p.restrictions = opts.restrictions;
  return p;
}
function activeDB(p) {
  const db = E.emptyDB();
  db.profile = p || profile();
  const prop = E.propose(db.profile, db, MONDAY, 4, "baki");
  E.activate(prop, null, db, MONDAY);
  return db;
}
const inWeek = (s) => s.plannedDate >= E.startOfWeek(MONDAY) && s.plannedDate < E.addDays(E.startOfWeek(MONDAY), 7);

test("catalogue complet et cohérent", () => {
  assert.ok(E.DATA.exercises.length >= 40);
  assert.ok(E.DATA.skills.length >= 30);
  E.DATA.exercises.forEach((e) => e.alternatives.forEach((a) => assert.ok(E.exercise(a), a)));
  E.DATA.combos.forEach((c) => c.skillIDs.forEach((id) => assert.ok(E.skill(id), id)));
});

test("T01 — 3 créneaux : 3 séances, jamais 5 ; natation intégrée", () => {
  const db = activeDB();
  const app = db.sessions.filter((s) => inWeek(s) && (s.discipline === "strength" || s.discipline === "muayThai"));
  assert.equal(app.length, 3);
  assert.equal(db.sessions.filter((s) => inWeek(s) && s.discipline === "swimming").length, 2);
  const days = new Set(app.map((s) => E.startOfDay(s.plannedDate)));
  assert.equal(days.size, 3);
});

test("matériel et restrictions respectés", () => {
  const p = profile({ equipment: ["bodyweight"], restrictions: [{ id: "r", kind: "avoidMovement", text: "Pas de squat", blockedFamilies: ["squat"], blockedExerciseIDs: [], blockedSkillIDs: [], isActive: true }] });
  const db = activeDB(p);
  const ex = db.sessions.flatMap((s) => s.plannedExercises);
  assert.ok(ex.length > 0);
  ex.forEach((pe) => {
    const e = E.exercise(pe.exerciseID);
    assert.ok(e.equipment.every((x) => x === "bodyweight"), e.id);
    assert.notEqual(e.family, "squat");
  });
});

test("T03 — rounds écoulés hors écran non comptés ; pause distincte ; skip", () => {
  const t = E.timerNew(4, 120, 60);
  E.tStart(t, MONDAY);
  assert.equal(E.tPosition(t, MONDAY + 30000).index, 0);
  assert.deepEqual(E.tEndedDuringAbsence(t, 0, MONDAY + 420000), [1, 2]);
  const u = E.timerNew(2, 60, 30);
  E.tStart(u, MONDAY);
  E.tPause(u, MONDAY + 20000);
  assert.equal(E.tElapsed(u, MONDAY + 620000), 20);
  E.tResume(u, MONDAY + 620000);
  assert.equal(E.tElapsed(u, MONDAY + 650000), 50);
  const sk = E.tSkip(u, MONDAY + 650000);
  assert.equal(sk.phase.kind, "round");
  assert.equal(E.tPosition(u, MONDAY + 650000).phase.kind, "rest");
});

test("T04 — séance manquée sans doublement, rotation annulable", () => {
  const db = activeDB();
  const before = db.sessions.filter((s) => s.status === "planned").length;
  const mon = db.sessions.find((s) => s.discipline === "strength" && E.sameDay(s.plannedDate, MONDAY));
  const ad = E.reconcileMissed(db, E.addDays(MONDAY, 1) + 12 * 3600000, "baki");
  assert.equal(E.findSession(db, mon.id).status, "missed");
  const missed = db.sessions.filter((s) => s.status === "missed").length;
  assert.equal(db.sessions.filter((s) => s.status === "planned").length, before - missed);
  const a = ad.find((x) => x.action === "reschedule");
  assert.ok(a);
  assert.equal(E.findSession(db, a.sessionID).blueprintKey, mon.blueprintKey);
  assert.ok(E.revert(db, a.id));
  assert.equal(E.findSession(db, a.sessionID).blueprintKey, a.previous.blueprintKey);
});

test("report sans empiler deux séances obligatoires", () => {
  const db = activeDB();
  const s = db.sessions.find((x) => x.discipline === "strength");
  E.postpone(db, s.id, MONDAY, "baki");
  const m = E.findSession(db, s.id);
  const same = db.sessions.filter((x) => x.id !== s.id && x.isMandatory && E.isOpen(x) && E.sameDay(x.plannedDate, m.plannedDate));
  assert.ok(m.status === "skipped" || same.length === 0);
});

test("T05 — combat difficile : séance de force suivante allégée avec motif", () => {
  const db = activeDB();
  const next = db.sessions.filter((s) => s.discipline === "strength" && s.plannedDate > MONDAY + 86400000 && s.plannedExercises.some((x) => E.LOWER.includes(x.family)))
    .sort((a, b) => a.plannedDate - b.plannedDate)[0];
  const day = E.startOfDay(next.plannedDate);
  E.logExternal(db, { discipline: "club", date: day - 5.5 * 3600000, minutes: 90, rpe: 9, intensity: "hard", notes: "" });
  const p = E.evaluate(next, null, db, day + 8 * 3600000);
  assert.equal(p.action, "lighten");
  assert.ok(p.reasons.some((r) => r.includes("club")));
  assert.ok(E.applyProposal(db, p, "baki"));
});

test("T07 — informations manquantes : séance conservée, sommeil inconnu ≠ zéro", () => {
  const db = activeDB();
  const s = db.sessions.find((x) => x.discipline === "strength");
  const p = E.evaluate(s, { fatigue: 2 }, db, MONDAY);
  assert.equal(p.action, "keep");
  assert.ok(p.missingInfo.some((m) => m.startsWith("Sommeil")));
});

test("T08 — douleur signalée : aucune hausse automatique", () => {
  const db = activeDB();
  const past = E.newSession({ discipline: "strength", status: "completed", plannedDate: MONDAY - 3 * 86400000 });
  past.sets = [1, 2, 3].map((i) => ({ id: "s" + i, plannedExerciseID: "pe", exerciseID: "db_bench_press", index: i, isWarmup: false, loadKg: 20, reps: 10, rir: 2 }));
  db.sessions.push(past);
  const up = E.suggest(db, db.profile, "db_bench_press", 6, 10, 3, 2);
  assert.equal(up.inc, true);
  assert.equal(up.load, 22);
  db.painReports.push({ id: "p", exerciseID: "db_bench_press", note: "gêne", isResolved: false, date: Date.now() });
  const b = E.suggest(db, db.profile, "db_bench_press", 6, 10, 3, 2);
  assert.equal(b.inc, false);
  assert.equal(b.pain, true);
});

test("séance réalisée jamais réécrite ; verrou respecté", () => {
  const db = activeDB();
  const s = db.sessions.find((x) => x.discipline === "strength");
  const p = E.evaluate(s, { fatigue: 5, sleepHours: 4 }, db, MONDAY);
  assert.equal(p.action, "replace");
  E.findSession(db, s.id).status = "completed";
  assert.equal(E.applyProposal(db, p, "baki"), false);
});

test("T06 — activation sur état obsolète refusée", () => {
  const db = E.emptyDB();
  db.profile = profile();
  const a = E.propose(db.profile, db, MONDAY, 4, "baki");
  const b = E.propose(db.profile, db, MONDAY, 4, "alghul");
  E.activate(a, null, db, MONDAY);
  assert.throws(() => E.activate(b, null, db, MONDAY));
  assert.equal(db.cycles.filter((c) => c.isActive).length, 1);
});

test("T09 — fusion d'archive sans doublon", () => {
  const db = activeDB();
  const copy = JSON.parse(JSON.stringify(db));
  const r = E.merge(copy, db);
  assert.equal(r.added, 0);
  const empty = E.emptyDB();
  E.merge(copy, empty);
  assert.equal(empty.sessions.length, db.sessions.length);
  assert.throws(() => E.validateDB({}));
});

test("paliers : régularité, pas de bonus de volume", () => {
  const db = E.emptyDB();
  const s = E.newSession({ discipline: "strength", status: "completed" });
  s.sets = Array.from({ length: 40 }, (_, i) => ({ exerciseID: "push_up", reps: 20, isWarmup: false }));
  db.sessions = [s];
  assert.equal(E.bakiPoints(db), 1);
  assert.equal(E.tier(40, E.TIER_NAMES.alghul).name, "Précision");
});

test("compétences avec partenaire jamais prescrites seul", () => {
  const p = profile();
  const f = new E.Filter(p, E.emptyDB());
  assert.ok(f.nextSkills(50).every((s) => s.context === "solo"));
  assert.ok(f.skillBlockingReason(E.skill("sparring_light")));
});
