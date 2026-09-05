import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { once } from 'node:events';

test('server readiness and browser mutation boundary', async () => {
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const directory = await mkdtemp(path.join(tmpdir(), 'workout-http-'));
  const server = spawn(process.execPath, ['server/index.js'], {
    env: {...process.env, PORT:String(port), HOST:'127.0.0.1', WORKOUT_DB:path.join(directory,'test.sqlite'), APP_ORIGIN:'https://lift.jakesiddall.com'},
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let attempt=0; attempt<50; attempt++) {
      try { if ((await fetch(`${base}/api/health`)).ok) { ready=true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'server becomes ready');
    assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), {ok:true,database:true});
    const create = (headers) => fetch(`${base}/api/sessions`, {method:'POST', headers, body:JSON.stringify({requestId:'http-test',templateId:'strength-a',performedDate:'2026-09-05',timezone:'America/Los_Angeles'})});
    assert.equal((await create({'content-type':'application/json',origin:'https://untrusted.example'})).status,403);
    assert.equal((await create({'content-type':'text/plain',origin:'https://lift.jakesiddall.com'})).status,415);
    assert.equal((await create({'content-type':'application/json',origin:'https://lift.jakesiddall.com','sec-fetch-site':'cross-site'})).status,403);
    const headers={'content-type':'application/json',origin:'https://lift.jakesiddall.com'};
    const created=await create(headers);
    assert.equal(created.status,201);
    let session=await created.json();
    // Use today's date in the stored timezone so this HTTP test is calendar-independent.
    const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Los_Angeles'});
    const cancelBody={requestId:'http-cancel',revision:session.revision};
    const mutation=(action,body,customHeaders=headers)=>fetch(`${base}/api/sessions/${session.id}/${action}`,{method:'POST',headers:customHeaders,body:JSON.stringify(body)});
    for(const action of ['cancel','complete','save-for-later','resume']) {
      assert.equal((await mutation(action,cancelBody,{...headers,origin:'https://untrusted.example'})).status,403);
      assert.equal((await mutation(action,cancelBody,{...headers,'content-type':'text/plain'})).status,415);
      assert.equal((await mutation(action,{requestId:'invalid-revision'})).status,400);
    }
    const cancelled=await mutation('cancel',cancelBody);
    assert.equal(cancelled.status,200);
    assert.equal((await cancelled.json()).status,'abandoned');
    assert.equal((await (await mutation('cancel',cancelBody)).json()).status,'abandoned');
    assert.equal((await (await fetch(`${base}/api/today`)).json()).recommendedTemplateId,'strength-a');
    session=await (await fetch(`${base}/api/sessions`,{method:'POST',headers,body:JSON.stringify({requestId:'http-new',templateId:'strength-a',performedDate:today,timezone:'America/Los_Angeles'})})).json();
    const work=session.exercises[0].sets.find(row=>row.kind==='work');
    const logged=await fetch(`${base}/api/sessions/${session.id}/sets/${work.id}/log`,{method:'POST',headers,body:JSON.stringify({requestId:'http-log',revision:session.revision,actualLoad:125,actualReps:4})});
    assert.equal(logged.status,200);session=await logged.json();
    const staleRevision=session.revision;
    session=await (await mutation('save-for-later',{requestId:'http-save',revision:session.revision})).json();
    assert.equal(session.status,'in_progress');assert.ok(session.saved_for_later_at);
    assert.equal((await (await fetch(`${base}/api/today`)).json()).activeSessionId,session.id);
    assert.equal((await mutation('cancel',{requestId:'http-stale',revision:staleRevision})).status,409);
    session=await (await mutation('resume',{requestId:'http-resume',revision:session.revision})).json();
    const endBody={requestId:'http-end',revision:session.revision};
    session=await (await mutation('complete',endBody)).json();
    assert.equal(session.status,'completed');
    assert.equal(session.exercises[0].sets.find(row=>row.id===work.id).actual_reps,4);
    assert.ok(session.exercises.flatMap(exercise=>exercise.sets).every(row=>row.status!=='pending'));
    assert.equal((await (await mutation('complete',endBody)).json()).revision,session.revision);
    assert.equal((await mutation('resume',{requestId:'http-resume-ended',revision:session.revision})).status,409);
    assert.equal((await (await fetch(`${base}/api/today`)).json()).recommendedTemplateId,'strength-c');
  } finally {
    const stopped = once(server, 'exit');
    server.kill('SIGTERM');
    await stopped;
    await rm(directory, {recursive:true,force:true});
  }
});
