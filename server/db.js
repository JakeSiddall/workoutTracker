import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { generateWarmups } from '../shared/warmups.js';
import { expireSavedSessions, finalizeSession, validateSessionCalendar } from './session-lifecycle.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const now = () => new Date().toISOString();
const uid = (prefix) => `${prefix}-${randomUUID()}`;
const json = (value) => JSON.stringify(value);
const clocks = new WeakMap();
const instant = db => (clocks.get(db) || (() => new Date()))();
export const finalizeSavedSessions = db => expireSavedSessions(db, instant(db));

const exerciseSeed = [
  ['bench','Bench press','sets','external_total','lb',45,45,5,1,1],
  ['rdl','Romanian deadlift','sets','external_total','lb',45,45,5,1,1],
  ['pullups','Pull-ups','total_reps','added_bodyweight','lb',null,0,5,0,0],
  ['pt','Knee / PT','duration','none',null,null,null,null,0,0],
  ['calf','Calf raise','sets','external_total','lb',null,null,10,0,0],
  ['trapbar','Trap-bar squat','sets','external_total','lb',52,72,10,1,1],
  ['ohp','Overhead press','sets','external_total','lb',45,45,5,1,1],
  ['row','Barbell row','sets','external_total','lb',45,45,5,0,0],
  ['hip','Hip thrust / glute bridge','sets','external_total','lb',null,null,10,0,0],
  ['pushups','Push-ups','sets','none',null,null,null,null,0,0]
];

const templateSeed = [
  ['strength-a','Strength A',1], ['strength-c','Strength C',2]
];

const prescriptions = [
  ['a-bench','strength-a','bench',1,3,5,6,null,null,null,165,5,1,1],
  ['a-rdl','strength-a','rdl',2,3,6,8,null,null,null,165,10,1,1],
  ['a-pullups','strength-a','pullups',3,null,null,null,null,null,null,90,null,0,0],
  ['a-pt','strength-a','pt',4,null,null,null,null,480,600,null,null,0,0],
  ['a-calf','strength-a','calf',5,2,10,15,null,null,null,90,10,0,0],
  ['c-pt','strength-c','pt',1,null,null,null,null,480,600,null,null,0,0],
  ['c-trap','strength-c','trapbar',2,3,5,6,null,null,null,165,10,1,1],
  ['c-ohp','strength-c','ohp',3,3,5,6,null,null,null,150,5,1,1],
  ['c-row','strength-c','row',4,3,6,8,null,null,null,120,5,0,0],
  ['c-hip','strength-c','hip',5,2,8,12,null,null,null,105,10,0,0],
  ['c-pushups','strength-c','pushups',6,2,8,15,null,null,null,90,null,0,0]
];

export function openDatabase(filename = process.env.WORKOUT_DB || path.join(process.cwd(), 'data', 'workouts.sqlite'), {clock = () => new Date()} = {}) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
  clocks.set(db, clock);
  // Additive migration: existing databases and previous app versions remain readable.
  db.transaction(() => {
    if (!db.prepare('PRAGMA table_info(sessions)').all().some(column => column.name === 'saved_for_later_at')) {
      db.exec('ALTER TABLE sessions ADD COLUMN saved_for_later_at TEXT');
    }
  })();
  migrateSchema(db);
  seed(db);
  finalizeSavedSessions(db);
  db.transaction(() => {
    if (migrateSeedDefaults(db)) migrateUnstartedTrapBarSnapshots(db);
  })();
  return db;
}

function migrateSchema(db) {
  const columns = db.prepare("PRAGMA table_info('exercises')").all();
  if (!columns.some((column) => column.name === 'bar_weight')) db.exec('ALTER TABLE exercises ADD COLUMN bar_weight REAL');
}

