import express from 'express'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  db,
  getPublicCatalog,
  getSettings,
  hashPassword,
  initDb,
  parseJson,
  saveSettings,
  verifyPassword,
} from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const publicDir = path.join(rootDir, 'public')
const uploadDir = path.join(publicDir, 'uploads')
if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true })

initDb()

const app = express()
app.set('trust proxy', 1)
app.disable('x-powered-by')

const ADMIN_ALLOWED_IPS = (process.env.ADMIN_ALLOWED_IPS || '')
  .split(',')
  .map((ip) => ip.trim())
  .filter(Boolean)

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  next()
})

if (ADMIN_ALLOWED_IPS.length) {
  app.use('/api/admin', (req, res, next) => {
    if (ADMIN_ALLOWED_IPS.includes(req.ip)) return next()
    return res.status(403).json({ error: '当前网络不允许访问管理接口' })
  })
}

const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.use(express.json({ limit: '6mb' }))
app.use(express.urlencoded({ extended: false }))

const PORT = Number(process.env.PORT || 3001)
const SESSION_DAYS = 7
const OWNER_ROLES = new Set(['owner', 'editor'])
const loginAttempts = new Map()
const loginUserAttempts = new Map()
const rateBuckets = new Map()

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown'
}

function allowRate(key, max, windowMs) {
  const now = Date.now()
  if (rateBuckets.size > 5000) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (bucket.reset <= now) rateBuckets.delete(bucketKey)
    }
  }
  const bucket = rateBuckets.get(key)
  if (!bucket || bucket.reset <= now) {
    rateBuckets.set(key, { count: 1, reset: now + windowMs })
    return true
  }
  if (bucket.count >= max) return false
  bucket.count += 1
  return true
}

const api = (handler) => (req, res, next) => {
  try {
    const result = handler(req, res, next)
    if (result && typeof result.catch === 'function') result.catch(next)
  } catch (error) {
    next(error)
  }
}

function nowIso() {
  return new Date().toISOString()
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function readCookie(req, name) {
  const header = req.headers.cookie || ''
  const parts = header.split(';').map((part) => part.trim())
  for (const part of parts) {
    const [key, ...value] = part.split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return null
}

function createSession(userId) {
  const token = randomBytes(32).toString('hex')
  const expiresAt = Date.now() + SESSION_DAYS * 86400000
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now())
  db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    hashToken(token),
    userId,
    expiresAt,
    nowIso(),
  )
  return token
}

function sessionUser(req) {
  const header = req.headers.authorization || ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null
  const token = readCookie(req, 'ys_session') || bearer
  if (!token) return null
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(hashToken(token))
  if (!session) return null
  if (session.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(hashToken(token))
    return null
  }
  const user = db
    .prepare('SELECT id, username, display_name, role, created_at FROM admin_users WHERE id = ?')
    .get(session.user_id)
  return user ? { ...user, token } : null
}

function requireAuth(req, res, next) {
  const user = sessionUser(req)
  if (!user) return res.status(401).json({ error: '登录已失效，请重新登录' })
  req.user = user
  next()
}

function requireOwner(req, res, next) {
  if (req.user.role !== 'owner') return res.status(403).json({ error: '只有站点所有者可以执行此操作' })
  next()
}

function audit(req, action, detail) {
  const actor = req.user?.username || 'system'
  db.prepare('INSERT INTO audit_logs (action, detail, actor, created_at) VALUES (?, ?, ?, ?)').run(
    action,
    detail ? JSON.stringify(detail) : null,
    actor,
    nowIso(),
  )
}

function sanitizeText(value, max = 600) {
  return String(value ?? '').trim().slice(0, max)
}

const AI_PROVIDER_BASE = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  moonshot: 'https://api.moonshot.cn/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  ollama: 'http://127.0.0.1:11434/v1',
}

