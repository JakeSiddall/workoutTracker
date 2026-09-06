import React,{useEffect,useMemo,useRef,useState} from 'react';
import ExitWorkout from './exit-workout.js';
import {createRoot} from 'react-dom/client';
import './styles.css';

const requestId=()=>crypto.randomUUID();
async function api(url,options={}){const r=await fetch(url,{headers:{'content-type':'application/json'},...options});const data=await r.json();if(!r.ok)throw Object.assign(new Error(data.error||'Request failed'),{data});return data}
function Timer({deadline,onExtend}){const [now,setNow]=useState(Date.now());useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(id)},[]);if(!deadline)return null;const seconds=Math.max(0,Math.ceil((new Date(deadline).getTime()-now)/1000));return <section className="timer" aria-live="polite"><span>Suggested rest remaining</span><strong>{seconds?`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:'Ready when you are'}</strong><button type="button" onClick={onExtend}>+30 sec locally</button></section>}
function Today({today,onStart,onResume}){const [selected,setSelected]=useState(today.recommendedTemplateId);const t=today.templates.find(x=>x.id===selected);return <main><p className="eyebrow">A / C rotation</p><h1>Today</h1><p className="muted">Next in your rotation: {today.templates.find(x=>x.id===today.recommendedTemplateId)?.name}</p>{today.activeSessionId?<button className="primary full" onClick={()=>onResume(today.activeSessionId)}>Resume workout</button>:<><label>Workout<select value={selected} onChange={e=>setSelected(e.target.value)}>{today.templates.map(x=><option key={x.id} value={x.id}>{x.name}{x.id===today.recommendedTemplateId?' · recommended':''}</option>)}</select></label><section className="card"><h2>{t.name}</h2>{t.exercises.map((x,i)=><div className="rule" key={x}>{i+1}. {x}</div>)}</section><button className="primary full" onClick={()=>onStart(selected)}>Start workout</button></>}</main>}
function SetExercise({session,exercise,save,onResolve}){const next=exercise.sets.find(s=>s.status==='pending');const p=exercise.prescription;const [weight,setWeight]=useState(exercise.chosen_target_load??'');const [actualWeight,setActualWeight]=useState(next?.target_load??'');const [actualReps,setActualReps]=useState(next?.target_rep_min??'');const [rir,setRir]=useState('');const [barWeight,setBarWeight]=useState(p.barWeight??'');const [equipmentMinimum,setEquipmentMinimum]=useState(p.equipmentMin??'');const [loadStep,setLoadStep]=useState(p.loadStep??'');const [warmupEnabled,setWarmupEnabled]=useState(Boolean(p.warmupEnabled));const [optionalFinalRamp,setOptionalFinalRamp]=useState(Boolean(p.optionalFinalRamp));useEffect(()=>{setActualWeight(next?.target_load??'');setActualReps(next?.target_rep_min??'');setRir('')},[next?.id,next?.target_load,next?.target_rep_min]);useEffect(()=>{setWeight(exercise.chosen_target_load??'');setBarWeight(p.barWeight??'');setEquipmentMinimum(p.equipmentMin??'');setLoadStep(p.loadStep??'');setWarmupEnabled(Boolean(p.warmupEnabled));setOptionalFinalRamp(Boolean(p.optionalFinalRamp))},[exercise.id,p.barWeight,p.equipmentMin,p.loadStep,p.warmupEnabled,p.optionalFinalRamp,exercise.chosen_target_load]);const updateTarget=()=>save(`/api/sessions/${session.id}/exercises/${exercise.id}/target`,'PATCH',{chosenTargetLoad:Number(weight)});const saveWarmups=()=>save(`/api/sessions/${session.id}/exercises/${exercise.id}/warmup-settings`,'PATCH',{barWeight:barWeight===''?null:Number(barWeight),equipmentMinimum:equipmentMinimum===''?null:Number(equipmentMinimum),loadStep:loadStep===''?null:Number(loadStep),warmupEnabled,optionalFinalRamp});const log=()=>save(`/api/sessions/${session.id}/sets/${next.id}/log`,'POST',{actualLoad:Number(actualWeight),actualReps:Number(actualReps),rir:rir===''?null:Number(rir)});return <><p>Target: {p.workSetCount} work sets × {p.repMin}–{p.repMax} reps</p><label>Weight for remaining sets · total {exercise.unit_snapshot}<span className="inline"><input type="number" value={weight} min="0" step={p.loadStep||1} onChange={e=>setWeight(e.target.value)}/><button type="button" onClick={updateTarget}>Apply</button></span></label><p className="muted">Suggested {exercise.suggestion_load??'not set'} {exercise.unit_snapshot||''} · logged targets and actuals stay unchanged</p>{exercise.load_basis_snapshot==='external_total'&&<details className="equipment-settings"><summary>Warm-up settings</summary><p className="muted">These are total weights, including the bar, not weight per side. Changes apply to this exercise in future workouts too.</p><div className="fields"><label>Bar weight · {exercise.unit_snapshot}<input type="number" inputMode="decimal" min="0" step="0.5" value={barWeight} onChange={e=>setBarWeight(e.target.value)}/></label><label>Lightest total warm-up · {exercise.unit_snapshot}<input type="number" inputMode="decimal" min="0" step="0.5" value={equipmentMinimum} onChange={e=>setEquipmentMinimum(e.target.value)}/></label></div><label>Practical total-load increment · {exercise.unit_snapshot}<input type="number" inputMode="decimal" min="0.5" step="0.5" value={loadStep} onChange={e=>setLoadStep(e.target.value)}/></label><label className="check"><input type="checkbox" checked={warmupEnabled} onChange={e=>setWarmupEnabled(e.target.checked)}/><span>Generate warm-up sets for this exercise</span></label><label className="check"><input type="checkbox" checked={optionalFinalRamp} disabled={!warmupEnabled} onChange={e=>setOptionalFinalRamp(e.target.checked)}/><span>Add the final 85% ramp</span></label><button type="button" onClick={saveWarmups}>Save warm-up settings</button></details>}<details><summary>Warm-ups &amp; work sets · {exercise.sets.filter(x=>x.status!=='pending').length} resolved</summary>{exercise.sets.map(s=><div className="setrow" key={s.id}><span>{s.kind==='warmup'?'Warm-up':`Work set ${s.prescribed_set_ordinal}`}<small>{s.target_load??'—'} total {exercise.unit_snapshot} × {s.target_rep_min}{s.target_rep_max!==s.target_rep_min?`–${s.target_rep_max}`:''}</small></span><span>{s.status==='completed'?`✓ ${s.actual_load} × ${s.actual_reps}`:s.status==='skipped'?'Skipped':s.id===next?.id?'Next':'—'}</span></div>)}</details>{next?<section className="current"><h2>{next.kind==='warmup'?'Warm-up':`Work set ${next.prescribed_set_ordinal}`}</h2><p>Target: {next.target_load??'Choose load'} total {exercise.unit_snapshot} × {next.target_rep_min}{next.target_rep_max!==next.target_rep_min?`–${next.target_rep_max}`:''}</p><div className="fields"><label>Actual total {exercise.unit_snapshot}<input type="number" min="0" value={actualWeight} onChange={e=>setActualWeight(e.target.value)}/></label><label>Actual reps<input type="number" min="0" step="1" value={actualReps} onChange={e=>setActualReps(e.target.value)}/></label></div><label>Reps in reserve · optional<select value={rir} onChange={e=>setRir(e.target.value)}><option value="">Not recorded</option>{[0,1,2,3].map(x=><option key={x}>{x}</option>)}</select></label><button className="primary full" onClick={log}>Log set</button><button className="plain full" onClick={()=>save(`/api/sessions/${session.id}/sets/${next.id}/skip`,'POST',{})}>Skip set</button></section>:<button className="primary full" onClick={()=>onResolve('completed')}>Complete exercise</button>}</>}
function Pullups({session,exercise,save,onResolve}){const [batch,setBatch]=useState('');const [total,setTotal]=useState(exercise.actual_total_reps??0);const [load,setLoad]=useState(exercise.actual_added_load??0);useEffect(()=>setTotal(exercise.actual_total_reps??0),[exercise.actual_total_reps]);return <><p className="muted">Bodyweight · target {exercise.target_total_reps??'not set'}</p><div className="count">{exercise.actual_total_reps??0}<small> total reps</small></div><section className="current"><label>Reps just completed<input inputMode="numeric" value={batch} placeholder="e.g. 6" onChange={e=>setBatch(e.target.value)}/></label><button className="primary full" onClick={async()=>{await save(`/api/sessions/${session.id}/exercises/${exercise.id}/reps`,'POST',{reps:Number(batch)});setBatch('')}}>Add reps</button></section>{exercise.pullupEntries.length>0&&<button className="plain" onClick={()=>save(`/api/sessions/${session.id}/exercises/${exercise.id}/reps/undo`,'POST',{})}>Undo last entry ({exercise.pullupEntries.at(-1).reps})</button>}<details><summary>Correct total or added weight</summary><label>Actual total reps<input type="number" min="0" step="1" value={total} onChange={e=>setTotal(e.target.value)}/></label><label>Added weight · lb<input type="number" min="0" value={load} onChange={e=>setLoad(e.target.value)}/></label><button onClick={()=>save(`/api/sessions/${session.id}/exercises/${exercise.id}/total`,'PATCH',{actualTotalReps:Number(total),actualAddedLoad:Number(load)})}>Save correction</button></details><button className="full" onClick={()=>onResolve('completed')}>Finish pull-ups · I’m done</button></>}
function Duration({onResolve}){const [minutes,setMinutes]=useState('');return <section className="current"><h2>8–10 minutes</h2><p className="muted">Follow your existing PT routine.</p><label>Actual minutes · optional<input type="number" min="0" value={minutes} placeholder="Not recorded" onChange={e=>setMinutes(e.target.value)}/></label><button className="primary full" onClick={()=>onResolve('completed',minutes===''?{}:{actualDurationSeconds:Math.round(Number(minutes)*60)})}>Mark done &amp; continue</button><button className="full" onClick={()=>onResolve('skipped')}>Skip exercise</button></section>}
function Workout({initial,onChange,onDone}){
  const [session,setSession]=useState(initial);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const inFlight=useRef(false);
  const current=useMemo(()=>session.exercises.find(e=>e.sort_order===session.active_exercise_order)??session.exercises.find(e=>e.status==='pending'),[session]);
  async function save(url,method,body){
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');
    try{
      const updated=await api(url,{method,body:JSON.stringify({requestId:requestId(),revision:session.revision,...body})});
      setSession(updated);
      return updated;
    }catch(e){
      setError(e.message);
      if(e.data?.current)setSession(e.data.current);
    }finally{inFlight.current=false;setBusy(false);}
  }
  function resolve(status,extra={}){
    return save(`/api/sessions/${session.id}/exercises/${current.id}/${status==='skipped'?'skip':'complete'}`,'POST',extra);
  }
  const [localDeadline,setLocalDeadline]=useState(session.rest_ends_at);
  useEffect(()=>setLocalDeadline(session.rest_ends_at),[session.rest_ends_at]);
  // Refresh on foregrounding and across midnight so an expired saved workout closes.
  useEffect(()=>{
    let disposed=false;
    const refresh=async()=>{
      if(inFlight.current||document.visibilityState==='hidden')return;
      try{
        const updated=await api(`/api/sessions/${initial.id}`);
        if(!disposed&&!inFlight.current)setSession(previous=>updated.revision>=previous.revision?updated:previous);
      }catch{} // Mutation errors remain explicit; a read retry must not discard local inputs.
    };
    const timer=setInterval(refresh,30000);
    window.addEventListener('focus',refresh);
    document.addEventListener('visibilitychange',refresh);
    return()=>{disposed=true;clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[initial.id]);
  if(session.status!=='in_progress')return <main><h1>Workout {session.status==='abandoned'?'cancelled':'completed'}</h1><p>Your recorded progress has been preserved. This workout is no longer in progress.</p><button className="primary full" onClick={onDone}>Return home</button></main>;
  return <main>
    <header className="workhead"><span>Strength workout</span><span className="muted">{current?`Exercise ${current.sort_order} of ${session.exercises.length}`:'Ready to finish'}</span></header>
    <ExitWorkout session={session} request={api} onHome={onDone} onConflict={setSession} disabled={busy}/>
    {current?<><details><summary>Workout order</summary>{session.exercises.map(x=><div className="rule" key={x.id}>{x.sort_order}. {x.name_snapshot} · {x.status}</div>)}</details>
    <h1>{current.name_snapshot}</h1>
    <Timer deadline={localDeadline} onExtend={()=>setLocalDeadline(new Date(Math.max(Date.now(),new Date(localDeadline).getTime())+30000).toISOString())}/>
    <fieldset className="workout-controls" disabled={busy}>
      {current.tracking_mode_snapshot==='sets'?<SetExercise key={current.id} session={session} exercise={current} save={save} onResolve={resolve}/>:current.tracking_mode_snapshot==='total_reps'?<Pullups key={current.id} session={session} exercise={current} save={save} onResolve={resolve}/>:<Duration key={current.id} onResolve={resolve}/>}
      <button className="plain full" onClick={()=>resolve('skipped')}>Skip to next exercise</button>
    </fieldset></>:<><h1>Workout logged</h1><button className="primary full" disabled={busy} onClick={async()=>{const result=await save(`/api/sessions/${session.id}/complete`,'POST',{});if(result)onDone();}}>Finish workout</button></>}
    {error&&<p className="error" role="alert">{error}</p>}
  </main>;
}
function App(){
  const [today,setToday]=useState(null);
  const [session,setSession]=useState(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  async function loadToday(){setToday(await api('/api/today'));}
  async function home(result){
    setSession(null);setToday(null);
    setNotice(result?.status==='abandoned'?'Workout cancelled.':result?.status==='completed'?'Workout submitted.':result?.saved_for_later_at?'Saved for later. Resume today.':'');
    try{await loadToday();}catch(e){setError(e.message);}
  }
  useEffect(()=>{loadToday().catch(e=>setError(e.message));},[]);
  useEffect(()=>{
    if(session)return;
    const refresh=()=>{if(document.visibilityState!=='hidden')loadToday().catch(()=>{});};
    const timer=setInterval(refresh,30000);
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[session]);
  async function open(id){
    try{
      const current=await api(`/api/sessions/${id}`);
      if(current.status!=='in_progress'){await home(current);return;}
      const resumed=await api(`/api/sessions/${id}/resume`,{method:'POST',body:JSON.stringify({requestId:requestId(),revision:current.revision})});
      if(resumed.status==='in_progress'){setSession(resumed);setNotice('');}else await home(resumed);
    }catch(e){if(e.data?.current?.status!=='in_progress'&&e.data?.current)await home(e.data.current);else setError(e.message);}
  }
  async function start(templateId){
    try{const x=await api('/api/sessions',{method:'POST',body:JSON.stringify({requestId:requestId(),templateId,performedDate:new Date().toLocaleDateString('en-CA'),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone})});setSession(x);setNotice('');}catch(e){setError(e.message);}
  }
  if(error)return <main><h1>Workout Tracker</h1><p className="error">{error}</p><button onClick={()=>location.reload()}>Retry</button></main>;
  if(session?.status==='in_progress')return <Workout initial={session} onDone={home}/>;
  if(!today)return <main><p>Loading…</p></main>;
  return <>{notice&&<p className="home-notice" role="status">{notice}</p>}<Today key={`${today.activeSessionId}:${today.recommendedTemplateId}`} today={today} onStart={start} onResume={open}/></>;
}
createRoot(document.getElementById('root')).render(<App/>);
