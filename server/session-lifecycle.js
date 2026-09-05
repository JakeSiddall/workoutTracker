// Calendar dates are compared in the workout's timezone, never the server's.
export function localDate(instant, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(instant);
  const part = type => parts.find(value => value.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function validateSessionCalendar(date, timezone) {
  try {
    if (typeof timezone !== 'string' || !timezone.trim()) throw new Error();
    localDate(new Date(), timezone);
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error();
  } catch {
    throw Object.assign(new Error('A valid performed date and timezone are required'), {status: 400});
  }
}

export function finalizeSession(db, sessionId, endedAt) {
  // A partially logged exercise remains performed; only unresolved rows are skipped.
  db.prepare(`UPDATE session_exercises SET status = CASE
    WHEN actual_total_reps IS NOT NULL OR actual_duration_seconds IS NOT NULL OR
      EXISTS (SELECT 1 FROM sets WHERE session_exercise_id=session_exercises.id AND status='completed')
    THEN 'completed' ELSE 'skipped' END
    WHERE session_id=? AND status='pending'`).run(sessionId);
  db.prepare(`UPDATE sets SET status='skipped' WHERE status='pending'
    AND session_exercise_id IN (SELECT id FROM session_exercises WHERE session_id=?)`).run(sessionId);
  db.prepare(`UPDATE sessions SET status='completed',actual_ended_at=?,rest_ends_at=NULL WHERE id=?`)
    .run(endedAt, sessionId);
}

export function expireSavedSessions(db, instant) {
  return db.transaction(() => {
    const sessions = db.prepare(`SELECT * FROM sessions
      WHERE status='in_progress' AND saved_for_later_at IS NOT NULL`).all();
    for (const session of sessions) {
      validateSessionCalendar(session.performed_local_date, session.timezone);
      if (localDate(instant, session.timezone) <= session.performed_local_date) continue;
      // Expiration is bookkeeping, not evidence of when the user stopped exercising.
      finalizeSession(db, session.id, null);
      db.prepare('UPDATE sessions SET revision=revision+1,updated_at=? WHERE id=?')
        .run(instant.toISOString(), session.id);
    }
  })();
}
