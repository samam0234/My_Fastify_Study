import { AppError } from '../errors.js'
import { parseListQuery } from '../lib/http.js'
import { withIdempotency } from '../lib/idempotency.js'
import { presentPost } from '../lib/present.js'
import { requireAuth } from '../plugins/auth.js'
import { bearer, idParams, listQuery, postCreateBody, postListResponse, postPatchBody, postResponse } from '../schemas.js'

function cacheKey(query) {
  return `posts:${query.sort}:${query.page}:${query.limit}:${query.q ?? ''}`
}

function invalidate(app) {
  if (app.config.stage === 'final') app.cache.invalidate('posts:')
}

async function ownPost(app, request) {
  const post = await app.repo.findPostById(request.params.id)
  if (!post) throw new AppError(404, 'NOT_FOUND', '게시글을 찾을 수 없습니다.')
  if (post.author.id !== request.authUser.id) {
    throw new AppError(403, 'FORBIDDEN', '다른 사람의 글은 바꿀 수 없습니다.')
  }
  return post
}

export async function postRoutes(app) {
  app.get('/api/posts', { schema: { tags: ['posts'], querystring: listQuery, response: { 200: postListResponse } } }, async (request, reply) => {
    const query = parseListQuery(request.query)
    const key = cacheKey(query)
    if (app.config.stage === 'final') {
      const hit = app.cache.get(key)
      if (hit) {
        reply.header('x-cache', 'HIT')
        return hit
      }
    }
    const started = process.hrtime.bigint()
    const { items, total } = await app.repo.listPosts(query)
    const body = {
      data: items.map((post) => presentPost(post, false)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
        q: query.q
      }
    }
    if (app.config.stage === 'final') {
      app.cache.set(key, body, app.config.cacheTtlMs)
      reply.header('x-cache', 'MISS')
      const ms = Number(process.hrtime.bigint() - started) / 1e6
      reply.header('server-timing', `db;dur=${ms.toFixed(2)}`)
    }
    return body
  })

  app.get('/api/posts/:id', { schema: { tags: ['posts'], params: idParams, response: { 200: postResponse } } }, async (request) => {
    const post = await app.repo.findPostById(request.params.id)
    if (!post) throw new AppError(404, 'NOT_FOUND', '게시글을 찾을 수 없습니다.')
    return { data: presentPost(post, true) }
  })

  app.post('/api/posts', {
    schema: { tags: ['posts'], security: bearer, body: postCreateBody, response: { 201: postResponse } },
    preValidation: requireAuth
  }, async (request, reply) => withIdempotency(app, request, reply, async () => {
    const post = await app.repo.createPost({
      authorId: request.authUser.id,
      title: request.body.title,
      body: request.body.body,
      tags: request.body.tags ?? []
    })
    invalidate(app)
    app.realtime.publish({ type: 'post.created', id: post.id })
    return { statusCode: 201, location: `/api/posts/${post.id}`, body: { data: presentPost(post, true) } }
  }))

  app.patch('/api/posts/:id', {
    schema: { tags: ['posts'], security: bearer, params: idParams, body: postPatchBody, response: { 200: postResponse } },
    preValidation: requireAuth
  }, async (request) => {
    const current = await ownPost(app, request)
    const post = await app.repo.updatePost(current.id, {
      title: request.body.title ?? current.title,
      body: request.body.body ?? current.body,
      tags: request.body.tags ?? current.tags
    })
    invalidate(app)
    return { data: presentPost(post, true) }
  })

  app.delete('/api/posts/:id', {
    schema: { tags: ['posts'], security: bearer, params: idParams },
    preValidation: requireAuth
  }, async (request, reply) => {
    const current = await ownPost(app, request)
    await app.repo.deletePost(current.id)
    invalidate(app)
    return reply.code(204).send()
  })
}
