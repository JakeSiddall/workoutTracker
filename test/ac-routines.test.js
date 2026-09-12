import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import Database from 'better-sqlite3';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openDatabase,createSession,getSession,getToday,logHold,logSet,skipSet,setTarget,resolveExercise,completeSession,cancelSession,saveSessionForLater,resumeSession} from '../server/db.js';
const body=s=>({requestId:randomUUID(),revision:s.revision});
const start=(db,id)=>createSession(db,{requestId:randomUUID(),templateId:id,performedDate:'2026-09-12',timezone:'UTC'});
const clock=()=>new Date('2026-09-12T12:00:00Z');
for(const id of ['strength-a','strength-c']) test(`${id} prospective order and prescriptions`,()=>{
  const db=openDatabase(':memory:',{clock});
  db.prepare("UPDATE template_exercises SET total_rep_target=25 WHERE id='a-pullups'").run();
  const s=start(db,id);
  const expected=id==='strength-a'?['bench','rdl','pullups','wall','goblet','calf']:['wall','goblet','trapbar','ohp','row','hip','pushups'];
  assert.deepEqual(s.exercises.map(e=>e.exercise_id),expected);
  assert.deepEqual(getToday(db).templates.find(t=>t.id===id).exercises,s.exercises.map(e=>e.name_snapshot));
  for(const e of s.exercises) {
    const expectedRx={bench:[3,5,6],rdl:[3,6,8],goblet:[3,8,12],calf:[2,10,15],trapbar:[3,5,6],ohp:[3,5,6],row:[3,6,8],hip:[2,8,12],pushups:[2,8,15]}[e.exercise_id];
    if(expectedRx) assert.deepEqual([e.prescription.workSetCount,e.prescription.repMin,e.prescription.repMax],expectedRx);
    if(e.exercise_id==='wall') {assert.equal(e.sets.length,3);for(const h of e.sets){assert.equal(h.target_duration_seconds,60);assert.equal(h.actual_duration_seconds,null);assert.equal(h.actual_reps,null);}assert.equal(e.prescription.durationMaxSeconds,null);}
    if(e.exercise_id==='pullups') {assert.equal(e.target_total_reps,25);assert.equal(e.tracking_mode_snapshot,'total_reps');}
    if(e.exercise_id==='trapbar') assert.deepEqual([e.name_snapshot,e.prescription.barWeight,e.prescription.equipmentMin,e.prescription.loadStep],['Trap-bar squat',52,72,10]);
    if(e.exercise_id==='pushups') assert.equal(e.prescription.optional,true);
    if(e.exercise_id==='goblet') {assert.equal(e.chosen_target_load,null);assert.equal(e.prescription.warmupEnabled,false);}
  }
  db.close();
});
test('hold actuals persist through save, restart and resume; skipped or absent work has no actuals',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'ac-holds-'));const file=path.join(dir,'db');let db=openDatabase(file,{clock});
  try {
    let s=start(db,'strength-c');const hold=s.exercises[0].sets[0];
    for(const v of [null,undefined,'60',-1,1.5]) assert.throws(()=>logHold(db,s.id,hold.id,{...body(s),actualDurationSeconds:v}));
    assert.throws(()=>logSet(db,s.id,hold.id,{...body(s),actualLoad:0,actualReps:60}));
    assert.throws(()=>setTarget(db,s.id,s.exercises[0].id,{...body(s),chosenTargetLoad:20}));
    const request={...body(s),actualDurationSeconds:42};
    s=logHold(db,s.id,hold.id,request);assert.equal(logHold(db,s.id,hold.id,request).revision,s.revision);
    assert.throws(()=>logHold(db,s.id,hold.id,{...body(s),actualDurationSeconds:60}));
    s=skipSet(db,s.id,s.exercises[0].sets[1].id,body(s));s=saveSessionForLater(db,s.id,body(s));
    db.close();db=openDatabase(file,{clock});assert.deepEqual(getSession(db,s.id),s);
    s=resumeSession(db,s.id,body(s));s=completeSession(db,s.id,body(s));
    assert.deepEqual(s.exercises[0].sets.map(h=>[h.status,h.actual_duration_seconds]),[['completed',42],['skipped',null],['skipped',null]]);
    assert.equal(s.exercises[0].actual_duration_seconds,null);
    const next=start(db,'strength-c');const ended=resolveExercise(db,next.id,next.exercises[0].id,body(next),'completed');assert.equal(ended.exercises[0].status,'skipped');
    const cancelled=cancelSession(db,ended.id,body(ended));assert.equal(cancelled.status,'abandoned');
    assert.deepEqual(cancelled.exercises,ended.exercises);
  } finally {db.close();rmSync(dir,{recursive:true,force:true});}
});
test('goblet load is explicitly chosen and confirmed; next workout does not progress it',()=>{
  const db=openDatabase(':memory:',{clock});let s=start(db,'strength-c');const id=s.exercises[1].id;
  s=setTarget(db,s.id,id,{...body(s),chosenTargetLoad:20});
  for(const set of s.exercises[1].sets) s=logSet(db,s.id,set.id,{...body(s),actualLoad:20,actualReps:12,rir:3});
  s=completeSession(db,s.id,body(s));assert.equal(start(db,'strength-c').exercises[1].chosen_target_load,null);db.close();
});

