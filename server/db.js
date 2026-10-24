import { DatabaseSync } from 'node:sqlite'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ALL_SUBJECTS,
  ANNOUNCEMENT_SEED,
  DEFAULT_SITE_CONFIG,
  DEPLOYMENT_SEED,
  EDITION_SEED,
  GRADES,
} from '../src/data/grades.js'
import { MNEMONICS } from '../src/data/mnemonics.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const dataDir = path.join(rootDir, 'data')
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })

const dbPath = process.env.YS_DB_PATH || path.join(dataDir, 'ys-studio.db')
export const db = new DatabaseSync(dbPath)

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'editor',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS grades (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    stage TEXT NOT NULL,
    stage_label TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    tagline TEXT
  );

  CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    en TEXT,
    icon TEXT,
    accent TEXT,
    accent2 TEXT,
    sort INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS editions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id TEXT NOT NULL,
    name TEXT NOT NULL,
    publisher TEXT,
    region TEXT,
    note TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    sort INTEGER DEFAULT 0,
    UNIQUE(subject_id, name)
  );

  CREATE TABLE IF NOT EXISTS grade_subjects (
    grade_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    topics TEXT NOT NULL DEFAULT '[]',
    has_lab INTEGER NOT NULL DEFAULT 0,
    full_content INTEGER NOT NULL DEFAULT 0,
    model_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(grade_id, subject_id)
  );

  CREATE TABLE IF NOT EXISTS deployments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT,
    price TEXT,
    difficulty TEXT,
    badge TEXT,
    summary TEXT,
    specs TEXT NOT NULL DEFAULT '[]',
    steps TEXT NOT NULL DEFAULT '[]',
    visible INTEGER NOT NULL DEFAULT 1,
    sort INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT,
    level TEXT DEFAULT 'info',
    is_active INTEGER NOT NULL DEFAULT 1,
    popup INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    contact TEXT,
    type TEXT DEFAULT 'suggestion',
    content TEXT NOT NULL,
    page TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS exam_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grade_id TEXT,
    subject_id TEXT,
    source TEXT,
    year TEXT,
    region TEXT,
    kind TEXT DEFAULT '考试真题',
    question TEXT NOT NULL,
    answer TEXT,
    explanation TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mnemonics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seed_key TEXT,
    subject_id TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT,
    lines TEXT NOT NULL DEFAULT '[]',
    tip TEXT,
    keywords TEXT NOT NULL DEFAULT '[]',
    enabled INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS custom_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    excerpt TEXT,
    body TEXT,
    show_in_footer INTEGER NOT NULL DEFAULT 1,
    is_published INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT,
    ua TEXT,
    ip TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject TEXT,
    kind TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    detail TEXT,
    actor TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_visits_created ON visits(created_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_editions_subject ON editions(subject_id);
  CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);
  CREATE INDEX IF NOT EXISTS idx_exam_questions_grade ON exam_questions(grade_id, subject_id);
  CREATE INDEX IF NOT EXISTS idx_mnemonics_subject ON mnemonics(subject_id);
  CREATE INDEX IF NOT EXISTS idx_custom_pages_slug ON custom_pages(slug);
`)

const announcementColumns = db.prepare('PRAGMA table_info(announcements)').all()
if (!announcementColumns.some((column) => column.name === 'popup')) {
  db.exec('ALTER TABLE announcements ADD COLUMN popup INTEGER NOT NULL DEFAULT 1')
}

const mnemonicColumns = db.prepare('PRAGMA table_info(mnemonics)').all()
if (!mnemonicColumns.some((column) => column.name === 'seed_key')) {
  db.exec('ALTER TABLE mnemonics ADD COLUMN seed_key TEXT')
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${derived}`
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false
  const [salt, hash] = stored.split(':')
  const expected = Buffer.from(hash, 'hex')
  const actual = scryptSync(password, salt, 64)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const settings = { ...DEFAULT_SITE_CONFIG }
  for (const row of rows) {
    if (row.key.startsWith('_')) continue
    settings[row.key] = parseJson(row.value, row.value)
  }
  return settings
}

