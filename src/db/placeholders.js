export function toNumberedPlaceholders(sql) {
  let index = 0
  return sql.replace(/\?/g, () => `$${++index}`)
}

export function isUniqueViolation(error) {
  const message = String(error?.message ?? '')
  return error?.code === '23505'
    || error?.code === 'ER_DUP_ENTRY'
    || error?.errno === 1062
    || error?.code === 11000
    || message.includes('UNIQUE constraint failed')
    || message.includes('duplicate key')
}