test('additive migration retains every old value, active PT snapshot, history and custom equipment',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'ac-migration-'));const file=path.join(dir,'db');
  let db=new Database(file);
  db.exec(readFileSync(new URL('../server/schema.sql',import.meta.url),'utf8'));
  db.exec(`INSERT INTO exercises(id,name,tracking_mode,load_basis) VALUES ('pt','Knee / PT','duration','none');
    INSERT INTO exercises(id,name,tracking_mode,load_basis,bar_weight,equipment_min,load_step) VALUES ('trapbar','Trap-bar squat','sets','external_total',52,82,20);
    INSERT INTO workout_templates(id,name,plan_label,sort_order) VALUES ('strength-c','Strength C','A / C rotation',2);
    INSERT INTO template_exercises(id,template_id,exercise_id,sort_order,duration_min_seconds,duration_max_seconds) VALUES ('c-pt','strength-c','pt',1,480,600);`);
  for(const status of ['completed','abandoned','in_progress']) {
    db.prepare(`INSERT INTO sessions(id,template_id,performed_local_date,timezone,time_precision,status,entry_source,created_at,updated_at)
      VALUES (?,'strength-c','2026-09-12','UTC','date',?,'live','original','original')`).run(status,status);
    db.prepare(`INSERT INTO session_exercises(id,session_id,exercise_id,prescribed_exercise_id,sort_order,name_snapshot,tracking_mode_snapshot,load_basis_snapshot,prescription_snapshot,actual_duration_seconds)
      VALUES (?,?,'pt','pt',1,'Knee / PT','duration','none',?,?)`).run(status,status,JSON.stringify({durationMinSeconds:480,durationMaxSeconds:600}),status==='completed'?501:null);
  }
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name);
  const before=Object.fromEntries(tables.map(t=>[t,db.prepare(`SELECT * FROM ${t}`).all()]));
  db.close();db=openDatabase(file,{clock});
  try {
    for(const [table,rows] of Object.entries(before)) for(const row of rows) {
      const actual=db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(row.id);
      for(const [key,value] of Object.entries(row)) assert.deepEqual(actual[key],value,`${table}.${key}`);
    }
    const active=getSession(db,'in_progress');assert.equal(active.exercises.length,1);assert.equal(active.exercises[0].exercise_id,'pt');
    const after=Object.fromEntries(tables.map(t=>[t,db.prepare(`SELECT * FROM ${t}`).all()]));
    db.close();db=openDatabase(file,{clock});
    assert.deepEqual(Object.fromEntries(tables.map(t=>[t,db.prepare(`SELECT * FROM ${t}`).all()])),after);
    let cancelled=cancelSession(db,active.id,body(active));assert.equal(cancelled.status,'abandoned');
    const next=start(db,'strength-c');assert.deepEqual(next.exercises.slice(0,2).map(e=>e.exercise_id),['wall','goblet']);
    const trap=next.exercises.find(e=>e.exercise_id==='trapbar');assert.equal(trap.prescription.equipmentMin,82);assert.equal(trap.prescription.loadStep,20);
  } finally {db.close();rmSync(dir,{recursive:true,force:true});}
});