function resolveChatEndpoint(settings) {
  const provider = settings.aiProvider || 'local'
  if (provider === 'local') return ''
  const base = String(settings.aiEndpoint || AI_PROVIDER_BASE[provider] || '')
    .trim()
    .replace(/\/$/, '')
  if (!base) return ''
  return /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`
}

function buildSystemPrompt(settings, context) {
  const parts = [
    settings.aiSystemPrompt ||
      '你是一名严谨的中小学教师，请依据义务教育教材讲解，不要编造教材中没有的结论。',
    '回答要求：使用简体中文（英语学科可中英双语）；先分析已知条件，再分步骤推导，最后总结易错点；涉及图形或实验时，用文字清楚描述器材、连线与现象。',
  ]
  const contextText = sanitizeText(context, 7000)
  if (contextText) {
    parts.push(`下面是学生正在学习的教材内容，请优先依据这些内容作答：\n${contextText}`)
  }
  return parts.join('\n\n')
}

function pickAiAnswer(payload) {
  return (
    payload?.choices?.[0]?.message?.content ||
    payload?.choices?.[0]?.text ||
    payload?.response ||
    payload?.output?.text ||
    payload?.result ||
    ''
  )
}

async function requestChat(settings, body) {
  const endpoint = resolveChatEndpoint(settings)
  if (!endpoint) {
    const error = new Error('尚未配置真实 AI 接口，请在后台「AI 接口」中填写接口地址与模型。')
    error.statusCode = 503
    throw error
  }
  if (!settings.aiApiKey && ['openai', 'deepseek', 'moonshot', 'qwen'].includes(settings.aiProvider)) {
    const error = new Error('AI 接口缺少 API Key，请在后台补全。')
    error.statusCode = 503
    throw error
  }
  const question = sanitizeText(body?.question, 2000)
  if (!question) {
    const error = new Error('请输入要讲解的题目或问题。')
    error.statusCode = 400
    throw error
  }
  const history = Array.isArray(body?.history) ? body.history.slice(-8) : []
  const messages = [{ role: 'system', content: buildSystemPrompt(settings, body?.context) }]
  for (const item of history) {
    if (!item || typeof item.content !== 'string') continue
    const role = item.role === 'assistant' ? 'assistant' : 'user'
    messages.push({ role, content: sanitizeText(item.content, 1600) })
  }
  messages.push({ role: 'user', content: question })

  let response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.aiApiKey ? { Authorization: `Bearer ${settings.aiApiKey}` } : {}),
      },
      body: JSON.stringify({
        model: settings.aiModel || 'gpt-4o-mini',
        messages,
        temperature: Math.min(1.2, Math.max(0, Number(settings.aiTemperature) || 0.4)),
        max_tokens: 1400,
        stream: false,
      }),
      signal: AbortSignal.timeout(60000),
    })
  } catch (error) {
    const failure = new Error(
      error?.name === 'TimeoutError' ? 'AI 接口响应超时，请稍后重试。' : `无法连接 AI 接口：${error.message}`,
    )
    failure.statusCode = 504
    throw failure
  }
  if (!response.ok) {
    const detail = sanitizeText(await response.text().catch(() => ''), 300)
    const failure = new Error(`AI 接口返回 ${response.status}${detail ? `：${detail}` : ''}`)
    failure.statusCode = 502
    throw failure
  }
  const payload = await response.json()
  const answer = sanitizeText(pickAiAnswer(payload), 12000)
  if (!answer) {
    const failure = new Error('AI 接口没有返回文本内容，请检查模型或接口格式。')
    failure.statusCode = 502
    throw failure
  }
  return {
    answer,
    provider: settings.aiProvider,
    model: settings.aiModel || payload?.model || 'unknown',
    usage: payload?.usage || null,
  }
}

function normalizeAzureAssessment(payload) {
  const best = payload?.NBest?.[0] || {}
  const assessment = best.PronunciationAssessment || {}
  const words = Array.isArray(best.Words)
    ? best.Words.map((word) => ({
        word: word.Word,
        accuracy: word.PronunciationAssessment?.AccuracyScore ?? null,
        errorType: word.PronunciationAssessment?.ErrorType || 'None',
      }))
    : []
  return {
    provider: 'azure',
    recognizedText: best.Display || payload?.DisplayText || '',
    accuracy: assessment.AccuracyScore ?? null,
    fluency: assessment.FluencyScore ?? null,
    completeness: assessment.CompletenessScore ?? null,
    pronunciation: assessment.PronScore ?? null,
    words,
  }
}


function serializeTopics(topics) {
  const list = Array.isArray(topics)
    ? topics
    : String(topics || '')
        .split(/[\n,，、;；]/)
        .map((item) => item.trim())
        .filter(Boolean)
  return JSON.stringify([...new Set(list)].slice(0, 12))
}

function getAdminOverview() {
  const totalVisits = db.prepare('SELECT COUNT(*) AS count FROM visits').get().count
  const today = nowIso().slice(0, 10)
  const todayVisits = db.prepare('SELECT COUNT(*) AS count FROM visits WHERE created_at LIKE ?').get(`${today}%`).count
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM admin_users').get().count
  const editionCount = db.prepare('SELECT COUNT(*) AS count FROM editions').get().count
  const subjectCount = db.prepare('SELECT COUNT(*) AS count FROM subjects').get().count
  const gradeCount = db.prepare('SELECT COUNT(*) AS count FROM grades').get().count
  const announcementCount = db.prepare('SELECT COUNT(*) AS count FROM announcements WHERE is_active = 1').get().count
  const aiCount = db.prepare('SELECT COUNT(*) AS count FROM ai_logs').get().count
  const deploymentCount = db.prepare('SELECT COUNT(*) AS count FROM deployments').get().count
  const feedbackCount = db.prepare('SELECT COUNT(*) AS count FROM feedback').get().count
  const newFeedbackCount = db.prepare("SELECT COUNT(*) AS count FROM feedback WHERE status = 'new'").get().count

  const rows = db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
       FROM visits WHERE created_at >= ? GROUP BY day ORDER BY day`,
    )
    .all(new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10))
  const byDay = new Map(rows.map((row) => [row.day, row.count]))
  const visitsByDay = []
  for (let index = 6; index >= 0; index -= 1) {
    const date = new Date(Date.now() - index * 86400000)
    const key = date.toISOString().slice(0, 10)
    visitsByDay.push({
      day: key,
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      count: byDay.get(key) || 0,
    })
  }

  const popularPaths = db
    .prepare('SELECT path, COUNT(*) AS count FROM visits GROUP BY path ORDER BY count DESC LIMIT 6')
    .all()
  const aiBySubject = db.prepare('SELECT subject, COUNT(*) AS count FROM ai_logs GROUP BY subject ORDER BY count DESC').all()
  const recentAudit = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 8').all().map((item) => ({
    ...item,
    detail: parseJson(item.detail, item.detail),
  }))
  const recentVisits = db.prepare('SELECT path, created_at FROM visits ORDER BY id DESC LIMIT 8').all()

  return {
    totals: {
      visits: totalVisits,
      todayVisits,
      users: userCount,
      editions: editionCount,
      subjects: subjectCount,
      grades: gradeCount,
      announcements: announcementCount,
      aiBuilds: aiCount,
      deployments: deploymentCount,
      feedback: feedbackCount,
      newFeedback: newFeedbackCount,
      models: 16,
    },
    visitsByDay,
    popularPaths,
    aiBySubject,
    recentAudit,
    recentVisits,
  }
}

/* ---------------- public API ---------------- */

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'ys-studio', time: nowIso() })
})

app.get('/api/catalog', (req, res) => {
  res.json(getPublicCatalog())
})

app.get('/api/site-config', (req, res) => {
  const config = getSettings()
  delete config.aiApiKey
  delete config.speechApiKey
  delete config.aiEndpoint
  res.json(config)
})

app.get('/api/grades', (req, res) => {
  const grades = db
    .prepare(
      `SELECT g.*, COUNT(gs.subject_id) AS subject_count, COALESCE(SUM(gs.model_count), 0) AS model_count
       FROM grades g LEFT JOIN grade_subjects gs ON gs.grade_id = g.id
       GROUP BY g.id ORDER BY g.order_index`,
    )
    .all()
  res.json(grades)
})

app.get('/api/grades/:gradeId', (req, res) => {
  const grade = db.prepare('SELECT * FROM grades WHERE id = ?').get(req.params.gradeId)
  if (!grade) return res.status(404).json({ error: '未找到该年级' })
  const subjects = db
    .prepare(
      `SELECT gs.*, s.name, s.en, s.icon, s.accent, s.accent2, s.sort
       FROM grade_subjects gs JOIN subjects s ON s.id = gs.subject_id
       WHERE gs.grade_id = ? ORDER BY s.sort, s.name`,
    )
    .all(req.params.gradeId)
    .map((item) => ({
      ...item,
      topics: parseJson(item.topics, []),
      has_lab: Boolean(item.has_lab),
      full_content: Boolean(item.full_content),
    }))
  res.json({ grade, subjects })
})

app.get('/api/subjects/:subjectId/editions', (req, res) => {
  const editions = db
    .prepare('SELECT * FROM editions WHERE subject_id = ? ORDER BY is_default DESC, sort, id')
    .all(req.params.subjectId)
    .map((edition) => ({ ...edition, isDefault: Boolean(edition.is_default) }))
  res.json(editions)
})

app.get('/api/announcements', (req, res) => {
  res.json(
    db.prepare('SELECT * FROM announcements WHERE is_active = 1 ORDER BY created_at DESC LIMIT 6').all(),
  )
})

app.get('/api/exam-questions', (req, res) => {
  const gradeId = sanitizeText(req.query.gradeId, 20)
  const subjectId = sanitizeText(req.query.subjectId, 20)
  let rows
  if (gradeId && subjectId) {
    rows = db
      .prepare('SELECT * FROM exam_questions WHERE grade_id = ? AND subject_id = ? ORDER BY id DESC LIMIT 400')
      .all(gradeId, subjectId)
  } else if (gradeId) {
    rows = db.prepare('SELECT * FROM exam_questions WHERE grade_id = ? ORDER BY id DESC LIMIT 400').all(gradeId)
  } else {
    rows = db.prepare('SELECT * FROM exam_questions ORDER BY id DESC LIMIT 400').all()
  }
  res.json(rows.map((row) => ({ ...row, isExam: true })))
})

