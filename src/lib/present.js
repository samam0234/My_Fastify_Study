export function presentUser(user) {
  return { id: user.id, email: user.email, nickname: user.nickname }
}

export function presentPost(post, detail = false) {
  if (!detail) {
    return {
      id: post.id,
      title: post.title,
      author: post.author,
      commentCount: post.commentCount,
      createdAt: post.createdAt
    }
  }
  return {
    id: post.id,
    title: post.title,
    body: post.body,
    tags: post.tags,
    author: post.author,
    commentCount: post.commentCount,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt
  }
}

export function presentComment(comment) {
  return {
    id: comment.id,
    body: comment.body,
    author: comment.author,
    createdAt: comment.createdAt
  }
}

export function presentDocument(document, detail = false) {
  const base = {
    id: document.id,
    filename: document.filename,
    summary: document.summary,
    createdAt: document.createdAt
  }
  if (!detail) return base
  return { ...base, text: document.sourceText }
}

export function presentQuestion(row) {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    sources: row.sources,
    createdAt: row.createdAt
  }
}

export function presentPayment(payment) {
  return {
    id: payment.id,
    amount: payment.amount,
    orderName: payment.orderName,
    status: payment.status,
    createdAt: payment.createdAt
  }
}

export function presentUpload(upload) {
  return {
    id: upload.id,
    originalName: upload.originalName,
    mime: upload.mime,
    sizeBytes: upload.sizeBytes,
    createdAt: upload.createdAt
  }
}
