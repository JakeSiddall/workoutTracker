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
    assert.equal((await create({'content-type':'application/json',origin:'https://lift.jakesiddall.com'})).status,201);
  } finally {
    const stopped = once(server, 'exit');
    server.kill('SIGTERM');
    await stopped;
    await rm(directory, {recursive:true,force:true});
  }
});