app.get('/api/mnemonics', (req, res) => {
  const subjectId = sanitizeText(req.query.subjectId, 30)
  const rows = subjectId
    ? db.prepare('SELECT * FROM mnemonics WHERE enabled = 1 AND subject_id = ? ORDER BY sort, id').all(subjectId)
    : db.prepare('SELECT * FROM mnemonics WHERE enabled = 1 ORDER BY sort, id').all()
  res.json(
    rows.map((row) => ({
      ...row,
      lines: parseJson(row.lines, []),
      keywords: parseJson(row.keywords, []),
      enabled: Boolean(row.enabled),
    })),
  )
})

app.get('/api/pages', (req, res) => {
  res.json(
    db
      .prepare(
        'SELECT id, slug, title, excerpt, show_in_footer, sort FROM custom_pages WHERE is_published = 1 ORDER BY sort, id',
      )
      .all()
      .map((row) => ({ ...row, show_in_footer: Boolean(row.show_in_footer) })),
  )
})

app.get('/api/pages/:slug', (req, res) => {
  const slug = sanitizeText(req.params.slug, 60)
  const page = db
    .prepare('SELECT * FROM custom_pages WHERE slug = ? AND is_published = 1')
    .get(slug)
  if (!page) return res.status(404).json({ error: '页面不存在或尚未发布' })
  res.json({
    ...page,
    show_in_footer: Boolean(page.show_in_footer),
    is_published: Boolean(page.is_published),
  })
})

app.post('/api/track', (req, res) => {
  if (!allowRate(`track:${clientIp(req)}`, 300, 60000)) return res.status(204).end()
  const route = sanitizeText(req.body?.path, 180) || '/'
  const ua = sanitizeText(req.headers['user-agent'], 220)
  const ip = sanitizeText(req.headers['x-forwarded-for'] || req.socket.remoteAddress, 80)
  db.prepare('INSERT INTO visits (path, ua, ip, created_at) VALUES (?, ?, ?, ?)').run(route, ua, ip, nowIso())
  res.status(204).end()
})

app.post('/api/ai-stats', (req, res) => {
  if (!allowRate(`aistat:${clientIp(req)}`, 120, 60000)) return res.status(204).end()
  const subject = sanitizeText(req.body?.subject, 40) || 'unknown'
  const kind = sanitizeText(req.body?.kind, 40) || 'model'
  db.prepare('INSERT INTO ai_logs (subject, kind, created_at) VALUES (?, ?, ?)').run(subject, kind, nowIso())
  res.status(204).end()
})

app.post(
  '/api/ai/chat',
  api(async (req, res) => {
    const ip = clientIp(req)
    if (!allowRate(`ai:10m:${ip}`, 20, 10 * 60000) || !allowRate(`ai:day:${ip}`, 200, 86400000)) {
      return res.status(429).json({ error: 'AI 请求过于频繁，请稍后再试。' })
    }
    const settings = getSettings()
    try {
      const result = await requestChat(settings, req.body)
      db.prepare('INSERT INTO ai_logs (subject, kind, created_at) VALUES (?, ?, ?)').run(
        sanitizeText(req.body?.subject, 40) || 'remote',
        'remote-chat',
        nowIso(),
      )
      res.json(result)
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message })
    }
  }),
)

app.post(
  '/api/admin/ai/test',
  requireAuth,
  api(async (req, res) => {
    const current = getSettings()
    const overrides = {}
    for (const key of ['aiProvider', 'aiEndpoint', 'aiModel', 'aiApiKey', 'aiTemperature', 'aiSystemPrompt']) {
      if (typeof req.body?.[key] === 'string') overrides[key] = req.body[key]
    }
    try {
      const result = await requestChat(
        { ...current, ...overrides },
        { question: '请用一句话回复：AI 接口连接正常。', context: '' },
      )
      audit(req, '测试 AI 接口', { provider: result.provider, model: result.model })
      res.json({ ok: true, ...result })
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message })
    }
  }),
)

const feedbackAttempts = new Map()

app.post(
  '/api/feedback',
  api((req, res) => {
    const settings = getSettings()
    if (settings.feedbackEnabled === 'off') {
      return res.status(403).json({ error: '站点暂时关闭了反馈入口。' })
    }
    const content = sanitizeText(req.body?.content, 3000)
    if (!content) return res.status(400).json({ error: '反馈内容不能为空。' })
    const ip = req.ip || 'unknown'
    const record = feedbackAttempts.get(ip)
    const now = Date.now()
    if (record && now - record.first < 10 * 60000 && record.count >= 5) {
      return res.status(429).json({ error: '反馈提交过于频繁，请稍后再试。' })
    }
    feedbackAttempts.set(ip, record && now - record.first < 10 * 60000 ? { ...record, count: record.count + 1 } : { first: now, count: 1 })
    const result = db
      .prepare('INSERT INTO feedback (name, contact, type, content, page, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(
        sanitizeText(req.body?.name, 40),
        sanitizeText(req.body?.contact, 80),
        sanitizeText(req.body?.type || 'suggestion', 20),
        content,
        sanitizeText(req.body?.page, 200),
        'new',
        nowIso(),
      )
    audit(req, '收到用户反馈', { id: Number(result.lastInsertRowid), type: req.body?.type })
    res.status(201).json({ ok: true, id: Number(result.lastInsertRowid) })
  }),
)

app.post(
  '/api/speech/evaluate',
  api(async (req, res) => {
    const ip = clientIp(req)
    if (!allowRate(`speech:10m:${ip}`, 10, 10 * 60000) || !allowRate(`speech:day:${ip}`, 100, 86400000)) {
      return res.status(429).json({ error: '语音测评请求过于频繁，请稍后再试。' })
    }
    const settings = getSettings()
    const provider = settings.speechProvider || 'browser'
    if (provider === 'browser') {
      return res.status(400).json({ error: '当前使用浏览器语音引擎，请在本地完成识别与评分。' })
    }
    const text = sanitizeText(req.body?.text, 800)
    const audioBase64 = String(req.body?.audio || '')
    if (!text) return res.status(400).json({ error: '缺少朗读原文。' })
    if (!audioBase64) return res.status(400).json({ error: '缺少录音数据。' })
    const buffer = Buffer.from(audioBase64, 'base64')
    if (!buffer.length) return res.status(400).json({ error: '录音数据无效。' })
    if (buffer.length > 8 * 1024 * 1024) return res.status(413).json({ error: '录音不能超过 8MB。' })

    if (provider === 'azure') {
      const endpoint = String(settings.speechEndpoint || '').trim()
      if (!endpoint) return res.status(503).json({ error: '请在后台配置 Azure 语音测评 Endpoint。' })
      if (!settings.speechApiKey) return res.status(503).json({ error: '请在后台配置语音测评 API Key。' })
      const assessment = Buffer.from(
        JSON.stringify({
          ReferenceText: text,
          GradingSystem: 'HundredMark',
          Granularity: 'Phoneme',
          EnableMiscue: true,
          Dimension: 'Comprehensive',
        }),
      ).toString('base64')
      let response
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': settings.speechApiKey,
            'Content-Type': req.body?.mimeType || 'audio/wav; codecs=audio/pcm; samplerate=16000',
            'Pronunciation-Assessment': assessment,
            Accept: 'application/json',
          },
          body: buffer,
          signal: AbortSignal.timeout(45000),
        })
      } catch (error) {
        return res.status(504).json({ error: `语音测评服务连接失败：${error.message}` })
      }
      if (!response.ok) {
        return res.status(502).json({ error: `语音测评服务返回 ${response.status}` })
      }
      const payload = await response.json()
      return res.json(normalizeAzureAssessment(payload))
    }

    if (provider === 'custom') {
      const endpoint = String(settings.speechEndpoint || '').trim()
      if (!endpoint) return res.status(503).json({ error: '请在后台配置自定义语音测评接口地址。' })
      let response
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(settings.speechApiKey ? { Authorization: `Bearer ${settings.speechApiKey}` } : {}),
          },
          body: JSON.stringify({
            text,
            audio: audioBase64,
            mimeType: req.body?.mimeType || 'audio/wav',
            sampleRate: 16000,
          }),
          signal: AbortSignal.timeout(45000),
        })
      } catch (error) {
        return res.status(504).json({ error: `语音测评接口连接失败：${error.message}` })
      }
      if (!response.ok) return res.status(502).json({ error: `语音测评接口返回 ${response.status}` })
      const payload = await response.json()
      return res.json({ provider: 'custom', ...payload })
    }

    res.status(503).json({ error: '未知的语音测评服务，请在后台重新选择。' })
  }),
)