function seed(db) {
  const tx = db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO app_settings(id) VALUES (1)').run();
    const insertExercise = db.prepare(`INSERT OR IGNORE INTO exercises
      (id,name,tracking_mode,load_basis,unit,bar_weight,equipment_min,load_step,warmup_default,optional_final_ramp)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    exerciseSeed.forEach((row) => insertExercise.run(...row));
    const insertTemplate = db.prepare(`INSERT OR IGNORE INTO workout_templates
      (id,name,plan_label,active,archived,sort_order) VALUES (?,?, 'A / C rotation',1,0,?)`);
    templateSeed.forEach((row) => insertTemplate.run(...row));
    const insertRx = db.prepare(`INSERT OR IGNORE INTO template_exercises
      (id,template_id,exercise_id,sort_order,work_set_count,rep_min,rep_max,total_rep_target,duration_min_seconds,duration_max_seconds,rest_seconds,increment,warmup_enabled,optional_final_ramp)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    prescriptions.forEach((row) => insertRx.run(...row));
  });
  tx();
}

function migrateSeedDefaults(db) {
  db.prepare(`UPDATE exercises SET bar_weight=45 WHERE id IN ('bench','rdl','ohp','row')
    AND bar_weight IS NULL AND equipment_min=45`).run();
  const legacy = db.prepare(`SELECT id FROM exercises WHERE id='trapbar' AND name='Trap-bar deadlift'
    AND bar_weight IS NULL AND equipment_min IS NULL AND load_step=10 AND warmup_default=0 AND optional_final_ramp=0`).get();
  if (!legacy) return false;
  db.transaction(() => {
    db.prepare(`UPDATE exercises SET name='Trap-bar squat',bar_weight=52,equipment_min=72,load_step=10,
      warmup_default=1,optional_final_ramp=1 WHERE id='trapbar'`).run();
    db.prepare(`UPDATE template_exercises SET warmup_enabled=1,optional_final_ramp=1
      WHERE id='c-trap' AND exercise_id='trapbar' AND warmup_enabled=0 AND optional_final_ramp=0`).run();
  })();
  return true;
}

function migrateUnstartedTrapBarSnapshots(db) {
  const rows = db.prepare(`SELECT se.* FROM session_exercises se JOIN sessions s ON s.id=se.session_id
    WHERE s.status='in_progress' AND se.exercise_id='trapbar' AND se.status='pending'`).all();
  for (const row of rows) {
    const resolved = db.prepare("SELECT 1 FROM sets WHERE session_exercise_id=? AND status!='pending'").get(row.id);
    if (resolved) continue;
    const prescription = JSON.parse(row.prescription_snapshot);
    if (row.name_snapshot !== 'Trap-bar deadlift' || prescription.barWeight != null || prescription.equipmentMin != null || prescription.loadStep !== 10 || prescription.warmupEnabled !== false || prescription.optionalFinalRamp !== false) continue;
    Object.assign(prescription, {barWeight:52,equipmentMin:72,loadStep:10,warmupEnabled:true,optionalFinalRamp:true});
    db.prepare('UPDATE session_exercises SET prescription_snapshot=? WHERE id=?').run(json(prescription),row.id);
    rebuildPendingSets(db,row.id,prescription,row.chosen_target_load);
    db.prepare('UPDATE sessions SET revision=revision+1,updated_at=? WHERE id=?').run(now(),row.session_id);
  }
}

export function getToday(db) {
  finalizeSavedSessions(db);
  const templates = db.prepare(`SELECT t.*, GROUP_CONCAT(e.name, '||') exercise_names
    FROM workout_templates t JOIN template_exercises te ON te.template_id=t.id
    JOIN exercises e ON e.id=te.exercise_id WHERE t.active=1 AND t.archived=0
    GROUP BY t.id ORDER BY t.sort_order`).all().map((t) => ({...t, exercises: t.exercise_names.split('||')}));
  const last = db.prepare(`SELECT template_id FROM sessions WHERE status='completed' AND template_id IS NOT NULL
    ORDER BY COALESCE(performed_at_utc, performed_local_date) DESC, created_at DESC LIMIT 1`).get();
  const active = db.prepare(`SELECT id FROM sessions WHERE status='in_progress'`).get();
  const idx = last ? templates.findIndex((t) => t.id === last.template_id) : -1;
  return { templates, recommendedTemplateId: templates[(idx + 1) % templates.length]?.id, activeSessionId: active?.id ?? null };
}