const SETTINGS_WHITELIST = new Set([
  ...Object.keys(DEFAULT_SITE_CONFIG),
  'maintenanceMessage',
  'customHeadCode',
])

export function saveSettings(patch) {
  const statement = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  )
  for (const [key, value] of Object.entries(patch)) {
    if (!SETTINGS_WHITELIST.has(key)) continue
    statement.run(key, JSON.stringify(value))
  }
  return getSettings()
}

function seedSettings() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM settings').get().count
  if (count > 0) return
  const statement = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
  for (const [key, value] of Object.entries(DEFAULT_SITE_CONFIG)) {
    statement.run(key, JSON.stringify(value))
  }
}

function seedSubjects() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM subjects').get().count
  if (count > 0) return
  const statement = db.prepare(
    'INSERT INTO subjects (id, name, en, icon, accent, accent2, sort) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
  ALL_SUBJECTS.forEach((subject, index) => {
    statement.run(subject.id, subject.name, subject.en, subject.icon, subject.accent, subject.accent2, index)
  })
}

function seedGrades() {
  const gradeStatement = db.prepare(
    'INSERT OR IGNORE INTO grades (id, name, stage, stage_label, order_index, tagline) VALUES (?, ?, ?, ?, ?, ?)',
  )
  const subjectStatement = db.prepare(
    'INSERT OR IGNORE INTO grade_subjects (grade_id, subject_id, topics, has_lab, full_content, model_count) VALUES (?, ?, ?, ?, ?, ?)',
  )
  for (const grade of GRADES) {
    gradeStatement.run(grade.id, grade.name, grade.stage, grade.stageLabel, grade.order, grade.tagline)
    for (const subject of grade.subjectEntries) {
      subjectStatement.run(
        grade.id,
        subject.id,
        JSON.stringify(subject.topics),
        subject.hasLab ? 1 : 0,
        subject.fullContent ? 1 : 0,
        subject.modelCount,
      )
    }
  }
}

function seedEditions() {
  const seeded = db.prepare("SELECT value FROM settings WHERE key = '_seed_editions_v2'").get()
  if (seeded) return
  const statement = db.prepare(
    'INSERT OR IGNORE INTO editions (subject_id, name, publisher, region, note, is_default, sort) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
  EDITION_SEED.forEach((edition, index) => {
    statement.run(
      edition.subjectId,
      edition.name,
      edition.publisher,
      edition.region,
      edition.note,
      edition.isDefault,
      index,
    )
  })
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('_seed_editions_v2', 'true')").run()
}

function seedDeployments() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM deployments').get().count
  if (count > 0) return
  const statement = db.prepare(
    'INSERT INTO deployments (name, type, price, difficulty, badge, summary, specs, steps, visible, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  DEPLOYMENT_SEED.forEach((plan) => {
    statement.run(
      plan.name,
      plan.type,
      plan.price,
      plan.difficulty,
      plan.badge,
      plan.summary,
      JSON.stringify(plan.specs),
      JSON.stringify(plan.steps),
      plan.visible,
      plan.sort,
    )
  })
}

function seedAnnouncements() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM announcements').get().count
  if (count > 0) return
  const statement = db.prepare(
    'INSERT INTO announcements (title, body, level, is_active, created_at) VALUES (?, ?, ?, ?, ?)',
  )
  ANNOUNCEMENT_SEED.forEach((item) => {
    statement.run(item.title, item.body, item.level, item.isActive, new Date().toISOString())
  })
}

function seedMnemonics() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM mnemonics').get().count
  if (count > 0) return
  const statement = db.prepare(
    'INSERT INTO mnemonics (seed_key, subject_id, title, category, lines, tip, keywords, enabled, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  MNEMONICS.forEach((item, index) => {
    statement.run(
      item.id,
      item.subjectId,
      item.title,
      item.category,
      JSON.stringify(item.lines || []),
      item.tip || '',
      JSON.stringify(item.keywords || []),
      1,
      index,
      new Date().toISOString(),
    )
  })
}

