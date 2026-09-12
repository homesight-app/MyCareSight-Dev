// gen-neon-schema.js
// Reads the Supabase columns export and generates a Neon-compatible PostgreSQL schema file.

const fs = require('fs');
const path = require('path');

// ─── Paths ───────────────────────────────────────────────────────────────────
const DATA_FILE = path.join(
  'C:\\Users\\stone\\.claude\\projects',
  'c--Users-stone-OneDrive-Desktop-My-Projects-App-Dev-MyCareSight-Dev',
  '6495f63a-920c-4064-8ea0-9fbda2c7128a',
  'tool-results',
  'mcp-supabase-dev-execute_sql-1789172327919.txt'
);

const OUT_FILE = path.join(__dirname, 'neon-schema.sql');

// ─── Parse source data ────────────────────────────────────────────────────────
const raw = fs.readFileSync(DATA_FILE, 'utf8');
const outer = JSON.parse(raw);
const content = outer.result;
const arrStart = content.indexOf('[{');
const arrEnd = content.lastIndexOf('}]');
if (arrStart < 0 || arrEnd < 0) {
  throw new Error('Could not find JSON array in source file');
}
const columns = JSON.parse(content.slice(arrStart, arrEnd + 2));
console.log(`Parsed ${columns.length} column rows`);

// Excluded tables
const EXCLUDED_TABLES = new Set(['kv_store_3706f9c5']);

// ─── Type mapping ─────────────────────────────────────────────────────────────
function mapType(col) {
  const dt = col.data_type;
  const udt = col.udt_name || '';
  const maxLen = col.character_maximum_length;

  switch (dt) {
    case 'uuid': return 'UUID';
    case 'text': return 'TEXT';
    case 'character varying': return maxLen ? `VARCHAR(${maxLen})` : 'TEXT';
    case 'character': return maxLen ? `CHAR(${maxLen})` : 'CHAR';
    case 'integer': return 'INTEGER';
    case 'bigint': return 'BIGINT';
    case 'smallint': return 'SMALLINT';
    case 'boolean': return 'BOOLEAN';
    case 'jsonb': return 'JSONB';
    case 'json': return 'JSON';
    case 'numeric': return 'NUMERIC';
    case 'real': return 'REAL';
    case 'double precision': return 'DOUBLE PRECISION';
    case 'date': return 'DATE';
    case 'time without time zone': return 'TIME';
    case 'time with time zone': return 'TIMETZ';
    case 'timestamp with time zone': return 'TIMESTAMPTZ';
    case 'timestamp without time zone': return 'TIMESTAMP';
    case 'interval': return 'INTERVAL';
    case 'bytea': return 'BYTEA';
    case 'ARRAY': {
      // udt_name starts with _ for arrays
      const base = udt.startsWith('_') ? udt.slice(1) : udt;
      const pgBase = arrayBaseType(base);
      return `${pgBase}[]`;
    }
    case 'USER-DEFINED': {
      // Treat enums as TEXT since we don't have enum definitions
      return 'TEXT';
    }
    default:
      // Fallback
      if (dt.includes('character')) return 'TEXT';
      return 'TEXT';
  }
}

function arrayBaseType(udtBase) {
  switch (udtBase) {
    case 'text': return 'TEXT';
    case 'varchar': return 'TEXT';
    case 'int4': case 'int': return 'INTEGER';
    case 'int8': return 'BIGINT';
    case 'int2': return 'SMALLINT';
    case 'bool': return 'BOOLEAN';
    case 'uuid': return 'UUID';
    case 'jsonb': return 'JSONB';
    case 'json': return 'JSON';
    case 'numeric': return 'NUMERIC';
    case 'float4': return 'REAL';
    case 'float8': return 'DOUBLE PRECISION';
    case 'date': return 'DATE';
    case 'timestamptz': return 'TIMESTAMPTZ';
    case 'timestamp': return 'TIMESTAMP';
    default: return 'TEXT';
  }
}

