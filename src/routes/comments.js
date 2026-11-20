import { AppError } from '../errors.js'
import { withIdempotency } from '../lib/idempotency.js'
import { presentComment } from '../lib/present.js'
import { requireAuth } from '../plugins/auth.js'
import { bearer, commentBody, commentListResponse, commentResponse, idParams } from '../schemas.js'

export async function commentRoutes(app) {
  app.get('/api/posts/:id/comments', {
    schema: { tags: ['comments'], params: idParams, response: { 200: commentListResponse } }
  }, async (request) => {
    const post = await app.repo.findPostById(request.params.id)
    if (!post) throw new AppError(404, 'NOT_FOUND', '게시글을 찾을 수 없습니다.')
    const comments = await app.repo.listComments(post.id)
    return { data: comments.map((comment) => presentComment(comment)) }
  })

  app.post('/api/posts/:id/comments', {
    schema: { tags: ['comments'], security: bearer, params: idParams, body: commentBody, response: { 201: commentResponse } },
    preValidation: requireAuth
  }, async (request, reply) => withIdempotency(app, request, reply, async () => {
    const post = await app.repo.findPostById(request.params.id)
    if (!post) throw new AppError(404, 'NOT_FOUND', '게시글을 찾을 수 없습니다.')
    const comment = await app.repo.createComment({
      postId: post.id,
      authorId: request.authUser.id,
      body: request.body.body
    })
    if (app.config.stage === 'final') app.cache.invalidate('posts:')
    return { statusCode: 201, body: { data: presentComment(comment) } }
  }))

  app.delete('/api/comments/:id', {
    schema: { tags: ['comments'], security: bearer, params: idParams },
    preValidation: requireAuth
  }, async (request, reply) => {
    const comment = await app.repo.findCommentById(request.params.id)
    if (!comment) throw new AppError(404, 'NOT_FOUND', '댓글을 찾을 수 없습니다.')
    if (comment.author.id !== request.authUser.id) {
      throw new AppError(403, 'FORBIDDEN', '다른 사람의 댓글은 지울 수 없습니다.')
    }
    await app.repo.deleteComment(comment.id)
    if (app.config.stage === 'final') app.cache.invalidate('posts:')
    return reply.code(204).send()
  })
}
