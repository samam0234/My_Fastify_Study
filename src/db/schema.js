const indexes = [
  'CREATE INDEX IF NOT EXISTS idx_posts_created ON posts (created_at)',
  'CREATE INDEX IF NOT EXISTS idx_comments_post ON comments (post_id)',
  'CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents (owner_id)'
]

const sqlite = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    nickname TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    tags TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (author_id) REFERENCES users (id)
  )`,
  `CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users (id)
  )`,
  `CREATE TABLE IF NOT EXISTS idempotency_keys (
    lookup_key TEXT PRIMARY KEY,
    status_code INTEGER NOT NULL,
    response_json TEXT NOT NULL,
    location TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    order_name TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    source_text TEXT NOT NULL,
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    owner_id INTEGER NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    sources TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS mails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL,
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  ...indexes
]

function sqlFamily({ id, text, longText, key }) {
  return [
    `CREATE TABLE IF NOT EXISTS users (
      id ${id},
      email ${key} NOT NULL UNIQUE,
      password_hash ${text} NOT NULL,
      nickname ${key} NOT NULL,
      created_at ${text} NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti ${key} PRIMARY KEY,
      user_id BIGINT NOT NULL,
      expires_at ${text} NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS posts (
      id ${id},
      author_id BIGINT NOT NULL,
      title ${text} NOT NULL,
      body ${longText} NOT NULL,
      tags ${text} NOT NULL,
      created_at ${text} NOT NULL,
      updated_at ${text} NOT NULL,
      FOREIGN KEY (author_id) REFERENCES users (id)
    )`,
    `CREATE TABLE IF NOT EXISTS comments (
      id ${id},
      post_id BIGINT NOT NULL,
      author_id BIGINT NOT NULL,
      body ${longText} NOT NULL,
      created_at ${text} NOT NULL,
      FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
      FOREIGN KEY (author_id) REFERENCES users (id)
    )`,
    `CREATE TABLE IF NOT EXISTS idempotency_keys (
      lookup_key ${key} PRIMARY KEY,
      status_code INTEGER NOT NULL,
      response_json ${longText} NOT NULL,
      location ${text},
      created_at ${text} NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS uploads (
      id ${id},
      owner_id BIGINT NOT NULL,
      original_name ${text} NOT NULL,
      stored_name ${key} NOT NULL,
      mime ${key} NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at ${text} NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS payments (
      id ${key} PRIMARY KEY,
      owner_id BIGINT NOT NULL,
      amount INTEGER NOT NULL,
      order_name ${text} NOT NULL,
      status ${key} NOT NULL,
      created_at ${text} NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS documents (
      id ${id},
      owner_id BIGINT NOT NULL,
      filename ${text} NOT NULL,
      source_text ${longText} NOT NULL,
      summary ${longText} NOT NULL,
      created_at ${text} NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS questions (
      id ${id},
      document_id BIGINT NOT NULL,
      owner_id BIGINT NOT NULL,
      question ${text} NOT NULL,
      answer ${longText} NOT NULL,
      sources ${longText} NOT NULL,
      created_at ${text} NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS mails (
      id ${id},
      owner_id BIGINT NOT NULL,
      to_email ${key} NOT NULL,
      subject ${text} NOT NULL,
      body ${longText} NOT NULL,
      created_at ${text} NOT NULL
    )`,
    ...indexes
  ]
}

export function schemaStatements(dialect) {
  if (dialect === 'sqlite') return sqlite
  if (dialect === 'postgres') {
    return sqlFamily({
      id: 'BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY',
      text: 'TEXT',
      longText: 'TEXT',
      key: 'TEXT'
    })
  }
  if (dialect === 'mariadb') {
    return sqlFamily({
      id: 'BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY',
      text: 'TEXT',
      longText: 'LONGTEXT',
      key: 'VARCHAR(255)'
    })
  }
  throw new Error(`스키마가 없는 DB입니다: ${dialect}`)
}
