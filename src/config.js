import { existsSync, readFileSync } from 'node:fs'

export const DEV_JWT_SECRET = 'dev-only-change-me-please-32chars'

export function loadDotEnv(file = '.env') {
  if (!existsSync(file)) return
  const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

function readBool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  throw new Error(`참/거짓으로 읽을 수 없는 값입니다: ${value}`)
}

export function resolveConfig(overrides = {}) {
  if (!overrides.skipEnvFile) loadDotEnv(overrides.envFile ?? '.env')
  const nodeEnv = overrides.nodeEnv ?? process.env.NODE_ENV ?? 'development'
  const stage = overrides.stage ?? process.env.APP_STAGE ?? 'final'
  if (stage !== 'basic' && stage !== 'final') {
    throw new Error('APP_STAGE는 basic 또는 final 이어야 합니다.')
  }
  const jwtSecret = overrides.jwtSecret ?? process.env.JWT_SECRET ?? (nodeEnv === 'production' ? '' : DEV_JWT_SECRET)
  if (!jwtSecret || jwtSecret.length < 16) {
    throw new Error('JWT_SECRET가 없거나 16자보다 짧습니다.')
  }
  if (nodeEnv === 'production' && jwtSecret === DEV_JWT_SECRET) {
    throw new Error('운영 환경에서는 개발용 JWT_SECRET을 쓸 수 없습니다.')
  }
  const dbClient = overrides.dbClient ?? process.env.DB_CLIENT ?? 'sqlite'
  const allowed = new Set(['sqlite', 'postgres', 'mariadb', 'mongodb'])
  if (!allowed.has(dbClient)) {
    throw new Error('DB_CLIENT는 sqlite, postgres, mariadb, mongodb 중 하나여야 합니다.')
  }
  const databaseUrl = overrides.databaseUrl ?? process.env.DATABASE_URL ?? ''
  if (dbClient !== 'sqlite' && !databaseUrl) {
    throw new Error('SQLite가 아니면 DATABASE_URL이 필요합니다.')
  }
  const port = Number(overrides.port ?? process.env.PORT ?? 3000)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('PORT는 0부터 65535 사이의 정수여야 합니다.')
  }
  return {
    nodeEnv,
    stage,
    host: overrides.host ?? process.env.HOST ?? '127.0.0.1',
    port,
    logLevel: overrides.logLevel ?? process.env.LOG_LEVEL ?? 'info',
    jwtSecret,
    jwtExpires: overrides.jwtExpires ?? process.env.JWT_EXPIRES ?? '7d',
    usingDevSecret: jwtSecret === DEV_JWT_SECRET,
    corsOrigin: overrides.corsOrigin ?? process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    cookieSecure: overrides.cookieSecure !== undefined
      ? overrides.cookieSecure
      : readBool(process.env.COOKIE_SECURE, nodeEnv === 'production'),
    trustProxy: overrides.trustProxy !== undefined
      ? overrides.trustProxy
      : readBool(process.env.TRUST_PROXY, false),
    publicBaseUrl: overrides.publicBaseUrl ?? process.env.PUBLIC_BASE_URL ?? 'http://127.0.0.1:3000',
    dbClient,
    sqlitePath: overrides.sqlitePath ?? process.env.SQLITE_PATH ?? './data/board.db',
    databaseUrl,
    uploadDir: overrides.uploadDir ?? process.env.UPLOAD_DIR ?? './data/uploads',
    outboxDir: overrides.outboxDir ?? process.env.OUTBOX_DIR ?? './data/outbox',
    cacheTtlMs: Number(overrides.cacheTtlMs ?? process.env.CACHE_TTL_MS ?? 5000),
    loginRateMax: Number(overrides.loginRateMax ?? process.env.LOGIN_RATE_MAX ?? 30),
    paymentWebhookSecret: overrides.paymentWebhookSecret ?? process.env.PAYMENT_WEBHOOK_SECRET ?? '',
    smtpUrl: overrides.smtpUrl ?? process.env.SMTP_URL ?? '',
    mailFrom: overrides.mailFrom ?? process.env.MAIL_FROM ?? 'study@example.com',
    aiBaseUrl: overrides.aiBaseUrl ?? process.env.AI_BASE_URL ?? '',
    aiApiKey: overrides.aiApiKey ?? process.env.AI_API_KEY ?? '',
    aiModel: overrides.aiModel ?? process.env.AI_MODEL ?? 'local-extractive',
    enableDebugRoutes: overrides.enableDebugRoutes !== undefined
      ? overrides.enableDebugRoutes
      : readBool(process.env.ENABLE_DEBUG_ROUTES, false),
    logger: overrides.logger !== undefined ? overrides.logger : false
  }
}