// ─── Default value mapping ────────────────────────────────────────────────────
function mapDefault(def) {
  if (!def) return null;
  // Strip any auth. references entirely
  if (def.includes('auth.')) return null;
  // Sequence-based defaults → drop (use gen_random_uuid for UUID PKs or IDENTITY for ints)
  if (def.includes('nextval(')) return null;
  // Various UUID generators
  if (
    def.includes('uuid_generate_v4') ||
    def.includes('gen_random_uuid') ||
    def.includes('extensions.uuid')
  ) {
    return 'DEFAULT gen_random_uuid()';
  }
  // Booleans
  if (def === 'true') return 'DEFAULT TRUE';
  if (def === 'false') return 'DEFAULT FALSE';
  // now() / CURRENT_TIMESTAMP
  if (def === 'now()' || def === 'CURRENT_TIMESTAMP') return 'DEFAULT now()';
  // Keep other defaults as-is
  return `DEFAULT ${def}`;
}

// ─── Group columns by table ───────────────────────────────────────────────────
const tableMap = new Map(); // table_name -> columns[]
for (const col of columns) {
  if (EXCLUDED_TABLES.has(col.table_name)) continue;
  if (!tableMap.has(col.table_name)) tableMap.set(col.table_name, []);
  tableMap.get(col.table_name).push(col);
}

const allTables = [...tableMap.keys()];
console.log(`Tables found: ${allTables.length}`);
console.log('Tables:', allTables.join(', '));

// ─── Table creation order (topological) ──────────────────────────────────────
// We define a preferred order; any tables not listed will be appended at end.
const ORDER = [
  // Tier 1: No deps (or deps only on extensions)
  'agencies',
  'license_types',
  'certification_types',
  'staff_roles',
  'task_categories',
  'configuration_types',
  'pricing',
  'validation_rules',
  'skilled_tasks',
  // Tier 2: user_profiles (standalone PK)
  'user_profiles',
  // Tier 3: Deps on agencies + user_profiles
  'agency_admins',
  'care_coordinators',
  'caregiver_members',
  'licensing_experts',
  // Tier 4: Playbooks etc. (deps on license_types)
  'playbooks',
  'playbook_templates',
  'playbook_items',
  'playbook_item_validation_rules',
  'license_requirements',
  'license_requirement_templates',
  // Tier 5: Applications, licenses, leads
  'applications',
  'licenses',
  'leads',
  'patient_information',
  // Tier 6: Remaining
  'application_documents',
  'application_playbook_item_rule_checks',
  'application_steps',
  'agency_documents',
  'agency_key_staff',
  'agency_onboarding_tokens',
  'cases',
  'certification_applications',
  'certifications',
  'configuration_values',
  'conversations',
  'messages',
  'notifications',
  'lead_documents',
  'license_documents',
  'plan_features',
  'patient_addresses',
  'patient_care_logs',
  'patient_documents',
  'patient_lead_details',
  'patient_skill_requirements',
  'schedule_assignment_requests',
  'schedule_unassignment_requests',
  'system_settings',
  'validation_runs',
];

function sortedTables() {
  const ordered = [];
  const seen = new Set();
  for (const t of ORDER) {
    if (tableMap.has(t)) {
      ordered.push(t);
      seen.add(t);
    }
  }
  // Append any remaining tables not in the order list
  for (const t of allTables) {
    if (!seen.has(t)) ordered.push(t);
  }
  return ordered;
}

// ─── FK definitions ───────────────────────────────────────────────────────────
// Only add a FK if both table and referenced table exist and the column exists.
const colExists = (table, col) => {
  const cols = tableMap.get(table);
  return cols && cols.some(c => c.column_name === col);
};
const tableExists = (t) => tableMap.has(t);

// auth.users rewrites — these are the FK column names that were → auth.users
const AUTH_USERS_FK_COLUMNS = {
  user_profiles: null, // standalone PK, no FK
  caregiver_members: ['user_id'],
  licensing_experts: ['user_id'],
  applications: ['assigned_expert_id', 'company_owner_id'],
  licenses: ['company_owner_id'],
  leads: ['created_by', 'assigned_to'],
  notifications: ['user_id'],
  messages: ['sender_id'],
  conversations: ['admin_id'],
  agency_documents: ['uploaded_by'],
  agency_onboarding_tokens: ['created_by'],
  application_steps: ['completed_by', 'created_by_expert_id'],
  lead_documents: ['uploaded_by'],
  system_settings: ['updated_by'],
  schedule_assignment_requests: ['resolved_by'],
  schedule_unassignment_requests: ['resolved_by'],
  validation_runs: ['completed_by'],
};

