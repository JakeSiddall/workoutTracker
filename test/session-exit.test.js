import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {openDatabase,createSession,getSession,getToday,logSet,addReps,resolveExercise,
  cancelSession,completeSession,saveSessionForLater,resumeSession,finalizeSavedSessions} from '../server/db.js';

const body = session => ({requestId:randomUUID(),revision:session.revision});
function fixture(t, {date='2026-09-05', timezone='America/Los_Angeles', at='2026-09-06T06:59:00Z', file=':memory:'}={}) {
  let current=new Date(at);
  const clock=()=>current;
  const db=openDatabase(file,{clock});
  t.after(()=>db.open&&db.close());
  const session=createSession(db,{requestId:randomUUID(),templateId:'strength-a',performedDate:date,timezone});
  return {db,session,clock,tick:value=>{current=new Date(value);}};
}
function progress(db, session) {
  const set=session.exercises[0].sets.find(row=>row.kind==='work');
  let s=logSet(db,session.id,set.id,{...body(session),actualLoad:135,actualReps:0,rir:2});
  s=addReps(db,s.id,s.exercises[2].id,{...body(s),reps:6});
  s=addReps(db,s.id,s.exercises[2].id,{...body(s),reps:4});
  return resolveExercise(db,s.id,s.exercises[3].id,body(s),'completed');
}
function assertFinal(before, after) {
  assert.equal(after.status,'completed');
  assert.equal(after.rest_ends_at,null);
  assert.equal(after.performed_local_date,before.performed_local_date);
  assert.equal(after.timezone,before.timezone);
  for(const [index,exercise] of before.exercises.entries()) {
    const result=after.exercises[index];
    for(const key of ['prescription_snapshot','actual_total_reps','actual_duration_seconds','actual_added_load','chosen_target_load']) assert.equal(result[key],exercise[key]);
    assert.deepEqual(result.pullupEntries,exercise.pullupEntries);
    for(const [i,row] of exercise.sets.entries()) {
      assert.deepEqual(result.sets[i],{...row,status:row.status==='pending'?'skipped':row.status});
    }
  }
  assert.equal(after.exercises[0].status,'completed');
  assert.equal(after.exercises[1].status,'skipped');
  assert.equal(after.exercises[2].status,'completed');
  assert.equal(after.exercises[3].status,'completed');
  assert.equal(after.exercises[3].actual_duration_seconds,null);
  assert.equal(after.exercises[4].status,'skipped');
}

test('cancel retains audit data but never contributes to completed history or rotation',t=>{
  const {db,session}=fixture(t);
  const before=progress(db,session);
  const request=body(before);
  const cancelled=cancelSession(db,before.id,request);
  assert.equal(cancelled.status,'abandoned');
  assert.deepEqual(cancelled.exercises,before.exercises);
  assert.equal(getToday(db).activeSessionId,null);
  assert.equal(getToday(db).recommendedTemplateId,'strength-a');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sessions WHERE status='completed'").get().n,0);
  assert.deepEqual(cancelSession(db,before.id,request),cancelled);
  assert.throws(()=>completeSession(db,before.id,body(cancelled)),e=>e.status===409);
  assert.throws(()=>addReps(db,before.id,before.exercises[2].id,{...body(cancelled),reps:1}),e=>e.status===409);
  const next=createSession(db,{requestId:randomUUID(),templateId:'strength-a',performedDate:'2026-09-05',timezone:'America/Los_Angeles'});
  assert.equal(next.exercises[0].suggestion_load,session.exercises[0].suggestion_load);
});

test('end submits partial progress, preserves exact confirmed records, and skips only pending work',t=>{
  const {db,session}=fixture(t);
  const before=progress(db,session);
  const request=body(before);
  const ended=completeSession(db,before.id,request);
  assertFinal(before,ended);
  assert.equal(ended.revision,before.revision+1);
  assert.deepEqual(completeSession(db,before.id,request),ended);
  assert.equal(getToday(db).recommendedTemplateId,'strength-c');
  assert.throws(()=>cancelSession(db,before.id,request),e=>e.status===409);
});