/* ---------------- admin auth ---------------- */

app.post(
  '/api/admin/login',
  api((req, res) => {
    const ip = req.ip || 'unknown'
    const attempt = loginAttempts.get(ip)
    if (attempt && attempt.blockedUntil > Date.now()) {
      return res.status(429).json({ error: '尝试次数过多，请稍后再试' })
    }
    const username = sanitizeText(req.body?.username, 60).toLowerCase()
    const password = String(req.body?.password || '')
    const userAttempt = loginUserAttempts.get(username)
    if (userAttempt && userAttempt.blockedUntil > Date.now()) {
      return res.status(429).json({ error: '该账号尝试次数过多，请稍后再试' })
    }
    const user = db.prepare('SELECT * FROM admin_users WHERE lower(username) = ?').get(username)
    if (!user || !verifyPassword(password, user.password_hash)) {
      const nextAttempt = attempt && attempt.blockedUntil <= Date.now() ? { count: 0 } : attempt || { count: 0 }
      nextAttempt.count += 1
      if (nextAttempt.count >= 6) {
        nextAttempt.blockedUntil = Date.now() + 10 * 60000
        nextAttempt.count = 0
      }
      loginAttempts.set(ip, nextAttempt)
      const nextUserAttempt = userAttempt && userAttempt.blockedUntil <= Date.now() ? { count: 0 } : userAttempt || { count: 0 }
      nextUserAttempt.count += 1
      if (nextUserAttempt.count >= 8) {
        nextUserAttempt.blockedUntil = Date.now() + 15 * 60000
        nextUserAttempt.count = 0
      }
      loginUserAttempts.set(username, nextUserAttempt)
      return res.status(401).json({ error: '用户名或密码不正确' })
    }
    loginAttempts.delete(ip)
    loginUserAttempts.delete(username)
    const token = createSession(user.id)
    res.cookie('ys_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
      maxAge: SESSION_DAYS * 86400000,
      path: '/',
    })
    db.prepare('INSERT INTO audit_logs (action, detail, actor, created_at) VALUES (?, ?, ?, ?)').run(
      '登录后台',
      null,
      user.username,
      nowIso(),
    )
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
      },
    })
  }),
)

app.post('/api/admin/logout', (req, res) => {
  const token = readCookie(req, 'ys_session')
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(hashToken(token))
  res.clearCookie('ys_session', { path: '/' })
  res.json({ ok: true })
})

app.get(
  '/api/admin/me',
  requireAuth,
  api((req, res) => {
    res.json({
      user: {
        id: req.user.id,
        username: req.user.username,
        displayName: req.user.display_name,
        role: req.user.role,
      },
    })
  }),
)

/* ---------------- admin data ---------------- */

app.get(
  '/api/admin/overview',
  requireAuth,
  api((req, res) => {
    res.json(getAdminOverview())
  }),
)

app.get(
  '/api/admin/settings',
  requireAuth,
  api((req, res) => {
    res.json(getSettings())
  }),
)

app.put(
  '/api/admin/settings',
  requireAuth,
  api((req, res) => {
    const body = req.body || {}
    if ('siteName' in body && !sanitizeText(body.siteName, 60)) {
      return res.status(400).json({ error: '站点名称不能为空' })
    }
    const next = saveSettings(body)
    audit(req, '更新站点设置', { keys: Object.keys(body) })
    res.json(next)
  }),
)

app.post(
  '/api/admin/upload',
  requireAuth,
  api((req, res) => {
    const dataUrl = String(req.body?.dataUrl || '')
    const matched = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([a-zA-Z0-9+/=]+)$/)
    if (!matched) return res.status(400).json({ error: '仅支持 PNG、JPEG、WebP 图片' })
    const buffer = Buffer.from(matched[2], 'base64')
    if (buffer.length > 3 * 1024 * 1024) return res.status(400).json({ error: '图片不能超过 3MB' })
    const extension = matched[1] === 'jpeg' ? 'jpg' : matched[1]
    const filename = `ys-logo-${Date.now()}-${randomBytes(3).toString('hex')}.${extension}`
    writeFileSync(path.join(uploadDir, filename), buffer)
    const relativeUrl = `/uploads/${filename}`
    const apiOrigin = (process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '')
    const url = `${apiOrigin}${relativeUrl}`
    audit(req, '上传品牌图片', { url })
    res.json({ url })
  }),
)

app.get(
  '/api/admin/editions',
  requireAuth,
  api((req, res) => {
    const editions = db
      .prepare(
        `SELECT e.*, s.name AS subject_name FROM editions e
         LEFT JOIN subjects s ON s.id = e.subject_id
         ORDER BY e.subject_id, e.is_default DESC, e.sort, e.id`,
      )
      .all()
      .map((item) => ({ ...item, isDefault: Boolean(item.is_default) }))
    res.json(editions)
  }),
)

app.post(
  '/api/admin/editions',
  requireAuth,
  api((req, res) => {
    const subjectId = sanitizeText(req.body?.subjectId, 40)
    const name = sanitizeText(req.body?.name, 60)
    const subject = db.prepare('SELECT id FROM subjects WHERE id = ?').get(subjectId)
    if (!subject) return res.status(400).json({ error: '学科不存在' })
    if (!name) return res.status(400).json({ error: '版本名称不能为空' })
    const isDefault = req.body?.isDefault ? 1 : 0
    if (isDefault) db.prepare('UPDATE editions SET is_default = 0 WHERE subject_id = ?').run(subjectId)
    try {
      const result = db
        .prepare(
          'INSERT INTO editions (subject_id, name, publisher, region, note, is_default, sort) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          subjectId,
          name,
          sanitizeText(req.body?.publisher, 100),
          sanitizeText(req.body?.region, 60),
          sanitizeText(req.body?.note, 300),
          isDefault,
          Number(req.body?.sort || 0),
        )
      audit(req, '新增教材版本', { subjectId, name })
      res.status(201).json({ id: Number(result.lastInsertRowid) })
    } catch {
      res.status(400).json({ error: '该学科下已存在同名版本' })
    }
  }),
)

