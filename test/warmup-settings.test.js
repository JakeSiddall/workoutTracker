import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { openDatabase,createSession,getSession,setTarget,updateWarmupSettings,logSet,completeSession } from '../server/db.js';

const request = (() => { let id=0; return () => `warmup-request-${++id}`; })();
const temporaryDatabase = (prefix) => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),prefix));
  return {directory,filename:path.join(directory,'workouts.sqlite')};
};
const removeTemporaryDatabase = ({directory}) => fs.rmSync(directory,{recursive:true,force:true});

test('trap-bar settings generate ramps, preserve resolved sets, and persist for future sessions',()=>{
  const temporary=temporaryDatabase('workout-jak14-settings-');
  let db=openDatabase(temporary.filename);
  let session=createSession(db,{requestId:request(),templateId:'strength-c',performedDate:'2026-09-05',timezone:'America/Los_Angeles'});
  let trap=session.exercises.find((exercise)=>exercise.exercise_id==='trapbar');
  assert.equal(trap.name_snapshot,'Trap-bar squat');
  assert.deepEqual({barWeight:trap.prescription.barWeight,equipmentMin:trap.prescription.equipmentMin,loadStep:trap.prescription.loadStep,warmupEnabled:trap.prescription.warmupEnabled,optionalFinalRamp:trap.prescription.optionalFinalRamp},{barWeight:52,equipmentMin:72,loadStep:10,warmupEnabled:true,optionalFinalRamp:true});

  session=setTarget(db,session.id,trap.id,{requestId:request(),revision:session.revision,chosenTargetLoad:172});
  trap=session.exercises.find((exercise)=>exercise.id===trap.id);
  assert.deepEqual(trap.sets.filter((set)=>set.kind==='warmup').map((set)=>set.target_load),[72,82,122,142]);
  const completed=trap.sets.find((set)=>set.kind==='warmup');
  session=logSet(db,session.id,completed.id,{requestId:request(),revision:session.revision,actualLoad:72,actualReps:8});
  session=updateWarmupSettings(db,session.id,trap.id,{requestId:request(),revision:session.revision,barWeight:52,equipmentMinimum:82,loadStep:10,warmupEnabled:true,optionalFinalRamp:false});
  trap=session.exercises.find((exercise)=>exercise.id===trap.id);
  assert.deepEqual(trap.sets.filter((set)=>set.kind==='warmup').map((set)=>[set.id,set.target_load,set.status]),[[completed.id,72,'completed'],[trap.sets.find((set)=>set.kind==='warmup'&&set.target_load===82).id,82,'pending'],[trap.sets.find((set)=>set.kind==='warmup'&&set.target_load===122).id,122,'pending']]);
  session=updateWarmupSettings(db,session.id,trap.id,{requestId:request(),revision:session.revision,barWeight:52,equipmentMinimum:82,loadStep:10,warmupEnabled:false,optionalFinalRamp:false});
  trap=session.exercises.find((exercise)=>exercise.id===trap.id);
  assert.deepEqual(trap.sets.filter((set)=>set.kind==='warmup').map((set)=>[set.id,set.target_load,set.status]),[[completed.id,72,'completed']]);
  session=updateWarmupSettings(db,session.id,trap.id,{requestId:request(),revision:session.revision,barWeight:52,equipmentMinimum:82,loadStep:10,warmupEnabled:true,optionalFinalRamp:false});
  trap=session.exercises.find((exercise)=>exercise.id===trap.id);
  assert.throws(()=>updateWarmupSettings(db,session.id,trap.id,{requestId:request(),revision:session.revision,barWeight:90,equipmentMinimum:82,loadStep:10,warmupEnabled:true,optionalFinalRamp:true}),/equipmentMinimum/);

  const work=trap.sets.find((set)=>set.kind==='work');
  session=logSet(db,session.id,work.id,{requestId:request(),revision:session.revision,actualLoad:172,actualReps:5});
  const warmupsBefore=session.exercises.find((exercise)=>exercise.id===trap.id).sets.filter((set)=>set.kind==='warmup').map((set)=>[set.id,set.target_load,set.status]);
  session=updateWarmupSettings(db,session.id,trap.id,{requestId:request(),revision:session.revision,barWeight:52,equipmentMinimum:72,loadStep:10,warmupEnabled:true,optionalFinalRamp:true});
  assert.deepEqual(session.exercises.find((exercise)=>exercise.id===trap.id).sets.filter((set)=>set.kind==='warmup').map((set)=>[set.id,set.target_load,set.status]),warmupsBefore);

  session=completeSession(db,session.id,{requestId:request(),revision:session.revision});
  db.close();
  db=openDatabase(temporary.filename);
  const defaults=db.prepare("SELECT name,bar_weight,equipment_min,load_step,warmup_default,optional_final_ramp FROM exercises WHERE id='trapbar'").get();
  assert.deepEqual(defaults,{name:'Trap-bar squat',bar_weight:52,equipment_min:72,load_step:10,warmup_default:1,optional_final_ramp:1});
  let future=createSession(db,{requestId:request(),templateId:'strength-c',performedDate:'2026-09-06',timezone:'America/Los_Angeles'});
  const futureTrap=future.exercises.find((exercise)=>exercise.exercise_id==='trapbar');
  future=setTarget(db,future.id,futureTrap.id,{requestId:request(),revision:future.revision,chosenTargetLoad:172});
  assert.deepEqual(future.exercises.find((exercise)=>exercise.id===futureTrap.id).sets.filter((set)=>set.kind==='warmup').map((set)=>set.target_load),[72,82,122,142]);
  db.close();
  removeTemporaryDatabase(temporary);
});