test('save retains focus, timer, undo entries, and original day across same-day resume',t=>{
  const {db,session,tick}=fixture(t);
  const before=progress(db,session);
  const request=body(before);
  const saved=saveSessionForLater(db,before.id,request);
  assert.equal(saved.status,'in_progress');
  assert.deepEqual(saved.exercises,before.exercises);
  assert.equal(saved.rest_ends_at,before.rest_ends_at);
  assert.equal(saved.active_exercise_order,before.active_exercise_order);
  assert.deepEqual(saveSessionForLater(db,before.id,request),saved);
  assert.equal(getToday(db).activeSessionId,saved.id);
  tick('2026-09-06T06:59:59.999Z');
  const resumed=resumeSession(db,saved.id,body(saved));
  assert.equal(resumed.status,'in_progress');
  assert.equal(resumed.saved_for_later_at,saved.saved_for_later_at);
  tick('2026-09-06T07:00:00Z');
  const expired=getSession(db,saved.id);
  assertFinal(before,expired);
  assert.equal(expired.actual_ended_at,null,'background finalization does not invent an exercise end time');
  assert.equal(expired.revision,resumed.revision+1);
  assert.equal(getToday(db).activeSessionId,null);
  assert.equal(getToday(db).recommendedTemplateId,'strength-c');
  assert.equal(getSession(db,saved.id).revision,expired.revision,'expiration runs once');
  assert.equal(saveSessionForLater(db,saved.id,request).status,'completed','retry cannot revive expired session');
  assert.throws(()=>resumeSession(db,saved.id,body(resumed)),e=>e.status===409&&e.current.status==='completed');
});

test('expiration uses stored timezone across UTC and DST boundaries',t=>{
  for(const item of [
    {timezone:'Pacific/Kiritimati',date:'2026-09-05',before:'2026-09-05T09:59:59Z',after:'2026-09-05T10:00:00Z'},
    {timezone:'America/Los_Angeles',date:'2026-11-01',before:'2026-11-02T07:59:59Z',after:'2026-11-02T08:00:00Z'},
    {timezone:'America/Los_Angeles',date:'2026-03-08',before:'2026-03-09T06:59:59Z',after:'2026-03-09T07:00:00Z'}
  ]) {
    const {db,session,tick}=fixture(t,{timezone:item.timezone,date:item.date,at:item.before});
    const saved=saveSessionForLater(db,session.id,body(session));
    assert.equal(getToday(db).activeSessionId,saved.id);
    tick(item.after);finalizeSavedSessions(db);
    assert.equal(getSession(db,saved.id).status,'completed');
  }
});

test('stale mutations cannot roll back expiration or overwrite another exit choice',t=>{
  const {db,session,tick}=fixture(t);
  const saved=saveSessionForLater(db,session.id,body(session));
  assert.throws(()=>cancelSession(db,session.id,body(session)),e=>e.status===409&&e.current.revision===saved.revision);
  tick('2026-09-06T07:00:00Z');
  assert.throws(()=>addReps(db,session.id,session.exercises[2].id,{...body(saved),reps:6}),e=>e.status===409&&e.current.status==='completed');
  assert.equal(getSession(db,session.id).status,'completed');
  assert.equal(getSession(db,session.id).exercises[2].actual_total_reps,null);
});

test('only explicitly saved sessions expire; saving after original-day midnight finalizes immediately',t=>{
  const {db,session,tick}=fixture(t);
  tick('2026-09-08T10:00:00Z');
  assert.equal(getSession(db,session.id).status,'in_progress');
  const result=saveSessionForLater(db,session.id,body(session));
  assert.equal(result.status,'completed');
  assert.equal(getToday(db).activeSessionId,null);
});

test('schema migration and saved-session expiration survive restart',t=>{
  const directory=mkdtempSync(path.join(tmpdir(),'workout-exit-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const filename=path.join(directory,'test.sqlite');
  const legacy=new Database(filename);
  legacy.exec(readFileSync(new URL('../server/schema.sql',import.meta.url),'utf8').replace('  saved_for_later_at TEXT,\n','').replace(/CREATE TABLE IF NOT EXISTS exit_mutation_requests \([\s\S]*?\);/,''));
  legacy.close();
  const {db,session,clock,tick}=fixture(t,{file:filename});
  // Old releases insert three values into the receipt table. Keep that rollback path compatible.
  db.prepare('INSERT INTO mutation_requests VALUES (?,?,?)').run('legacy-request','{}','2026-09-05T12:00:00Z');
  const before=progress(db,session);
  const saved=saveSessionForLater(db,session.id,body(before));
  db.close();
  let reopened=openDatabase(filename,{clock});
  assert.deepEqual(getSession(reopened,saved.id),saved);
  reopened.close();
  tick('2026-09-06T07:00:00Z');
  reopened=openDatabase(filename,{clock});
  assertFinal(before,getSession(reopened,saved.id));
  assert.equal(reopened.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  reopened.close();
});

test('exit mutation validation and request identity are enforced',t=>{
  const {db,session}=fixture(t);
  for(const invalid of [{revision:0},{requestId:'',revision:0},{requestId:'valid',revision:0.5}]) {
    assert.throws(()=>cancelSession(db,session.id,invalid),e=>e.status===400);
  }
  const request=body(session);
  const saved=saveSessionForLater(db,session.id,request);
  assert.throws(()=>saveSessionForLater(db,session.id,{...request,revision:saved.revision}),e=>e.status===409);
  assert.throws(()=>createSession(db,{requestId:'bad-zone',performedDate:'2026-09-05',timezone:'invalid/zone',templateId:'strength-a'}),e=>e.status===400);
});
