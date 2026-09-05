import React, {useEffect, useRef, useState} from 'react';

const h = React.createElement;
export const exitChoices = [
  {action:'save-for-later', label:'Save for later', consequence:'Return home and resume today. After midnight in this workout’s timezone, logged progress is submitted and remaining work is skipped.'},
  {action:'complete', label:'End and submit workout', consequence:'Submit logged progress now and skip remaining work. This workout will count in your history and rotation.'},
  {action:'cancel', label:'Cancel workout', consequence:'Abandon this workout. It will not count in your history or recommendations.'}
];

// A failed network request retains its identity; a second click cannot duplicate it.
export function createExitSubmission({request, makeId, onHome, onConflict}) {
  let pending = null;
  let busy = false;
  let finished = false;
  return async (action, session) => {
    if (busy || finished) return;
    busy = true;
    if (!pending || pending.action !== action || pending.revision !== session.revision) {
      pending = {action, revision:session.revision, requestId:makeId()};
    }
    try {
      const result = await request(`/api/sessions/${session.id}/${action}`, {
        method:'POST', body:JSON.stringify({requestId:pending.requestId,revision:pending.revision})
      });
      finished = true;
      await onHome(result);
      return result;
    } catch (error) {
      if (error.data?.current) {
        pending = null;
        onConflict(error.data.current);
      }
      throw error;
    } finally { busy = false; }
  };
}

export function ExitOptions({choice, onChoose, onKeep, onConfirm, busy, error}) {
  const selected = exitChoices.find(item => item.action === choice);
  return h(React.Fragment, null,
    h('h2', {id:'exit-title'}, selected ? selected.label : 'Exit workout'),
    selected
      ? h(React.Fragment, null,
          h('p', null, selected.consequence),
          h('button', {type:'button', className:'primary full', disabled:busy, onClick:onConfirm}, busy ? 'Saving…' : `Confirm: ${selected.label}`),
          h('button', {type:'button', className:'full', disabled:busy, onClick:()=>onChoose(null)}, 'Back to exit choices'))
      : exitChoices.map(item => h('section', {key:item.action},
          h('p', null, item.consequence),
          h('button', {type:'button', className:'full', onClick:()=>onChoose(item.action)}, item.label))),
    error && h('p', {className:'error', role:'alert'}, error),
    h('button', {type:'button', className:'plain full', disabled:busy, onClick:onKeep}, 'Keep working out')
  );
}

export default function ExitWorkout({session, request, onHome, onConflict, disabled=false}) {
  const dialog = useRef(null);
  const trigger = useRef(null);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submission = useRef(null);
  if (!submission.current) submission.current = createExitSubmission({request, makeId:()=>crypto.randomUUID(), onHome, onConflict});
  useEffect(() => {
    if (open) dialog.current.showModal();
    else if (dialog.current.open) dialog.current.close();
  }, [open]);
  const close = () => { if (!busy) {setOpen(false); setChoice(null); setError(''); trigger.current.focus();} };
  const confirm = async () => {
    setBusy(true); setError('');
    try { await submission.current(choice, session); }
    catch (failure) { setError(`${failure.message}. Review the workout or retry.`); }
    finally { setBusy(false); }
  };
  return h(React.Fragment, null,
    h('button', {ref:trigger,type:'button',className:'exit-trigger',disabled,onClick:()=>setOpen(true)}, 'Exit workout'),
    h('dialog', {ref:dialog,className:'exit-dialog','aria-labelledby':'exit-title',onCancel:event=>{event.preventDefault();close();}},
      h(ExitOptions, {choice,onChoose:setChoice,onKeep:close,onConfirm:confirm,busy,error}))
  );
}