test('opening a legacy database adds equipment settings without rewriting history',()=>{
  const temporary=temporaryDatabase('workout-jak14-migration-');
  const legacy=new Database(temporary.filename);
  const currentSchema=fs.readFileSync(new URL('../server/schema.sql',import.meta.url),'utf8');
  legacy.exec(currentSchema.replace('  bar_weight REAL,\n',''));
  legacy.prepare(`INSERT INTO exercises(id,name,tracking_mode,load_basis,unit,equipment_min,load_step,warmup_default,optional_final_ramp) VALUES ('trapbar','Trap-bar deadlift','sets','external_total','lb',NULL,10,0,0)`).run();
  legacy.prepare(`INSERT INTO workout_templates(id,name,plan_label,active,archived,sort_order) VALUES ('strength-c','Strength C','A / C rotation',1,0,2)`).run();
  legacy.prepare(`INSERT INTO template_exercises(id,template_id,exercise_id,sort_order,work_set_count,rep_min,rep_max,rest_seconds,increment,warmup_enabled,optional_final_ramp) VALUES ('c-trap','strength-c','trapbar',1,3,5,6,165,10,0,0)`).run();
  const stamp='2026-09-05T12:00:00.000Z';
  legacy.prepare(`INSERT INTO sessions(id,template_id,template_name_snapshot,performed_local_date,performed_at_utc,timezone,time_precision,status,entry_source,created_at,updated_at) VALUES ('historic','strength-c','Strength C','2026-09-04',?,'America/Los_Angeles','datetime','completed','live',?,?)`).run(stamp,stamp,stamp);
  legacy.prepare(`INSERT INTO session_exercises(id,session_id,exercise_id,prescribed_exercise_id,sort_order,name_snapshot,tracking_mode_snapshot,load_basis_snapshot,unit_snapshot,prescription_snapshot,status) VALUES ('historic-trap','historic','trapbar','trapbar',1,'Trap-bar deadlift','sets','external_total','lb',?,'completed')`).run(JSON.stringify({equipmentMin:null,loadStep:10,warmupEnabled:false,optionalFinalRamp:false}));
  legacy.prepare(`INSERT INTO sessions(id,template_id,template_name_snapshot,performed_local_date,performed_at_utc,timezone,time_precision,status,entry_source,created_at,updated_at) VALUES ('active','strength-c','Strength C','2026-09-05',?,'America/Los_Angeles','datetime','in_progress','live',?,?)`).run(stamp,stamp,stamp);
  legacy.prepare(`INSERT INTO session_exercises(id,session_id,exercise_id,prescribed_exercise_id,sort_order,name_snapshot,tracking_mode_snapshot,load_basis_snapshot,unit_snapshot,prescription_snapshot,chosen_target_load,status) VALUES ('active-trap','active','trapbar','trapbar',1,'Trap-bar deadlift','sets','external_total','lb',?,172,'pending')`).run(JSON.stringify({workSetCount:3,repMin:5,repMax:6,equipmentMin:null,loadStep:10,warmupEnabled:false,optionalFinalRamp:false}));
  const insertWork=legacy.prepare(`INSERT INTO sets(id,session_exercise_id,sort_order,kind,prescribed_set_ordinal,target_load,target_rep_min,target_rep_max,status) VALUES (?,?,?,'work',?,172,5,6,'pending')`);
  for(let ordinal=1;ordinal<=3;ordinal++) insertWork.run(`legacy-work-${ordinal}`,'active-trap',ordinal,ordinal);
  legacy.close();

  const db=openDatabase(temporary.filename);
  assert.ok(db.prepare("PRAGMA table_info('exercises')").all().some((column)=>column.name==='bar_weight'));
  assert.deepEqual(db.prepare("SELECT name,bar_weight,equipment_min,warmup_default,optional_final_ramp FROM exercises WHERE id='trapbar'").get(),{name:'Trap-bar squat',bar_weight:52,equipment_min:72,warmup_default:1,optional_final_ramp:1});
  const historic=getSession(db,'historic').exercises[0];
  assert.equal(historic.name_snapshot,'Trap-bar deadlift');
  assert.equal(historic.prescription.warmupEnabled,false);
  const active=getSession(db,'active').exercises[0];
  assert.equal(active.name_snapshot,'Trap-bar deadlift');
  assert.deepEqual(active.sets.filter((set)=>set.kind==='warmup').map((set)=>set.target_load),[72,82,122,142]);
  assert.deepEqual({barWeight:active.prescription.barWeight,equipmentMin:active.prescription.equipmentMin,warmupEnabled:active.prescription.warmupEnabled},{barWeight:52,equipmentMin:72,warmupEnabled:true});
  db.close();
  removeTemporaryDatabase(temporary);
});