app.put(
  '/api/admin/editions/:id',
  requireAuth,
  api((req, res) => {
    const edition = db.prepare('SELECT * FROM editions WHERE id = ?').get(req.params.id)
    if (!edition) return res.status(404).json({ error: '版本不存在' })
    const isDefault = req.body?.isDefault ? 1 : 0
    if (isDefault) {
      db.prepare('UPDATE editions SET is_default = 0 WHERE subject_id = ?').run(edition.subject_id)
    }
    db.prepare(
      'UPDATE editions SET name = ?, publisher = ?, region = ?, note = ?, is_default = ?, sort = ? WHERE id = ?',
    ).run(
      sanitizeText(req.body?.name ?? edition.name, 60),
      sanitizeText(req.body?.publisher ?? edition.publisher, 100),
      sanitizeText(req.body?.region ?? edition.region, 60),
      sanitizeText(req.body?.note ?? edition.note, 300),
      isDefault,
      Number(req.body?.sort ?? edition.sort),
      req.params.id,
    )
    audit(req, '更新教材版本', { id: edition.id })
    res.json({ ok: true })
  }),
)

app.delete(
  '/api/admin/editions/:id',
  requireAuth,
  api((req, res) => {
    const edition = db.prepare('SELECT * FROM editions WHERE id = ?').get(req.params.id)
    if (!edition) return res.status(404).json({ error: '版本不存在' })
    db.prepare('DELETE FROM editions WHERE id = ?').run(req.params.id)
    if (edition.is_default) {
      const fallback = db
        .prepare('SELECT id FROM editions WHERE subject_id = ? ORDER BY sort, id LIMIT 1')
        .get(edition.subject_id)
      if (fallback) db.prepare('UPDATE editions SET is_default = 1 WHERE id = ?').run(fallback.id)
    }
    audit(req, '删除教材版本', { id: edition.id, name: edition.name })
    res.json({ ok: true })
  }),
)

app.get(
  '/api/admin/grade-subjects',
  requireAuth,
  api((req, res) => {
    const grades = db.prepare('SELECT * FROM grades ORDER BY order_index').all()
    const rows = db
      .prepare(
        `SELECT gs.*, g.name AS grade_name, g.order_index, s.name AS subject_name, s.icon, s.accent, s.accent2
         FROM grade_subjects gs
         JOIN grades g ON g.id = gs.grade_id
         JOIN subjects s ON s.id = gs.subject_id
         ORDER BY g.order_index, s.sort`,
      )
      .all()
      .map((item) => ({
        ...item,
        topics: parseJson(item.topics, []),
        has_lab: Boolean(item.has_lab),
        full_content: Boolean(item.full_content),
      }))
    res.json({ grades, rows })
  }),
)

app.put(
  '/api/admin/grade-subjects/:gradeId/:subjectId',
  requireAuth,
  api((req, res) => {
    const record = db
      .prepare('SELECT * FROM grade_subjects WHERE grade_id = ? AND subject_id = ?')
      .get(req.params.gradeId, req.params.subjectId)
    if (!record) return res.status(404).json({ error: '该学段学科记录不存在' })
    db.prepare(
      'UPDATE grade_subjects SET topics = ?, has_lab = ?, full_content = ?, model_count = ? WHERE grade_id = ? AND subject_id = ?',
    ).run(
      serializeTopics(req.body?.topics ?? []),
      req.body?.hasLab ? 1 : 0,
      req.body?.fullContent ? 1 : 0,
      Math.max(0, Number(req.body?.modelCount || 0)),
      req.params.gradeId,
      req.params.subjectId,
    )
    audit(req, '更新学段学科', { gradeId: req.params.gradeId, subjectId: req.params.subjectId })
    res.json({ ok: true })
  }),
)

app.put(
  '/api/admin/grades/:gradeId',
  requireAuth,
  api((req, res) => {
    const grade = db.prepare('SELECT * FROM grades WHERE id = ?').get(req.params.gradeId)
    if (!grade) return res.status(404).json({ error: '年级不存在' })
    db.prepare('UPDATE grades SET name = ?, tagline = ? WHERE id = ?').run(
      sanitizeText(req.body?.name ?? grade.name, 30),
      sanitizeText(req.body?.tagline ?? grade.tagline, 160),
      req.params.gradeId,
    )
    audit(req, '更新年级信息', { gradeId: req.params.gradeId })
    res.json({ ok: true })
  }),
)

app.get(
  '/api/admin/deployments',
  requireAuth,
  api((req, res) => {
    res.json(
      db
        .prepare('SELECT * FROM deployments ORDER BY sort, id')
        .all()
        .map((item) => ({
          ...item,
          specs: parseJson(item.specs, []),
          steps: parseJson(item.steps, []),
          visible: Boolean(item.visible),
        })),
    )
  }),
)

function deploymentPayload(body) {
  return {
    name: sanitizeText(body?.name, 80),
    type: sanitizeText(body?.type, 40),
    price: sanitizeText(body?.price, 60),
    difficulty: sanitizeText(body?.difficulty, 20),
    badge: sanitizeText(body?.badge, 30),
    summary: sanitizeText(body?.summary, 400),
    specs: JSON.stringify(Array.isArray(body?.specs) ? body.specs.map((item) => sanitizeText(item, 120)).slice(0, 12) : []),
    steps: JSON.stringify(Array.isArray(body?.steps) ? body.steps.map((item) => sanitizeText(item, 160)).slice(0, 12) : []),
    visible: body?.visible === false || body?.visible === 0 ? 0 : 1,
    sort: Number(body?.sort || 0),
  }
}

app.post(
  '/api/admin/deployments',
  requireAuth,
  api((req, res) => {
    const payload = deploymentPayload(req.body)
    if (!payload.name) return res.status(400).json({ error: '方案名称不能为空' })
    const result = db
      .prepare(
        'INSERT INTO deployments (name, type, price, difficulty, badge, summary, specs, steps, visible, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        payload.name,
        payload.type,
        payload.price,
        payload.difficulty,
        payload.badge,
        payload.summary,
        payload.specs,
        payload.steps,
        payload.visible,
        payload.sort,
      )
    audit(req, '新增部署方案', { name: payload.name })
    res.status(201).json({ id: Number(result.lastInsertRowid) })
  }),
)

