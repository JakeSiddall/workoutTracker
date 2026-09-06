import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWarmups } from '../shared/warmups.js';

const loads = (work) => generateWarmups({chosenWorkLoad:work,equipmentMinimum:45,step:5,optionalFinalRamp:true}).map(x=>x.load);
test('approved bench ramps',()=>{assert.deepEqual(loads(145),[45,70,100,125]);assert.deepEqual(loads(135),[45,65,95,115])});
test('ties round down relative to minimum',()=>{assert.deepEqual(generateWarmups({chosenWorkLoad:100,equipmentMinimum:20,step:10}).map(x=>x.load),[20,50,70])});
test('duplicates and ramps at work load are omitted',()=>{assert.deepEqual(generateWarmups({chosenWorkLoad:50,equipmentMinimum:45,step:5,optionalFinalRamp:true}).map(x=>x.load),[45])});
test('completed warmups survive and pending ramps regenerate above them',()=>{const rows=generateWarmups({chosenWorkLoad:135,equipmentMinimum:45,step:5,optionalFinalRamp:true,completedWarmups:[{target_load:45,target_rep_min:8,target_rep_max:10,actual_load:45,actual_reps:8}]});assert.equal(rows[0].completed,true);assert.deepEqual(rows.map(x=>x.load),[45,65,95,115])});
test('work started prevents new warmups',()=>{const rows=generateWarmups({chosenWorkLoad:135,equipmentMinimum:45,step:5,optionalFinalRamp:true,completedWarmups:[{target_load:45,actual_load:45,actual_reps:8}],workStarted:true});assert.deepEqual(rows.map(x=>x.load),[45])});
test('trap-bar ramp uses the editable minimum and total-load step',()=>{assert.deepEqual(generateWarmups({chosenWorkLoad:172,equipmentMinimum:72,step:10,optionalFinalRamp:true}).map(x=>x.load),[72,82,122,142]);assert.deepEqual(generateWarmups({chosenWorkLoad:72,equipmentMinimum:72,step:10,optionalFinalRamp:true}),[])});
