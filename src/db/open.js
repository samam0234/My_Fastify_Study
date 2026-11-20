import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { schemaStatements } from './schema.js'
import { createSqlRepository } from './sql-repository.js'
import { toNumberedPlaceholders } from './placeholders.js'
import { createMongoRepository } from './mongo-repository.js'

function bind(statement, method, params = []) {
  if (params.length === 0) return statement[method]()
  return statement[method](...params)
}

export function openSqlite(file) {
  if (file !== ':memory:') mkdirSync(path.dirname(path.resolve(file)), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA foreign_keys = ON')
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
  const cache = new Map()
  const statement = (sql) => {
    let prepared = cache.get(sql)
    if (!prepared) {
      prepared = db.prepare(sql)
      cache.set(sql, prepared)
    }
    return prepared
  }
  const adapter = {
    dialect: 'sqlite',
    async exec(sql) { db.exec(sql) },
    async get(sql, params = []) { return bind(statement(sql), 'get', params) ?? null },
    async all(sql, params = []) { return bind(statement(sql), 'all', params) },
    async run(sql, params = []) { return Number(bind(statement(sql), 'run', params).changes) },
    async insert(sql, params = []) { return Number(bind(statement(sql), 'run', params).lastInsertRowid) },
    async close() { db.close() }
  }
  return finish(adapter)
}

function poolAdapter(dialect, pool, exec) {
  const convert = dialect === 'postgres' ? toNumberedPlaceholders : (sql) => sql
  return {
    dialect,
    exec,
    async get(sql, params = []) {
      const [rows] = await poolQuery(pool, convert(sql), params, dialect)
      return rows[0] ?? null
    },
    async all(sql, params = []) {
      const [rows] = await poolQuery(pool, convert(sql), params, dialect)
      return rows
    },
    async run(sql, params = []) {
      const [, result] = await poolQuery(pool, convert(sql), params, dialect)
      return Number(result)
    },
    async insert(sql, params = []) {
      if (dialect === 'postgres') {
        const [rows] = await poolQuery(pool, `${convert(sql)} RETURNING id`, params, dialect)
        return Number(rows[0].id)
      }
      const [, insertId] = await poolQuery(pool, sql, params, dialect, true)
      return Number(insertId)
    },
    async close() { await pool.end() }
  }
}

async function poolQuery(pool, sql, params, dialect, insert = false) {
  if (dialect === 'postgres') {
    const result = await pool.query(sql, params)
    return [result.rows, insert ? result.rows[0]?.id : result.rowCount]
  }
  const [rows] = await pool.query(sql, params)
  if (insert) return [rows, rows.insertId]
  return [Array.isArray(rows) ? rows : [], rows.affectedRows ?? rows.rowCount ?? 0]
}

export async function openPostgres(databaseUrl) {
  const pgModule = await import('pg')
  const Pool = pgModule.default?.Pool ?? pgModule.Pool
  const pool = new Pool({ connectionString: databaseUrl, max: 5 })
  await pool.query('SELECT 1')
  const adapter = poolAdapter('postgres', pool, async (sql) => { await pool.query(sql) })
  return finish(adapter)
}

export async function openMariaDb(databaseUrl) {
  const mysqlModule = await import('mysql2/promise')
  const mysql = mysqlModule.default ?? mysqlModule
  const pool = mysql.createPool(databaseUrl)
  await pool.query('SELECT 1')
  const adapter = poolAdapter('mariadb', pool, async (sql) => { await pool.query(sql) })
  return finish(adapter)
}

export async function openMongo(databaseUrl) {
  const { MongoClient } = await import('mongodb')
  const client = new MongoClient(databaseUrl)
  await client.connect()
  const db = client.db()
  await db.command({ ping: 1 })
  const repo = createMongoRepository(db)
  await repo.ensureIndexes()
  return { repo, close: () => client.close() }
}

async function finish(adapter) {
  for (const statement of schemaStatements(adapter.dialect)) await adapter.exec(statement)
  return { repo: createSqlRepository(adapter), close: () => adapter.close() }
}

export async function openDatabase(config) {
  if (config.dbClient === 'sqlite') return openSqlite(config.sqlitePath)
  if (config.dbClient === 'postgres') return openPostgres(config.databaseUrl)
  if (config.dbClient === 'mariadb') return openMariaDb(config.databaseUrl)
  if (config.dbClient === 'mongodb') return openMongo(config.databaseUrl)
  throw new Error(`지원하지 않는 DB_CLIENT입니다: ${config.dbClient}`)
}