app.put(
  '/api/admin/deployments/:id',
  requireAuth,
  api((req, res) => {
    const plan = db.prepare('SELECT * FROM deployments WHERE id = ?').get(req.params.id)
    if (!plan) return res.status(404).json({ error: '部署方案不存在' })
    const payload = deploymentPayload({ ...plan, ...req.body })
    db.prepare(
      'UPDATE deployments SET name = ?, type = ?, price = ?, difficulty = ?, badge = ?, summary = ?, specs = ?, steps = ?, visible = ?, sort = ? WHERE id = ?',
    ).run(
      payload.name,
      payload.type,
      payload.price,
      payload.difficulty,
      payload.badge,
      payload.summary,
      payload.specs,
      payload.steps,
      payload.visible,
      payload.sort,
      req.params.id,
    )
    audit(req, '更新部署方案', { id: req.params.id })
    res.json({ ok: true })
  }),
)

app.delete(
  '/api/admin/deployments/:id',
  requireAuth,
  api((req, res) => {
    db.prepare('DELETE FROM deployments WHERE id = ?').run(req.params.id)
    audit(req, '删除部署方案', { id: req.params.id })
    res.json({ ok: true })
  }),
)

app.get(
  '/api/admin/announcements',
  requireAuth,
  api((req, res) => {
    res.json(db.prepare('SELECT * FROM announcements ORDER BY id DESC').all())
  }),
)

app.post(
  '/api/admin/announcements',
  requireAuth,
  api((req, res) => {
    const title = sanitizeText(req.body?.title, 120)
    if (!title) return res.status(400).json({ error: '公告标题不能为空' })
    const result = db
      .prepare('INSERT INTO announcements (title, body, level, is_active, popup, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(
        title,
        sanitizeText(req.body?.body, 1000),
        sanitizeText(req.body?.level || 'info', 20),
        req.body?.isActive === false || req.body?.isActive === 0 ? 0 : 1,
        req.body?.popup === false || req.body?.popup === 0 ? 0 : 1,
        nowIso(),
      )
    audit(req, '发布公告', { title })
    res.status(201).json({ id: Number(result.lastInsertRowid) })
  }),
)

app.put(
  '/api/admin/announcements/:id',
  requireAuth,
  api((req, res) => {
    const item = db.prepare('SELECT * FROM announcements WHERE id = ?').get(req.params.id)
    if (!item) return res.status(404).json({ error: '公告不存在' })
    db.prepare('UPDATE announcements SET title = ?, body = ?, level = ?, is_active = ?, popup = ? WHERE id = ?').run(
      sanitizeText(req.body?.title ?? item.title, 120),
      sanitizeText(req.body?.body ?? item.body, 1000),
      sanitizeText(req.body?.level ?? item.level, 20),
      req.body?.isActive === false || req.body?.isActive === 0 ? 0 : 1,
      req.body?.popup === false || req.body?.popup === 0 ? 0 : 1,
      req.params.id,
    )
    audit(req, '更新公告', { id: req.params.id })
    res.json({ ok: true })
  }),
)

app.delete(
  '/api/admin/announcements/:id',
  requireAuth,
  api((req, res) => {
    db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id)
    audit(req, '删除公告', { id: req.params.id })
    res.json({ ok: true })
  }),
)

app.get(
  '/api/admin/feedback',
  requireAuth,
  api((req, res) => {
    res.json(db.prepare('SELECT * FROM feedback ORDER BY id DESC LIMIT 300').all())
  }),
)

app.put(
  '/api/admin/feedback/:id',
  requireAuth,
  api((req, res) => {
    const item = db.prepare('SELECT * FROM feedback WHERE id = ?').get(req.params.id)
    if (!item) return res.status(404).json({ error: '反馈不存在' })
    const status = ['new', 'processing', 'done', 'ignored'].includes(req.body?.status)
      ? req.body.status
      : item.status
    db.prepare('UPDATE feedback SET status = ? WHERE id = ?').run(status, req.params.id)
    audit(req, '更新反馈状态', { id: item.id, status })
    res.json({ ok: true })
  }),
)

app.delete(
  '/api/admin/feedback/:id',
  requireAuth,
  api((req, res) => {
    db.prepare('DELETE FROM feedback WHERE id = ?').run(req.params.id)
    audit(req, '删除反馈', { id: req.params.id })
    res.json({ ok: true })
  }),
)

app.get(
  '/api/admin/exam-questions',
  requireAuth,
  api((req, res) => {
    res.json(db.prepare('SELECT * FROM exam_questions ORDER BY id DESC LIMIT 500').all())
  }),
)

app.post(
  '/api/admin/exam-questions',
  requireAuth,
  api((req, res) => {
    const question = sanitizeText(req.body?.question, 3000)
    if (!question) return res.status(400).json({ error: '题目内容不能为空' })
    const result = db
      .prepare(
        'INSERT INTO exam_questions (grade_id, subject_id, source, year, region, kind, question, answer, explanation, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        sanitizeText(req.body?.gradeId, 20),
        sanitizeText(req.body?.subjectId, 20),
        sanitizeText(req.body?.source, 160),
        sanitizeText(req.body?.year, 20),
        sanitizeText(req.body?.region, 60),
        sanitizeText(req.body?.kind || '考试真题', 30),
        question,
        sanitizeText(req.body?.answer, 3000),
        sanitizeText(req.body?.explanation, 3000),
        nowIso(),
      )
    audit(req, '新增真题题目', { id: Number(result.lastInsertRowid), source: req.body?.source })
    res.status(201).json({ id: Number(result.lastInsertRowid) })
  }),
)

app.put(
  '/api/admin/exam-questions/:id',
  requireAuth,
  api((req, res) => {
    const item = db.prepare('SELECT * FROM exam_questions WHERE id = ?').get(req.params.id)
    if (!item) return res.status(404).json({ error: '题目不存在' })
    const question = sanitizeText(req.body?.question ?? item.question, 3000)
    if (!question) return res.status(400).json({ error: '题目内容不能为空' })
    db.prepare(
      'UPDATE exam_questions SET grade_id = ?, subject_id = ?, source = ?, year = ?, region = ?, kind = ?, question = ?, answer = ?, explanation = ? WHERE id = ?',
    ).run(
      sanitizeText(req.body?.gradeId ?? item.grade_id, 20),
      sanitizeText(req.body?.subjectId ?? item.subject_id, 20),
      sanitizeText(req.body?.source ?? item.source, 160),
      sanitizeText(req.body?.year ?? item.year, 20),
      sanitizeText(req.body?.region ?? item.region, 60),
      sanitizeText(req.body?.kind ?? item.kind, 30),
      question,
      sanitizeText(req.body?.answer ?? item.answer, 3000),
      sanitizeText(req.body?.explanation ?? item.explanation, 3000),
      req.params.id,
    )
    audit(req, '更新真题题目', { id: item.id })
    res.json({ ok: true })
  }),
)

app.delete(
  '/api/admin/exam-questions/:id',
  requireAuth,
  api((req, res) => {
    db.prepare('DELETE FROM exam_questions WHERE id = ?').run(req.params.id)
    audit(req, '删除真题题目', { id: req.params.id })
    res.json({ ok: true })
  }),
)

