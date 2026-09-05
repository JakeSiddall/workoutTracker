import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createExitSubmission,ExitOptions,exitChoices} from '../src/exit-workout.js';

test('exit UI describes every path and requires a second confirmation',()=>{
  const markup=renderToStaticMarkup(React.createElement(ExitOptions,{choice:null}));
  for(const choice of exitChoices)assert.ok(markup.includes(choice.label));
  assert.ok(markup.includes('Keep working out'));
  assert.ok(!markup.includes('Confirm:'));
  for(const choice of exitChoices) {
    const confirm=renderToStaticMarkup(React.createElement(ExitOptions,{choice:choice.action,busy:true,error:'Network unavailable'}));
    assert.ok(confirm.includes('Back to exit choices'));
    assert.ok(confirm.includes('disabled=""'));
    assert.ok(confirm.includes('role="alert"'));
  }
});

test('all three confirmed UI choices call their endpoint and then return home',async()=>{
  for(const {action} of exitChoices){
    const events=[];
    const submit=createExitSubmission({makeId:()=> 'request-ui',request:async(url,options)=>{
      events.push({url,options});return {status:action==='cancel'?'abandoned':action==='complete'?'completed':'in_progress'};
    },onHome:result=>events.push({home:result.status}),onConflict:()=>assert.fail()});
    await submit(action,{id:'session-ui',revision:7});
    assert.equal(events[0].url,`/api/sessions/session-ui/${action}`);
    assert.deepEqual(JSON.parse(events[0].options.body),{requestId:'request-ui',revision:7});
    assert.equal(events[0].options.method,'POST');assert.ok(events[1].home);
  }
});

test('network errors stay in the workout; retry uses the same identity and double click submits once',async()=>{
  const sent=[];let attempts=0;let homes=0;let release;
  const submit=createExitSubmission({makeId:()=>`request-${attempts}`,request:async(_url,options)=>{
    sent.push(JSON.parse(options.body));attempts++;
    if(attempts===1)throw new Error('Network unavailable');
    await new Promise(resolve=>{release=resolve;});return {status:'completed'};
  },onHome:()=>{homes++;},onConflict:()=>assert.fail()});
  const session={id:'session-ui',revision:3};
  await assert.rejects(submit('complete',session),/Network unavailable/);
  assert.equal(homes,0);
  const success=submit('complete',session);
  await submit('complete',session);
  release();await success;await submit('complete',session);
  assert.equal(homes,1);assert.equal(attempts,2);assert.deepEqual(sent[0],sent[1]);
});

test('a revision conflict keeps the user in the workout and requires reviewing current state',async()=>{
  let conflicted;let count=0;const sent=[];
  const submit=createExitSubmission({makeId:()=>`request-${++count}`,request:async(_url,options)=>{
    sent.push(JSON.parse(options.body));
    if(sent.length===1)throw Object.assign(new Error('Session changed elsewhere'),{data:{current:{id:'s',revision:4}}});
    return {status:'abandoned'};
  },onConflict:current=>{conflicted=current;},onHome:()=>{}});
  await assert.rejects(submit('cancel',{id:'s',revision:3}),/changed elsewhere/);
  assert.equal(conflicted.revision,4);
  await submit('cancel',conflicted);
  assert.notEqual(sent[0].requestId,sent[1].requestId);assert.equal(sent[1].revision,4);
});
