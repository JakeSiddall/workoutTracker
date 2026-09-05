import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase,getToday,createSession,getSession,setTarget,logSet,addReps,undoReps,resolveExercise,completeSession,correctSet } from '../server/db.js';

const rid=(()=>{let i=0;return()=>`request-${++i}`})();
test('JAK-6 complete Strength A persists exact snapshots and actuals',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'workout-jak6-')); const file=path.join(dir,'test.sqlite');
  let db=openDatabase(file);
  const today=getToday(db); assert.equal(today.recommendedTemplateId,'strength-a'); assert.deepEqual(today.templates.map(t=>t.id),['strength-a','strength-c']);
  const createRequest=rid();
  let s=createSession(db,{requestId:createRequest,templateId:'strength-a',performedDate:'2026-09-05',timezone:'America/Los_Angeles'});
  assert.deepEqual(s.exercises.map(e=>e.name_snapshot),['Bench press','Romanian deadlift','Pull-ups','Knee / PT','Calf raise']);
  const retry=createSession(db,{requestId:createRequest,templateId:'strength-a',performedDate:'2026-09-05',timezone:'America/Los_Angeles'});
  assert.equal(retry.id,s.id);
  let bench=s.exercises[0];
  s=setTarget(db,s.id,bench.id,{requestId:rid(),revision:s.revision,chosenTargetLoad:135}); bench=s.exercises[0];
  assert.deepEqual(bench.sets.filter(x=>x.kind==='warmup').map(x=>x.target_load),[45,65,95,115]);
  for(const row of bench.sets.filter(x=>x.kind==='warmup')) s=logSet(db,s.id,row.id,{requestId:rid(),revision:s.revision,actualLoad:row.target_load,actualReps:row.target_rep_min});
  bench=s.exercises[0]; const work1=bench.sets.find(x=>x.kind==='work'&&x.prescribed_set_ordinal===1);
  s=logSet(db,s.id,work1.id,{requestId:'log-work-1',revision:s.revision,actualLoad:145,actualReps:5});
  const firstDeadline=s.rest_ends_at; const duplicate=logSet(db,s.id,work1.id,{requestId:'log-work-1',revision:s.revision-1,actualLoad:145,actualReps:5});
  assert.equal(duplicate.revision,s.revision); assert.equal(duplicate.exercises[0].sets.filter(x=>x.status==='completed').length,5);
  s=setTarget(db,s.id,bench.id,{requestId:rid(),revision:s.revision,chosenTargetLoad:135}); bench=s.exercises[0];
  assert.equal(bench.sets.find(x=>x.prescribed_set_ordinal===1).target_load,135); // original target was already 135
  assert.equal(bench.sets.find(x=>x.prescribed_set_ordinal===1).actual_load,145);
  assert.equal(bench.sets.filter(x=>x.kind==='warmup').length,4); // no new ramp after work began
  const work2=bench.sets.find(x=>x.kind==='work'&&x.prescribed_set_ordinal===2);
  s=logSet(db,s.id,work2.id,{requestId:rid(),revision:s.revision,actualLoad:135,actualReps:4}); assert.ok(s.rest_ends_at>=firstDeadline);
  const work3=s.exercises[0].sets.find(x=>x.kind==='work'&&x.prescribed_set_ordinal===3);
  s=logSet(db,s.id,work3.id,{requestId:rid(),revision:s.revision,actualLoad:135,actualReps:0});
  assert.equal(s.exercises[0].sets.find(x=>x.id===work3.id).actual_reps,0);
  s=resolveExercise(db,s.id,bench.id,{requestId:rid(),revision:s.revision},'completed');
  const rdl=s.exercises[1]; s=resolveExercise(db,s.id,rdl.id,{requestId:rid(),revision:s.revision},'skipped');
  const pull=s.exercises[2]; s=addReps(db,s.id,pull.id,{requestId:'pull-6',revision:s.revision,reps:6}); const pullDeadline=s.rest_ends_at;
  s=addReps(db,s.id,pull.id,{requestId:'pull-4',revision:s.revision,reps:4}); assert.equal(s.exercises[2].actual_total_reps,10);assert.ok(s.rest_ends_at>=pullDeadline);
  const pullRetry=addReps(db,s.id,pull.id,{requestId:'pull-4',revision:s.revision-1,reps:4});assert.equal(pullRetry.exercises[2].actual_total_reps,10);
  // Equal clock timestamps must preserve insertion order, even with UUIDs that
  // sort in the opposite order. This reproduces the original flaky CI failure.
  db.prepare("UPDATE pullup_entries SET created_at='2026-09-05T00:00:00.000Z'").run();
  db.prepare("UPDATE pullup_entries SET id=CASE reps WHEN 6 THEN 'zz-first' ELSE 'aa-second' END").run();
  s=undoReps(db,s.id,pull.id,{requestId:rid(),revision:s.revision});assert.equal(s.exercises[2].actual_total_reps,6);
  s=addReps(db,s.id,pull.id,{requestId:rid(),revision:s.revision,reps:8});assert.equal(s.exercises[2].actual_total_reps,14);
  s=resolveExercise(db,s.id,pull.id,{requestId:rid(),revision:s.revision},'completed');
  const pt=s.exercises[3];s=resolveExercise(db,s.id,pt.id,{requestId:rid(),revision:s.revision},'completed');assert.equal(s.exercises[3].actual_duration_seconds,null);
  const calf=s.exercises[4];s=resolveExercise(db,s.id,calf.id,{requestId:rid(),revision:s.revision},'skipped');
  s=completeSession(db,s.id,{requestId:rid(),revision:s.revision});assert.equal(s.status,'completed');
  db.close(); db=openDatabase(file); let reopened=getSession(db,s.id);
  assert.equal(reopened.exercises[0].sets.find(x=>x.id===work1.id).actual_load,145);assert.equal(reopened.exercises[0].sets.find(x=>x.id===work2.id).actual_reps,4);assert.equal(reopened.exercises[2].actual_total_reps,14);
  reopened=correctSet(db,reopened.id,work2.id,{requestId:rid(),revision:reopened.revision,actualLoad:132.5,actualReps:4});db.close();db=openDatabase(file);assert.equal(getSession(db,s.id).exercises[0].sets.find(x=>x.id===work2.id).actual_load,132.5);db.close();fs.rmSync(dir,{recursive:true,force:true});
});