function buildFKs() {
  const fks = [];
  let fkIdx = 0;
  const addFK = (table, col, refTable, refCol = 'id', opts = '') => {
    if (!tableExists(table) || !tableExists(refTable)) return;
    if (!colExists(table, col)) return;
    if (!colExists(refTable, refCol)) return;
    fkIdx++;
    const name = `fk_${table}_${col}`.slice(0, 63);
    fks.push(
      `ALTER TABLE ${table} ADD CONSTRAINT ${name} FOREIGN KEY (${col}) REFERENCES ${refTable}(${refCol})${opts};`
    );
  };

  // auth.users rewrites → user_profiles
  for (const [table, cols] of Object.entries(AUTH_USERS_FK_COLUMNS)) {
    if (!cols) continue; // user_profiles itself
    for (const col of cols) {
      addFK(table, col, 'user_profiles');
    }
  }

  // Non-auth.users FKs
  addFK('agency_admins', 'agency_id', 'agencies');
  addFK('agency_documents', 'agency_id', 'agencies');
  addFK('agency_key_staff', 'agency_id', 'agencies');
  addFK('agency_onboarding_tokens', 'agency_id', 'agencies');
  addFK('applications', 'agency_id', 'agencies');
  addFK('applications', 'license_type_id', 'license_types');
  addFK('application_documents', 'application_id', 'applications');
  addFK('application_playbook_item_rule_checks', 'application_id', 'applications');
  addFK('application_playbook_item_rule_checks', 'playbook_item_id', 'playbook_items');
  addFK('application_playbook_item_rule_checks', 'validation_rule_id', 'validation_rules');
  addFK('application_steps', 'application_id', 'applications');
  addFK('application_steps', 'playbook_item_id', 'playbook_items');
  addFK('care_coordinators', 'agency_id', 'agencies');
  addFK('cases', 'agency_id', 'agencies');
  addFK('caregiver_members', 'agency_id', 'agencies');
  addFK('certification_applications', 'certification_type_id', 'certification_types');
  addFK('certification_applications', 'caregiver_id', 'caregiver_members');
  addFK('certifications', 'caregiver_id', 'caregiver_members');
  addFK('certifications', 'certification_type_id', 'certification_types');
  addFK('configuration_values', 'type_id', 'configuration_types');
  addFK('configuration_values', 'parent_id', 'configuration_values');
  addFK('conversations', 'agency_id', 'agencies');
  addFK('lead_documents', 'lead_id', 'leads');
  addFK('leads', 'agency_id', 'agencies');
  addFK('license_documents', 'license_id', 'licenses');
  addFK('license_requirement_templates', 'license_type_id', 'license_types');
  addFK('license_requirements', 'license_type_id', 'license_types');
  addFK('license_requirements', 'playbook_id', 'playbooks');
  addFK('licenses', 'agency_id', 'agencies');
  addFK('licenses', 'license_type_id', 'license_types');
  addFK('licensing_experts', 'agency_id', 'agencies');
  addFK('messages', 'conversation_id', 'conversations');
  addFK('patient_addresses', 'patient_id', 'patient_information');
  addFK('patient_care_logs', 'patient_id', 'patient_information');
  addFK('patient_documents', 'patient_id', 'patient_information');
  addFK('patient_information', 'agency_id', 'agencies');
  addFK('patient_lead_details', 'lead_id', 'leads');
  addFK('patient_lead_details', 'patient_id', 'patient_information');
  addFK('patient_skill_requirements', 'patient_id', 'patient_information');
  addFK('patient_skill_requirements', 'skilled_task_id', 'skilled_tasks');
  addFK('plan_features', 'pricing_id', 'pricing');
  addFK('playbook_item_validation_rules', 'playbook_item_id', 'playbook_items');
  addFK('playbook_item_validation_rules', 'validation_rule_id', 'validation_rules');
  addFK('playbook_items', 'playbook_id', 'playbooks');
  addFK('playbooks', 'license_type_id', 'license_types');
  addFK('playbook_templates', 'license_type_id', 'license_types');
  addFK('schedule_assignment_requests', 'agency_id', 'agencies');
  addFK('schedule_assignment_requests', 'caregiver_id', 'caregiver_members');
  addFK('schedule_assignment_requests', 'patient_id', 'patient_information');
  addFK('schedule_unassignment_requests', 'agency_id', 'agencies');
  addFK('schedule_unassignment_requests', 'caregiver_id', 'caregiver_members');
  addFK('schedule_unassignment_requests', 'patient_id', 'patient_information');
  addFK('skilled_tasks', 'task_category_id', 'task_categories');
  addFK('validation_rules', 'playbook_item_id', 'playbook_items');
  addFK('validation_runs', 'application_id', 'applications');
  addFK('validation_runs', 'validation_rule_id', 'validation_rules');

  return fks;
}