function mnemonicLines(value) {
  const list = Array.isArray(value)
    ? value
    : String(value || '')
        .split(/\n/)
        .map((line) => line.trim())
        .filter(Boolean)
  return JSON.stringify(list.map((line) => sanitizeText(line, 300)).filter(Boolean).slice(0, 40))
}

function mnemonicKeywords(value) {
  const list = Array.isArray(value)
    ? value
    : String(value || '')
        .split(/[\n,，、;；]/)
        .map((item) => item.trim())
        .filter(Boolean)
  return JSON.stringify([...new Set(list.map((item) => sanitizeText(item, 30)).filter(Boolean))].slice(0, 30))
}

function serializeMnemonic(row) {
  return {
    ...row,
    lines: parseJson(row.lines, []),
    keywords: parseJson(row.keywords, []),
    enabled: Boolean(row.enabled),
  }
}

app.get(
  '/api/admin/mnemonics',
  requireAuth,
  api((req, res) => {
    res.json(
      db.prepare('SELECT * FROM mnemonics ORDER BY sort, id').all().map(serializeMnemonic),
    )
  }),
)

app.post(
  '/api/admin/mnemonics',
  requireAuth,
  api((req, res) => {
    const subjectId = sanitizeText(req.body?.subjectId ?? req.body?.subject_id, 30)
    const title = sanitizeText(req.body?.title, 80)
    if (!subjectId) return res.status(400).json({ error: '请选择学科' })
    if (!title) return res.status(400).json({ error: '口诀标题不能为空' })
    const lines = mnemonicLines(req.body?.lines)
    if (lines === '[]') return res.status(400).json({ error: '口诀内容不能为空' })
    const result = db
      .prepare(
        'INSERT INTO mnemonics (subject_id, title, category, lines, tip, keywords, enabled, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        subjectId,
        title,
        sanitizeText(req.body?.category, 120),
        lines,
        sanitizeText(req.body?.tip, 1200),
        mnemonicKeywords(req.body?.keywords),
        req.body?.enabled === false || req.body?.enabled === 0 ? 0 : 1,
        Number(req.body?.sort || 0),
        nowIso(),
      )
    audit(req, '新增口诀', { id: Number(result.lastInsertRowid), title })
    res.status(201).json({ id: Number(result.lastInsertRowid) })
  }),
)

app.put(
  '/api/admin/mnemonics/:id',
  requireAuth,
  api((req, res) => {
    const item = db.prepare('SELECT * FROM mnemonics WHERE id = ?').get(req.params.id)
    if (!item) return res.status(404).json({ error: '口诀不存在' })
    const title = sanitizeText(req.body?.title ?? item.title, 80)
    if (!title) return res.status(400).json({ error: '口诀标题不能为空' })
    db.prepare(
      'UPDATE mnemonics SET subject_id = ?, title = ?, category = ?, lines = ?, tip = ?, keywords = ?, enabled = ?, sort = ? WHERE id = ?',
    ).run(
      sanitizeText(req.body?.subjectId ?? item.subject_id, 30),
      title,
      sanitizeText(req.body?.category ?? item.category, 120),
      req.body?.lines === undefined ? item.lines : mnemonicLines(req.body.lines),
      sanitizeText(req.body?.tip ?? item.tip, 1200),
      req.body?.keywords === undefined ? item.keywords : mnemonicKeywords(req.body.keywords),
      req.body?.enabled === false || req.body?.enabled === 0 ? 0 : 1,
      Number(req.body?.sort ?? item.sort),
      req.params.id,
    )
    audit(req, '更新口诀', { id: item.id })
    res.json({ ok: true })
  }),
)

app.delete(
  '/api/admin/mnemonics/:id',
  requireAuth,
  api((req, res) => {
    db.prepare('DELETE FROM mnemonics WHERE id = ?').run(req.params.id)
    audit(req, '删除口诀', { id: req.params.id })
    res.json({ ok: true })
  }),
)

function customPagePayload(body, fallback = {}) {
  const slug = sanitizeText(body?.slug ?? fallback.slug, 60).toLowerCase()
  return {
    slug,
    title: sanitizeText(body?.title ?? fallback.title, 100),
    excerpt: sanitizeText(body?.excerpt ?? fallback.excerpt, 300),
    body: String(body?.body ?? fallback.body ?? '').slice(0, 20000),
    showInFooter: body?.showInFooter === false || body?.showInFooter === 0 ? 0 : 1,
    isPublished: body?.isPublished === false || body?.isPublished === 0 ? 0 : 1,
    sort: Number(body?.sort ?? fallback.sort ?? 0),
  }
}

app.get(
  '/api/admin/pages',
  requireAuth,
  api((req, res) => {
    res.json(
      db
        .prepare('SELECT * FROM custom_pages ORDER BY sort, id')
        .all()
        .map((row) => ({
          ...row,
          show_in_footer: Boolean(row.show_in_footer),
          is_published: Boolean(row.is_published),
        })),
    )
  }),
)

app.post(
  '/api/admin/pages',
  requireAuth,
  api((req, res) => {
    const payload = customPagePayload(req.body)
    if (!/^[a-z0-9-]{2,60}$/.test(payload.slug)) {
      return res.status(400).json({ error: '页面路径只能使用 2–60 位小写字母、数字和连字符' })
    }
    if (!payload.title) return res.status(400).json({ error: '页面标题不能为空' })
    try {
      const result = db
        .prepare(
          'INSERT INTO custom_pages (slug, title, excerpt, body, show_in_footer, is_published, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          payload.slug,
          payload.title,
          payload.excerpt,
          payload.body,
          payload.showInFooter,
          payload.isPublished,
          payload.sort,
          nowIso(),
        )
      audit(req, '新增自定义页面', { slug: payload.slug })
      res.status(201).json({ id: Number(result.lastInsertRowid) })
    } catch {
      res.status(400).json({ error: '该页面路径已存在' })
    }
  }),
)

app.put(
  '/api/admin/pages/:id',
  requireAuth,
  api((req, res) => {
    const item = db.prepare('SELECT * FROM custom_pages WHERE id = ?').get(req.params.id)
    if (!item) return res.status(404).json({ error: '页面不存在' })
    const payload = customPagePayload(req.body, item)
    if (!/^[a-z0-9-]{2,60}$/.test(payload.slug)) {
      return res.status(400).json({ error: '页面路径只能使用 2–60 位小写字母、数字和连字符' })
    }
    if (!payload.title) return res.status(400).json({ error: '页面标题不能为空' })
    try {
      db.prepare(
        'UPDATE custom_pages SET slug = ?, title = ?, excerpt = ?, body = ?, show_in_footer = ?, is_published = ?, sort = ? WHERE id = ?',
      ).run(
        payload.slug,
        payload.title,
        payload.excerpt,
        payload.body,
        payload.showInFooter,
        payload.isPublished,
        payload.sort,
        req.params.id,
      )
      audit(req, '更新自定义页面', { id: item.id, slug: payload.slug })
      res.json({ ok: true })
    } catch {
      res.status(400).json({ error: '该页面路径已存在' })
    }
  }),
)

