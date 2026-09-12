// Apply the current routine only when making a new snapshot. Stored templates,
// equipment choices, session snapshots and actuals remain untouched.
export function prospectiveRoutine(rows, templateId, exercises) {
  if (!['strength-a', 'strength-c'].includes(templateId)) return rows;
  return rows.flatMap(row => {
    if (row.exercise_id !== 'pt') return [row];
    return [
      {...row, ...exercises.wall, exercise_id:'wall', work_set_count:3,
        rep_min:null, rep_max:null, duration_min_seconds:60, duration_max_seconds:null,
        rest_seconds:null, increment:null, warmup_enabled:0, optional_final_ramp:0},
      {...row, ...exercises.goblet, exercise_id:'goblet', work_set_count:3,
        rep_min:8, rep_max:12, duration_min_seconds:null, duration_max_seconds:null,
        rest_seconds:null, increment:null, warmup_enabled:0, optional_final_ramp:0}
    ];
  }).map((row, i) => ({...row, sort_order:i + 1}));
}