// ─── Index definitions ────────────────────────────────────────────────────────
// Common indexes based on FK columns and frequent query patterns
function buildIndexes() {
  const idxs = [];
  const addIdx = (table, cols, unique = false) => {
    if (!tableExists(table)) return;
    const colArr = Array.isArray(cols) ? cols : [cols];
    for (const c of colArr) {
      if (!colExists(table, c)) return;
    }
    const colStr = colArr.join('_');
    const name = `idx_${table}_${colStr}`.slice(0, 63);
    const u = unique ? 'UNIQUE ' : '';
    idxs.push(`CREATE ${u}INDEX IF NOT EXISTS ${name} ON ${table} (${colArr.join(', ')});`);
  };

  // FK index coverage
  addIdx('agency_admins', 'agency_id');
  addIdx('agency_admins', 'user_id');
  addIdx('agency_documents', 'agency_id');
  addIdx('agency_documents', 'uploaded_by');
  addIdx('agency_key_staff', 'agency_id');
  addIdx('agency_onboarding_tokens', 'agency_id');
  addIdx('agency_onboarding_tokens', 'created_by');
  addIdx('applications', 'agency_id');
  addIdx('applications', 'license_type_id');
  addIdx('applications', 'assigned_expert_id');
  addIdx('applications', 'company_owner_id');
  addIdx('applications', 'status');
  addIdx('application_documents', 'application_id');
  addIdx('application_playbook_item_rule_checks', 'application_id');
  addIdx('application_playbook_item_rule_checks', 'playbook_item_id');
  addIdx('application_steps', 'application_id');
  addIdx('application_steps', 'playbook_item_id');
  addIdx('care_coordinators', 'agency_id');
  addIdx('caregiver_members', 'agency_id');
  addIdx('caregiver_members', 'user_id');
  addIdx('cases', 'agency_id');
  addIdx('certification_applications', 'caregiver_id');
  addIdx('certification_applications', 'certification_type_id');
  addIdx('certifications', 'caregiver_id');
  addIdx('configuration_values', 'type_id');
  addIdx('configuration_values', 'parent_id');
  addIdx('conversations', 'agency_id');
  addIdx('lead_documents', 'lead_id');
  addIdx('lead_documents', 'uploaded_by');
  addIdx('leads', 'agency_id');
  addIdx('leads', 'created_by');
  addIdx('leads', 'assigned_to');
  addIdx('leads', 'status');
  addIdx('license_documents', 'license_id');
  addIdx('license_requirements', 'license_type_id');
  addIdx('licenses', 'agency_id');
  addIdx('licenses', 'license_type_id');
  addIdx('licenses', 'company_owner_id');
  addIdx('licensing_experts', 'user_id');
  addIdx('licensing_experts', 'agency_id');
  addIdx('messages', 'conversation_id');
  addIdx('messages', 'sender_id');
  addIdx('notifications', 'user_id');
  addIdx('patient_addresses', 'patient_id');
  addIdx('patient_care_logs', 'patient_id');
  addIdx('patient_documents', 'patient_id');
  addIdx('patient_information', 'agency_id');
  addIdx('patient_lead_details', 'lead_id');
  addIdx('patient_lead_details', 'patient_id');
  addIdx('patient_skill_requirements', 'patient_id');
  addIdx('patient_skill_requirements', 'skilled_task_id');
  addIdx('plan_features', 'pricing_id');
  addIdx('playbook_items', 'playbook_id');
  addIdx('playbooks', 'license_type_id');
  addIdx('schedule_assignment_requests', 'agency_id');
  addIdx('schedule_assignment_requests', 'caregiver_id');
  addIdx('schedule_assignment_requests', 'patient_id');
  addIdx('schedule_unassignment_requests', 'agency_id');
  addIdx('schedule_unassignment_requests', 'caregiver_id');
  addIdx('schedule_unassignment_requests', 'patient_id');
  addIdx('skilled_tasks', 'task_category_id');
  addIdx('user_profiles', 'email');
  addIdx('validation_runs', 'application_id');
  addIdx('validation_runs', 'validation_rule_id');

  return idxs;
}