app.delete(
  '/api/admin/pages/:id',
  requireAuth,
  api((req, res) => {
    db.prepare('DELETE FROM custom_pages WHERE id = ?').run(req.params.id)
    audit(req, '删除自定义页面', { id: req.params.id })
    res.json({ ok: true })
  }),
)

app.get(
  '/api/admin/users',
  requireAuth,
  requireOwner,
  api((req, res) => {
    res.json(
      db.prepare('SELECT id, username, display_name, role, created_at FROM admin_users ORDER BY id').all(),
    )
  }),
)

app.post(
  '/api/admin/users',
  requireAuth,
  requireOwner,
  api((req, res) => {
    const username = sanitizeText(req.body?.username, 32).toLowerCase()
    const password = String(req.body?.password || '')
    const displayName = sanitizeText(req.body?.displayName, 40) || username
    const role = OWNER_ROLES.has(req.body?.role) ? req.body.role : 'editor'
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      return res.status(400).json({ error: '用户名需为 3–32 位字母、数字或 . _ -' })
    }
    if (password.length < 8) return res.status(400).json({ error: '密码至少 8 位' })
    try {
      db.prepare('INSERT INTO admin_users (username, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?)').run(
        username,
        hashPassword(password),
        displayName,
        role,
        nowIso(),
      )
      audit(req, '新增管理员', { username, role })
      res.status(201).json({ ok: true })
    } catch {
      res.status(400).json({ error: '用户名已存在' })
    }
  }),
)

app.put(
  '/api/admin/users/:id',
  requireAuth,
  requireOwner,
  api((req, res) => {
    const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.params.id)
    if (!user) return res.status(404).json({ error: '管理员不存在' })
    const ownerCount = db.prepare("SELECT COUNT(*) AS count FROM admin_users WHERE role = 'owner'").get().count
    if (user.role === 'owner' && req.body?.role === 'editor' && ownerCount <= 1) {
      return res.status(400).json({ error: '至少保留一名所有者' })
    }
    const password = String(req.body?.password || '')
    if (password && password.length < 8) return res.status(400).json({ error: '密码至少 8 位' })
    db.prepare('UPDATE admin_users SET display_name = ?, role = ?, password_hash = ? WHERE id = ?').run(
      sanitizeText(req.body?.displayName ?? user.display_name, 40),
      OWNER_ROLES.has(req.body?.role) ? req.body.role : user.role,
      password ? hashPassword(password) : user.password_hash,
      req.params.id,
    )
    if (password) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.params.id)
    audit(req, '更新管理员', { id: req.params.id })
    res.json({ ok: true })
  }),
)

app.delete(
  '/api/admin/users/:id',
  requireAuth,
  requireOwner,
  api((req, res) => {
    const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.params.id)
    if (!user) return res.status(404).json({ error: '管理员不存在' })
    if (user.id === req.user.id) return res.status(400).json({ error: '不能删除当前登录账号' })
    if (user.role === 'owner') {
      const ownerCount = db.prepare("SELECT COUNT(*) AS count FROM admin_users WHERE role = 'owner'").get().count
      if (ownerCount <= 1) return res.status(400).json({ error: '至少保留一名所有者' })
    }
    db.prepare('DELETE FROM admin_users WHERE id = ?').run(req.params.id)
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.params.id)
    audit(req, '删除管理员', { id: req.params.id, username: user.username })
    res.json({ ok: true })
  }),
)

app.post(
  '/api/admin/change-password',
  requireAuth,
  api((req, res) => {
    const oldPassword = String(req.body?.oldPassword || '')
    const newPassword = String(req.body?.newPassword || '')
    if (newPassword.length < 8) return res.status(400).json({ error: '新密码至少 8 位' })
    const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.user.id)
    if (!verifyPassword(oldPassword, user.password_hash)) {
      return res.status(400).json({ error: '原密码不正确' })
    }
    db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), req.user.id)
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(req.user.id, hashToken(req.user.token))
    audit(req, '修改登录密码', null)
    res.json({ ok: true })
  }),
)

app.get(
  '/api/admin/audit',
  requireAuth,
  api((req, res) => {
    const rows = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100').all().map((item) => ({
      ...item,
      detail: parseJson(item.detail, item.detail),
    }))
    res.json(rows)
  }),
)

app.get(
  '/api/admin/export',
  requireAuth,
  requireOwner,
  api((req, res) => {
    const payload = {
      exportedAt: nowIso(),
      settings: getSettings(),
      grades: db.prepare('SELECT * FROM grades ORDER BY order_index').all(),
      subjects: db.prepare('SELECT * FROM subjects').all(),
      editions: db.prepare('SELECT * FROM editions').all(),
      gradeSubjects: db.prepare('SELECT * FROM grade_subjects').all(),
      deployments: db.prepare('SELECT * FROM deployments').all(),
      announcements: db.prepare('SELECT * FROM announcements').all(),
      feedback: db.prepare('SELECT * FROM feedback').all(),
      mnemonics: db.prepare('SELECT * FROM mnemonics').all(),
      customPages: db.prepare('SELECT * FROM custom_pages').all(),
    }
    audit(req, '导出站点数据', null)
    res.setHeader('Content-Disposition', `attachment; filename="ys-studio-backup-${Date.now()}.json"`)
    res.json(payload)
  }),
)

/* ---------------- public assets & API fallback ---------------- */

app.use('/uploads', express.static(uploadDir, { maxAge: '7d' }))

const downloadDir = path.join(rootDir, 'downloads')
const DOWNLOAD_FILES = new Set([
  'ys-studio-source.zip',
  'ys-studio-deploy.zip',
  'SHA256SUMS.txt',
])

app.get('/api/download/:file', (req, res) => {
  const file = path.basename(req.params.file)
  if (!DOWNLOAD_FILES.has(file)) return res.status(404).json({ error: '下载文件不存在' })
  const filePath = path.join(downloadDir, file)
  if (!existsSync(filePath)) return res.status(404).json({ error: '下载文件暂未生成' })
  res.setHeader('Cache-Control', 'private, no-store')
  res.download(filePath, file)
})

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API 路径不存在' })
})

/* 可选：同源托管前端（设置 SERVE_STATIC_DIR 指向 dist 目录） */
const staticDir = process.env.SERVE_STATIC_DIR ? path.resolve(process.env.SERVE_STATIC_DIR) : ''
if (staticDir && existsSync(staticDir)) {
  app.use(
    express.static(staticDir, {
      index: 'index.html',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache')
      },
    }),
  )
  app.get(/^\/(?!api(?:\/|$)|uploads(?:\/|$)).*/, (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    res.sendFile(path.join(staticDir, 'index.html'))
  })
}

app.use((req, res) => {
  res.status(404).json({
    error: '这是 YS Studio API 服务，前端页面请访问独立的前端地址。',
    frontendHint: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  })
})

app.use((error, req, res, next) => {
  console.error('[YS API ERROR]', error)
  if (res.headersSent) return next(error)
  res.status(500).json({ error: '服务器处理请求时出现错误' })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[YS] API server running at http://localhost:${PORT}`)
  console.log(`[YS] Allowed frontend origins: ${allowedOrigins.join(', ')}`)
})