function snapshotSession(db, templateId, body) {
  const template = db.prepare('SELECT * FROM workout_templates WHERE id=? AND active=1').get(templateId);
  if (!template) throw Object.assign(new Error('Unknown active template'), { status: 400 });
  const rows = db.prepare(`SELECT te.*, e.name, e.tracking_mode, e.load_basis, e.unit, e.bar_weight, e.equipment_min, e.load_step
    FROM template_exercises te JOIN exercises e ON e.id=te.exercise_id WHERE te.template_id=? ORDER BY te.sort_order`).all(templateId);
  const sessionId = uid('session');
  const stamp = now();
  db.prepare(`INSERT INTO sessions(id,template_id,template_name_snapshot,performed_local_date,performed_at_utc,timezone,time_precision,actual_started_at,status,entry_source,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?, 'in_progress','live',?,?)`).run(sessionId, templateId, template.name, body.performedDate, stamp, body.timezone, 'datetime', stamp, stamp, stamp);
  for (const row of rows) {
    const sxId = uid('exercise');
    const suggested = row.id === 'a-bench' ? 145 : null;
    const prescription = {workSetCount:row.work_set_count,repMin:row.rep_min,repMax:row.rep_max,totalRepTarget:row.total_rep_target,durationMinSeconds:row.duration_min_seconds,durationMaxSeconds:row.duration_max_seconds,restSeconds:row.rest_seconds,barWeight:row.bar_weight,equipmentMin:row.equipment_min,loadStep:row.load_step,warmupEnabled:Boolean(row.warmup_enabled),optionalFinalRamp:Boolean(row.optional_final_ramp)};
    db.prepare(`INSERT INTO session_exercises(id,session_id,exercise_id,prescribed_exercise_id,sort_order,name_snapshot,tracking_mode_snapshot,load_basis_snapshot,unit_snapshot,prescription_snapshot,suggestion_load,suggestion_reason,suggestion_policy_version,chosen_target_load,target_total_reps)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(sxId, sessionId, row.exercise_id, row.exercise_id, row.sort_order, row.name, row.tracking_mode, row.load_basis, row.unit, json(prescription), suggested, suggested ? 'Historical observation; confirm or override' : 'Choose a starting load', 'v1', suggested, row.total_rep_target);
    if (row.tracking_mode === 'sets') createSets(db, sxId, prescription, suggested);
  }
  return sessionId;
}

function createSets(db, sxId, p, load) {
  let order = 1;
  if (load != null && p.warmupEnabled && p.equipmentMin != null && p.loadStep != null) {
    for (const warmup of generateWarmups({chosenWorkLoad:load,equipmentMinimum:p.equipmentMin,step:p.loadStep,optionalFinalRamp:p.optionalFinalRamp})) {
      db.prepare(`INSERT INTO sets(id,session_exercise_id,sort_order,kind,target_load,target_rep_min,target_rep_max,status) VALUES (?,?,?,?,?,?,?,'pending')`)
        .run(uid('set'), sxId, order++, 'warmup', warmup.load, warmup.repMin, warmup.repMax);
    }
  }
  for (let i=1; i <= (p.workSetCount || 0); i++) {
    db.prepare(`INSERT INTO sets(id,session_exercise_id,sort_order,kind,prescribed_set_ordinal,target_load,target_rep_min,target_rep_max,status) VALUES (?,?,?,?,?,?,?,?,'pending')`)
      .run(uid('set'), sxId, order++, 'work', i, load, p.repMin, p.repMax);
  }
}

function rebuildPendingSets(db, sxId, p, chosenWorkLoad) {
  const workStarted = db.prepare("SELECT 1 FROM sets WHERE session_exercise_id=? AND kind='work' AND status!='pending'").get(sxId);
  if (workStarted) return false;
  const resolvedWarmups = db.prepare("SELECT * FROM sets WHERE session_exercise_id=? AND kind='warmup' AND status!='pending' ORDER BY sort_order").all(sxId);
  const workSets = db.prepare("SELECT * FROM sets WHERE session_exercise_id=? AND kind='work' ORDER BY prescribed_set_ordinal").all(sxId);
  let ramps = [];
  if (chosenWorkLoad != null && p.warmupEnabled && p.equipmentMin != null && p.loadStep != null) {
    ramps = generateWarmups({
      chosenWorkLoad,
      equipmentMinimum:p.equipmentMin,
      step:p.loadStep,
      optionalFinalRamp:p.optionalFinalRamp,
      completedWarmups:resolvedWarmups
    }).filter((row) => !row.completed);
  }
  const resolvedLoads = new Set(resolvedWarmups.map((row) => row.actual_load ?? row.target_load));
  db.prepare('DELETE FROM sets WHERE session_exercise_id=?').run(sxId);
  let order = 1;
  const insertResolved = db.prepare(`INSERT INTO sets(id,session_exercise_id,sort_order,kind,prescribed_set_ordinal,target_load,target_rep_min,target_rep_max,actual_load,actual_reps,rir,note,status,performed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const row of resolvedWarmups) insertResolved.run(row.id,sxId,order++,'warmup',null,row.target_load,row.target_rep_min,row.target_rep_max,row.actual_load,row.actual_reps,row.rir,row.note,row.status,row.performed_at);
  const insertWarmup = db.prepare(`INSERT INTO sets(id,session_exercise_id,sort_order,kind,target_load,target_rep_min,target_rep_max,status)
    VALUES (?,?,?,?,?,?,?,'pending')`);
  for (const ramp of ramps) {
    if (!resolvedLoads.has(ramp.load)) insertWarmup.run(uid('set'),sxId,order++,'warmup',ramp.load,ramp.repMin,ramp.repMax);
  }
  for (const row of workSets) insertResolved.run(row.id,sxId,order++,'work',row.prescribed_set_ordinal,row.status==='pending'?chosenWorkLoad:row.target_load,row.target_rep_min,row.target_rep_max,row.actual_load,row.actual_reps,row.rir,row.note,row.status,row.performed_at);
  return true;
}

export function createSession(db, body) {
  validateSessionCalendar(body.performedDate, body.timezone);
  finalizeSavedSessions(db);
  return db.transaction(() => {
    const existing = db.prepare('SELECT response_json FROM mutation_requests WHERE request_id=?').get(body.requestId);
    if (existing) return JSON.parse(existing.response_json);
    const active = db.prepare(`SELECT id FROM sessions WHERE status='in_progress'`).get();
    if (active) throw Object.assign(new Error('A workout is already active'), { status: 409, activeSessionId: active.id });
    const id = snapshotSession(db, body.templateId, body);
    const result = getSession(db, id);
    db.prepare('INSERT INTO mutation_requests(request_id,response_json,created_at) VALUES (?,?,?)').run(body.requestId, json(result), now());
    return result;
  })();
}

export function getSession(db, id) {
  finalizeSavedSessions(db);
  const session = db.prepare('SELECT * FROM sessions WHERE id=?').get(id);
  if (!session) return null;
  const exercises = db.prepare('SELECT * FROM session_exercises WHERE session_id=? ORDER BY sort_order').all(id).map((e) => ({
    ...e,
    prescription: JSON.parse(e.prescription_snapshot),
    sets: db.prepare('SELECT * FROM sets WHERE session_exercise_id=? ORDER BY sort_order').all(e.id),
    pullupEntries: db.prepare('SELECT id,reps,created_at FROM pullup_entries WHERE session_exercise_id=? AND undone_at IS NULL ORDER BY rowid').all(e.id)
  }));
  return {...session, exercises};
}

function mutate(db, sessionId, body, action, {allowCompleted=false, actionKey=null} = {}) {
  if (typeof body.requestId !== 'string' || !body.requestId.trim() || !Number.isSafeInteger(body.revision) || body.revision < 0) {
    throw Object.assign(new Error('requestId and a nonnegative integer revision are required'), {status:400});
  }
  // Commit expiration before checking a stale writer so a 409 cannot roll it back.
  finalizeSavedSessions(db);
  const fingerprint = actionKey ? createHash('sha256').update(json({sessionId,actionKey,body:Object.fromEntries(Object.entries(body).sort(([a],[b])=>a.localeCompare(b)))})).digest('hex') : null;
  return db.transaction(() => {
    const prior = db.prepare(`SELECT m.*,e.request_fingerprint FROM mutation_requests m
      LEFT JOIN exit_mutation_requests e USING(request_id) WHERE m.request_id=?`).get(body.requestId);
    if (prior) {
      const result = JSON.parse(prior.response_json);
      if (result.id !== sessionId || (fingerprint && prior.request_fingerprint !== fingerprint)) {
        throw Object.assign(new Error('requestId already used for another mutation'), {status:409});
      }
      return result;
    }
    const session = db.prepare('SELECT * FROM sessions WHERE id=?').get(sessionId);
    if (!session) throw Object.assign(new Error('Session not found'), {status:404});
    if (session.revision !== body.revision) throw Object.assign(new Error('Session changed elsewhere'), {status:409,current:getSession(db,sessionId)});
    if (session.status !== 'in_progress' && !(allowCompleted && session.status === 'completed')) {
      throw Object.assign(new Error('Workout is no longer in progress'), {status:409,current:getSession(db,sessionId)});
    }
    action(session);
    db.prepare('UPDATE sessions SET revision=revision+1, updated_at=? WHERE id=?').run(now(), sessionId);
    const result = getSession(db, sessionId);
    db.prepare('INSERT INTO mutation_requests(request_id,response_json,created_at) VALUES (?,?,?)').run(body.requestId, json(result), now());
    if (fingerprint) db.prepare('INSERT INTO exit_mutation_requests VALUES (?,?)').run(body.requestId, fingerprint);
    return result;
  })();
}

function restDeadline(seconds) { return seconds == null ? null : new Date(Date.now() + seconds*1000).toISOString(); }
function requireNumber(value, name, {integer=false,min=0}={}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || (integer && !Number.isInteger(value))) throw Object.assign(new Error(`${name} is invalid`), {status:400});
}

export function setTarget(db, sessionId, sxId, body) {
  requireNumber(body.chosenTargetLoad, 'chosenTargetLoad');
  return mutate(db,sessionId,body,() => {
    const sx=db.prepare('SELECT * FROM session_exercises WHERE id=? AND session_id=?').get(sxId,sessionId); if(!sx) throw Object.assign(new Error('Exercise not found'),{status:404});
    const p=JSON.parse(sx.prescription_snapshot);
    db.prepare('UPDATE session_exercises SET chosen_target_load=? WHERE id=?').run(body.chosenTargetLoad,sxId);
    db.prepare("UPDATE sets SET target_load=? WHERE session_exercise_id=? AND kind='work' AND status='pending'").run(body.chosenTargetLoad,sxId);
    rebuildPendingSets(db,sxId,p,body.chosenTargetLoad);
  });
}

export function updateWarmupSettings(db, sessionId, sxId, body) {
  requireNumber(body.barWeight,'barWeight');
  requireNumber(body.equipmentMinimum,'equipmentMinimum');
  requireNumber(body.loadStep,'loadStep',{min:Number.EPSILON});
  if (body.equipmentMinimum < body.barWeight) throw Object.assign(new Error('equipmentMinimum must include at least the bar weight'),{status:400});
  if (typeof body.warmupEnabled !== 'boolean' || typeof body.optionalFinalRamp !== 'boolean') throw Object.assign(new Error('Warm-up choices are invalid'),{status:400});
  return mutate(db,sessionId,body,(session) => {
    if (session.status !== 'in_progress') throw Object.assign(new Error('Warm-up settings can only be changed during an active workout'),{status:409});
    const sx=db.prepare('SELECT * FROM session_exercises WHERE id=? AND session_id=?').get(sxId,sessionId);
    if(!sx) throw Object.assign(new Error('Exercise not found'),{status:404});
    if(sx.tracking_mode_snapshot!=='sets' || sx.load_basis_snapshot!=='external_total') throw Object.assign(new Error('Warm-up equipment settings do not apply to this exercise'),{status:400});
    const p=JSON.parse(sx.prescription_snapshot);
    Object.assign(p,{barWeight:body.barWeight,equipmentMin:body.equipmentMinimum,loadStep:body.loadStep,warmupEnabled:body.warmupEnabled,optionalFinalRamp:body.optionalFinalRamp});
    db.prepare('UPDATE session_exercises SET prescription_snapshot=? WHERE id=?').run(json(p),sxId);
    db.prepare(`UPDATE exercises SET bar_weight=?,equipment_min=?,load_step=?,warmup_default=?,optional_final_ramp=? WHERE id=?`)
      .run(body.barWeight,body.equipmentMinimum,body.loadStep,Number(body.warmupEnabled),Number(body.optionalFinalRamp),sx.exercise_id);
    db.prepare(`UPDATE template_exercises SET warmup_enabled=?,optional_final_ramp=? WHERE exercise_id=?`)
      .run(Number(body.warmupEnabled),Number(body.optionalFinalRamp),sx.exercise_id);
    rebuildPendingSets(db,sxId,p,sx.chosen_target_load);
  });
}

export function logSet(db, sessionId, setId, body) {
  requireNumber(body.actualLoad,'actualLoad'); requireNumber(body.actualReps,'actualReps',{integer:true}); if(body.rir!=null) requireNumber(body.rir,'rir',{integer:true});
  return mutate(db,sessionId,body,() => {const row=db.prepare(`SELECT s.*,se.session_id,se.prescription_snapshot FROM sets s JOIN session_exercises se ON se.id=s.session_exercise_id WHERE s.id=?`).get(setId);if(!row||row.session_id!==sessionId)throw Object.assign(new Error('Set not found'),{status:404});if(row.status!=='pending')throw Object.assign(new Error('Set is already resolved'),{status:409});db.prepare("UPDATE sets SET actual_load=?,actual_reps=?,rir=?,status='completed',performed_at=? WHERE id=?").run(body.actualLoad,body.actualReps,body.rir??null,now(),setId);const p=JSON.parse(row.prescription_snapshot);db.prepare('UPDATE sessions SET rest_ends_at=? WHERE id=?').run(restDeadline(p.restSeconds),sessionId)});
}
export function skipSet(db,sessionId,setId,body){return mutate(db,sessionId,body,()=>{const info=db.prepare("UPDATE sets SET status='skipped' WHERE id=? AND status='pending' AND session_exercise_id IN (SELECT id FROM session_exercises WHERE session_id=?)").run(setId,sessionId);if(!info.changes)throw Object.assign(new Error('Pending set not found'),{status:404})})}
export function addReps(db,sessionId,sxId,body){requireNumber(body.reps,'reps',{integer:true,min:1});return mutate(db,sessionId,body,()=>{const sx=db.prepare("SELECT * FROM session_exercises WHERE id=? AND session_id=? AND tracking_mode_snapshot='total_reps'").get(sxId,sessionId);if(!sx)throw Object.assign(new Error('Pull-up exercise not found'),{status:404});db.prepare('INSERT INTO pullup_entries VALUES (?,?,?,?,NULL)').run(uid('entry'),sxId,body.reps,now());db.prepare('UPDATE session_exercises SET actual_total_reps=COALESCE(actual_total_reps,0)+? WHERE id=?').run(body.reps,sxId);const p=JSON.parse(sx.prescription_snapshot);db.prepare('UPDATE sessions SET rest_ends_at=? WHERE id=?').run(restDeadline(p.restSeconds),sessionId)})}
export function undoReps(db,sessionId,sxId,body){return mutate(db,sessionId,body,()=>{const last=db.prepare('SELECT * FROM pullup_entries WHERE session_exercise_id=? AND undone_at IS NULL ORDER BY rowid DESC LIMIT 1').get(sxId);if(!last)throw Object.assign(new Error('Nothing to undo'),{status:400});db.prepare('UPDATE pullup_entries SET undone_at=? WHERE id=?').run(now(),last.id);db.prepare('UPDATE session_exercises SET actual_total_reps=MAX(0,COALESCE(actual_total_reps,0)-?) WHERE id=?').run(last.reps,sxId)})}
export function correctTotal(db,sessionId,sxId,body){requireNumber(body.actualTotalReps,'actualTotalReps',{integer:true});requireNumber(body.actualAddedLoad,'actualAddedLoad');return mutate(db,sessionId,body,()=>{db.prepare('UPDATE session_exercises SET actual_total_reps=?,actual_added_load=? WHERE id=? AND session_id=?').run(body.actualTotalReps,body.actualAddedLoad,sxId,sessionId)})}
export function resolveExercise(db,sessionId,sxId,body,status){return mutate(db,sessionId,body,()=>{if(body.actualDurationSeconds!=null)requireNumber(body.actualDurationSeconds,'actualDurationSeconds',{integer:true});const info=db.prepare('UPDATE session_exercises SET status=?,actual_duration_seconds=? WHERE id=? AND session_id=?').run(status,body.actualDurationSeconds??null,sxId,sessionId);if(!info.changes)throw Object.assign(new Error('Exercise not found'),{status:404});db.prepare("UPDATE sets SET status='skipped' WHERE session_exercise_id=? AND status='pending'").run(sxId);db.prepare('UPDATE sessions SET active_exercise_order=active_exercise_order+1,rest_ends_at=NULL WHERE id=?').run(sessionId)})}
export function completeSession(db, sessionId, body) {
  return mutate(db, sessionId, body, () => finalizeSession(db, sessionId, instant(db).toISOString()), {actionKey:'complete'});
}

export function cancelSession(db, sessionId, body) {
  return mutate(db, sessionId, body, () => {
    db.prepare("UPDATE sessions SET status='abandoned',actual_ended_at=?,rest_ends_at=NULL WHERE id=?")
      .run(instant(db).toISOString(), sessionId);
  }, {actionKey:'cancel'});
}

export function saveSessionForLater(db, sessionId, body) {
  const saved = mutate(db, sessionId, body, session => {
    validateSessionCalendar(session.performed_local_date, session.timezone);
    db.prepare('UPDATE sessions SET saved_for_later_at=? WHERE id=?').run(instant(db).toISOString(), sessionId);
  }, {actionKey:'save-for-later'});
  // A first save after midnight is immediately final, including on retries.
  finalizeSavedSessions(db);
  const current = getSession(db, sessionId);
  return current.status !== 'in_progress' ? current : saved;
}

export function resumeSession(db, sessionId, body) {
  const resumed = mutate(db, sessionId, body, () => {}, {actionKey:'resume'});
  const current = getSession(db, sessionId);
  return current.status !== 'in_progress' ? current : resumed;
}

export function correctSet(db,sessionId,setId,body){requireNumber(body.actualLoad,'actualLoad');requireNumber(body.actualReps,'actualReps',{integer:true});return mutate(db,sessionId,body,()=>{const info=db.prepare("UPDATE sets SET actual_load=?,actual_reps=?,rir=? WHERE id=? AND status='completed' AND session_exercise_id IN (SELECT id FROM session_exercises WHERE session_id=?)").run(body.actualLoad,body.actualReps,body.rir??null,setId,sessionId);if(!info.changes)throw Object.assign(new Error('Completed set not found'),{status:404})}, {allowCompleted:true})}
