function roundRelative(value, minimum, step) {
  const units = (value - minimum) / step;
  const lower = Math.floor(units);
  const fraction = units - lower;
  return minimum + (fraction > 0.5 ? lower + 1 : lower) * step;
}

export function generateWarmups({
  chosenWorkLoad,
  equipmentMinimum,
  step,
  optionalFinalRamp = false,
  completedWarmups = [],
  workStarted = false
}) {
  if (workStarted) return completedWarmups.map(normalizeCompleted);
  if (![chosenWorkLoad, equipmentMinimum, step].every(Number.isFinite) || step <= 0) return completedWarmups.map(normalizeCompleted);
  const definitions = [
    { fraction: null, repMin: 8, repMax: 10 },
    { fraction: 0.5, repMin: 5, repMax: 5 },
    { fraction: 0.7, repMin: 3, repMax: 3 },
    ...(optionalFinalRamp ? [{ fraction: 0.85, repMin: 1, repMax: 2 }] : [])
  ];
  const loads = definitions.map((d) => ({
    ...d,
    load: d.fraction == null ? equipmentMinimum : Math.max(equipmentMinimum, roundRelative(chosenWorkLoad * d.fraction, equipmentMinimum, step))
  })).filter((d, i, rows) => d.load < chosenWorkLoad && rows.findIndex((x) => x.load === d.load) === i);
  const complete = completedWarmups.map(normalizeCompleted);
  const lastCompletedLoad = complete.length ? complete.at(-1).load : -Infinity;
  const pending = loads.filter((r) => r.load > lastCompletedLoad && !complete.some((c) => c.load === r.load));
  return [...complete, ...pending];
}

function normalizeCompleted(row) {
  return {
    load: row.load ?? row.actual_load ?? row.target_load,
    repMin: row.repMin ?? row.target_rep_min,
    repMax: row.repMax ?? row.target_rep_max,
    completed: true,
    actualLoad: row.actualLoad ?? row.actual_load ?? null,
    actualReps: row.actualReps ?? row.actual_reps ?? null
  };
}