// ─── Generate CREATE TABLE ────────────────────────────────────────────────────
function generateTable(tableName, cols) {
  const lines = [];
  lines.push(`CREATE TABLE IF NOT EXISTS ${tableName} (`);

  const colDefs = [];
  let hasPK = false;

  for (const col of cols) {
    const pgType = mapType(col);
    const nullable = col.is_nullable === 'YES';
    const defVal = mapDefault(col.column_default);
    const isPK = col.column_name === 'id';

    let def = `  ${col.column_name} ${pgType}`;
    if (defVal) def += ` ${defVal}`;
    if (!nullable) def += ' NOT NULL';

    colDefs.push(def);
    if (isPK) hasPK = true;
  }

  // Add PK constraint if id column exists
  if (hasPK) {
    lines.push(colDefs.join(',\n') + ',');
    lines.push(`  CONSTRAINT pk_${tableName} PRIMARY KEY (id)`);
  } else {
    lines.push(colDefs.join(',\n'));
  }

  lines.push(');');
  return lines.join('\n');
}

// ─── Assemble the SQL file ────────────────────────────────────────────────────
const now = new Date().toISOString().split('T')[0];
const ordered = sortedTables();
const fks = buildFKs();
const indexes = buildIndexes();

const parts = [];

parts.push(`-- ============================================================
-- MyCareSight — Neon PostgreSQL Schema
-- Generated: ${now}
-- Source: Supabase live DB (UAT project)
-- Changes from Supabase:
--   - All auth.users FK references rewritten to user_profiles(id)
--   - user_profiles.id is a standalone UUID PK (no FK to auth.users)
--   - No RLS policies
--   - No Supabase triggers or extensions
--   - kv_store_3706f9c5 excluded (Supabase internal)
-- Table count: ${ordered.length}
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

`);

parts.push(`-- ============================================================
-- TABLES
-- ============================================================
`);

for (const t of ordered) {
  const cols = tableMap.get(t);
  parts.push(`-- Table: ${t}`);
  parts.push(generateTable(t, cols));
  parts.push('');
}

parts.push(`-- ============================================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================================
`);
for (const fk of fks) {
  parts.push(fk);
}
parts.push('');

parts.push(`-- ============================================================
-- INDEXES
-- ============================================================
`);
for (const idx of indexes) {
  parts.push(idx);
}
parts.push('');

const sql = parts.join('\n');
fs.writeFileSync(OUT_FILE, sql, 'utf8');
console.log(`\nWrote ${OUT_FILE}`);
console.log(`Total lines: ${sql.split('\n').length}`);
console.log(`FK count: ${fks.length}`);
console.log(`Index count: ${indexes.length}`);

// ─── Verification ─────────────────────────────────────────────────────────────
console.log('\n=== VERIFICATION ===');
const checks = [
  { pattern: 'auth.users', label: 'auth.users references' },
  { pattern: 'ENABLE ROW LEVEL SECURITY', label: 'RLS enable statements' },
  { pattern: 'CREATE POLICY', label: 'CREATE POLICY statements' },
  { pattern: 'kv_store', label: 'kv_store references' },
  { pattern: 'handle_new_user', label: 'handle_new_user references' },
  { pattern: 'auth.uid()', label: 'auth.uid() references' },
  { pattern: 'auth.role()', label: 'auth.role() references' },
];
for (const { pattern, label } of checks) {
  const count = (sql.match(new RegExp(pattern.replace(/[()]/g, '\\$&'), 'g')) || []).length;
  console.log(`  ${label}: ${count === 0 ? 'PASS (0)' : 'FAIL (' + count + ')'}`);
}

console.log('\nFirst 50 lines of output:');
console.log(sql.split('\n').slice(0, 50).join('\n'));
