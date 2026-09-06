PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tracking_mode TEXT NOT NULL CHECK (tracking_mode IN ('sets','total_reps','duration')),
  load_basis TEXT NOT NULL CHECK (load_basis IN ('external_total','per_hand','added_bodyweight','none')),
  unit TEXT,
  bar_weight REAL,
  equipment_min REAL,
  load_step REAL,
  warmup_default INTEGER NOT NULL DEFAULT 0 CHECK (warmup_default IN (0,1)),
  optional_final_ramp INTEGER NOT NULL DEFAULT 0 CHECK (optional_final_ramp IN (0,1)),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1))
);

CREATE TABLE IF NOT EXISTS workout_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan_label TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  sort_order INTEGER NOT NULL,
  UNIQUE(plan_label, sort_order)
);

CREATE TABLE IF NOT EXISTS template_exercises (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES workout_templates(id),
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  sort_order INTEGER NOT NULL,
  work_set_count INTEGER,
  rep_min INTEGER,
  rep_max INTEGER,
  total_rep_target INTEGER,
  duration_min_seconds INTEGER,
  duration_max_seconds INTEGER,
  rest_seconds INTEGER,
  increment REAL,
  warmup_enabled INTEGER NOT NULL DEFAULT 0 CHECK (warmup_enabled IN (0,1)),
  optional_final_ramp INTEGER NOT NULL DEFAULT 0 CHECK (optional_final_ramp IN (0,1)),
  UNIQUE(template_id, sort_order)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  template_id TEXT REFERENCES workout_templates(id),
  template_name_snapshot TEXT,
  performed_local_date TEXT NOT NULL,
  performed_at_utc TEXT,
  timezone TEXT,
  time_precision TEXT NOT NULL CHECK (time_precision IN ('date','datetime')),
  actual_started_at TEXT,
  actual_ended_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('in_progress','completed','abandoned')),
  entry_source TEXT NOT NULL CHECK (entry_source IN ('live','backfill','import')),
  import_source_key TEXT UNIQUE,
  notes TEXT,
  active_exercise_order INTEGER NOT NULL DEFAULT 1,
  rest_ends_at TEXT,
  saved_for_later_at TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_session ON sessions(status) WHERE status='in_progress';

CREATE TABLE IF NOT EXISTS session_exercises (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  prescribed_exercise_id TEXT NOT NULL REFERENCES exercises(id),
  sort_order INTEGER NOT NULL,
  name_snapshot TEXT NOT NULL,
  tracking_mode_snapshot TEXT NOT NULL,
  load_basis_snapshot TEXT NOT NULL,
  unit_snapshot TEXT,
  prescription_snapshot TEXT NOT NULL,
  record_kind TEXT NOT NULL DEFAULT 'performed' CHECK (record_kind IN ('performed','load_only')),
  suggestion_load REAL,
  suggestion_reason TEXT,
  suggestion_policy_version TEXT,
  suggestion_evidence_date TEXT,
  chosen_target_load REAL,
  target_total_reps INTEGER,
  actual_total_reps INTEGER,
  actual_added_load REAL,
  actual_duration_seconds INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','skipped')),
  concern TEXT,
  note TEXT,
  source TEXT,
  UNIQUE(session_id, sort_order)
);

CREATE TABLE IF NOT EXISTS sets (
  id TEXT PRIMARY KEY,
  session_exercise_id TEXT NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('warmup','work')),
  prescribed_set_ordinal INTEGER,
  target_load REAL,
  target_rep_min INTEGER,
  target_rep_max INTEGER,
  actual_load REAL,
  actual_reps INTEGER,
  rir INTEGER,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','skipped')),
  performed_at TEXT,
  UNIQUE(session_exercise_id, sort_order)
);

CREATE TABLE IF NOT EXISTS pullup_entries (
  id TEXT PRIMARY KEY,
  session_exercise_id TEXT NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
  reps INTEGER NOT NULL CHECK (reps > 0),
  created_at TEXT NOT NULL,
  undone_at TEXT
);

CREATE TABLE IF NOT EXISTS mutation_requests (
  request_id TEXT PRIMARY KEY,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exit_mutation_requests (
  request_id TEXT PRIMARY KEY REFERENCES mutation_requests(request_id),
  request_fingerprint TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_plan_label TEXT NOT NULL DEFAULT 'A / C rotation'
);