function migrateMnemonicSeedKeys() {
  const rows = db.prepare('SELECT id, title FROM mnemonics WHERE seed_key IS NULL').all()
  if (!rows.length) return
  const keyByTitle = new Map(MNEMONICS.map((item) => [item.title, item.id]))
  const statement = db.prepare('UPDATE mnemonics SET seed_key = ? WHERE id = ?')
  rows.forEach((row) => {
    const key = keyByTitle.get(row.title)
    if (key) statement.run(key, row.id)
  })
}

function seedAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM admin_users').get().count
  if (count > 0) return
  const username = process.env.YS_ADMIN_USER || 'admin'
  const password = process.env.YS_ADMIN_PASSWORD || 'YSstudio@2026'
  db.prepare(
    'INSERT INTO admin_users (username, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(username, hashPassword(password), 'YS 站点管理员', 'owner', new Date().toISOString())
  console.log(`[YS] 已创建默认管理员：${username}（请登录后台后立即修改密码）`)
}

function migrateSessionTokens() {
  const rows = db.prepare('SELECT token FROM sessions').all()
  if (!rows.length) return
  const update = db.prepare('UPDATE sessions SET token = ? WHERE token = ?')
  rows.forEach((row) => {
    if (/^[a-f0-9]{64}$/.test(row.token)) return
    update.run(createHash('sha256').update(row.token).digest('hex'), row.token)
  })
}

export function initDb() {
  seedSettings()
  seedSubjects()
  seedGrades()
  seedEditions()
  seedDeployments()
  seedAnnouncements()
  seedMnemonics()
  migrateMnemonicSeedKeys()
  migrateSessionTokens()
  seedAdmin()
  return db
}

export function getPublicCatalog() {
  const grades = db
    .prepare(
      `SELECT g.*, COUNT(gs.subject_id) AS subject_count, SUM(gs.model_count) AS model_count
       FROM grades g LEFT JOIN grade_subjects gs ON gs.grade_id = g.id
       GROUP BY g.id ORDER BY g.order_index`,
    )
    .all()
  const editions = db.prepare('SELECT * FROM editions ORDER BY subject_id, sort, id').all()
  const editionsBySubject = {}
  for (const edition of editions) {
    if (!editionsBySubject[edition.subject_id]) editionsBySubject[edition.subject_id] = []
    editionsBySubject[edition.subject_id].push({
      ...edition,
      isDefault: Boolean(edition.is_default),
    })
  }
  const announcements = db
    .prepare('SELECT * FROM announcements WHERE is_active = 1 ORDER BY created_at DESC LIMIT 6')
    .all()
  const publicConfig = getSettings()
  delete publicConfig.aiApiKey
  delete publicConfig.speechApiKey
  delete publicConfig.aiEndpoint
  const mnemonics = db
    .prepare('SELECT * FROM mnemonics WHERE enabled = 1 ORDER BY sort, id')
    .all()
    .map((item) => ({
      ...item,
      lines: parseJson(item.lines, []),
      keywords: parseJson(item.keywords, []),
      enabled: Boolean(item.enabled),
    }))
  const customPages = db
    .prepare(
      'SELECT id, slug, title, excerpt, show_in_footer, sort FROM custom_pages WHERE is_published = 1 ORDER BY sort, id',
    )
    .all()
    .map((item) => ({ ...item, show_in_footer: Boolean(item.show_in_footer) }))
  return {
    config: publicConfig,
    grades: grades.map((grade) => ({ ...grade, subject_count: Number(grade.subject_count || 0) })),
    editionsBySubject,
    announcements,
    mnemonics,
    customPages,
    stats: {
      subjects: db.prepare('SELECT COUNT(*) AS count FROM subjects').get().count,
      editions: editions.length,
      grades: grades.length,
      models: 16,
    },
  }
}

export { parseJson }
