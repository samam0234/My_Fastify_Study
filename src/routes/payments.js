import { randomUUID } from 'node:crypto'
import { AppError } from '../errors.js'
import { presentPayment } from '../lib/present.js'
import { verifySignature } from '../lib/signature.js'
import { requireAuth } from '../plugins/auth.js'
import { bearer } from '../schemas.js'

const createBody = {
  type: 'object',
  additionalProperties: false,
  required: ['amount', 'orderName'],
  properties: {
    amount: { type: 'integer', minimum: 100, maximum: 10000000 },
    orderName: { type: 'string', minLength: 1, maxLength: 80 }
  }
}

export async function paymentRoutes(app) {
  app.post('/api/payments', {
    schema: { tags: ['payments'], security: bearer, body: createBody },
    preValidation: requireAuth
  }, async (request, reply) => {
    const payment = await app.repo.createPayment({
      id: randomUUID(),
      ownerId: request.authUser.id,
      amount: request.body.amount,
      orderName: request.body.orderName,
      status: 'READY'
    })
    return reply.code(201).send({ data: presentPayment(payment) })
  })

  app.post('/api/payments/:id/confirm', {
    schema: {
      tags: ['payments'],
      security: bearer,
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', minLength: 8, maxLength: 80 } }
      },
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['amount'],
        properties: { amount: { type: 'integer' } }
      }
    },
    preValidation: requireAuth
  }, async (request) => {
    const payment = await app.repo.findPayment(request.params.id)
    if (!payment) throw new AppError(404, 'NOT_FOUND', '결제를 찾을 수 없습니다.')
    if (payment.ownerId !== request.authUser.id) throw new AppError(403, 'FORBIDDEN', '다른 사람의 결제는 확정할 수 없습니다.')
    if (payment.amount !== request.body.amount) {
      throw new AppError(400, 'VALIDATION_ERROR', '입력값을 확인하세요.', { amount: ['결제 금액이 주문과 다릅니다.'] })
    }
    if (payment.status === 'PAID') return { data: presentPayment(payment) }
    const updated = await app.repo.updatePaymentStatus(payment.id, 'PAID')
    return { data: presentPayment(updated) }
  })

  app.post('/api/payments/webhook', { schema: { tags: ['payments'] } }, async (request) => {
    if (!app.config.paymentWebhookSecret) {
      throw new AppError(503, 'SERVICE_UNAVAILABLE', '결제 웹훅 비밀이 설정되지 않았습니다.')
    }
    if (!request.rawBody || !verifySignature(app.config.paymentWebhookSecret, request.rawBody, request.headers['x-payment-signature'])) {
      throw new AppError(401, 'UNAUTHORIZED', '웹훅 서명이 올바르지 않습니다.')
    }
    const payment = await app.repo.findPayment(request.body?.id)
    if (!payment) throw new AppError(404, 'NOT_FOUND', '결제를 찾을 수 없습니다.')
    const status = request.body?.status
    if (status !== 'PAID' && status !== 'CANCELLED') {
      throw new AppError(400, 'VALIDATION_ERROR', '입력값을 확인하세요.', { status: ['PAID 또는 CANCELLED여야 합니다.'] })
    }
    const updated = await app.repo.updatePaymentStatus(payment.id, status)
    return { data: presentPayment(updated) }
  })
}
