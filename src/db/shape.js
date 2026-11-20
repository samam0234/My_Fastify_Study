export function parseJson(value, fallback) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return value
  try {
    return JSON.parse(value ?? '') 
  } catch {
    return fallback
  }
}

export function toUser(row) {
  if (!row) return null
  return {
    id: Number(row.id),
    email: row.email,
    nickname: row.nickname,
    passwordHash: row.password_hash ?? row.passwordHash,
    createdAt: row.created_at ?? row.createdAt
  }
}

export function toPost(row) {
  if (!row) return null
  return {
    id: Number(row.id),
    title: row.title,
    body: row.body,
    tags: parseJson(row.tags, []),
    author: {
      id: Number(row.author_id ?? row.authorId),
      nickname: row.author_nickname ?? row.authorNickname
    },
    commentCount: Number(row.comment_count ?? row.commentCount ?? 0),
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt
  }
}

export function toComment(row) {
  if (!row) return null
  return {
    id: Number(row.id),
    postId: Number(row.post_id ?? row.postId),
    body: row.body,
    author: {
      id: Number(row.author_id ?? row.authorId),
      nickname: row.author_nickname ?? row.authorNickname
    },
    createdAt: row.created_at ?? row.createdAt
  }
}
