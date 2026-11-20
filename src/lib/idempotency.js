import { validationError } from '../errors.js'

export function readIdempotencyKey(request) {
  const key = request.headers['idempotency-key']
  if (key === undefined) return null
  if (typeof key !== 'string' || !/^[A-Za-z0-9._:-]{8,80}$/.test(key)) {
    throw validationError({
      'Idempotency-Key': ['8~80자의 영문, 숫자, ., _, :, - 만 사용할 수 있습니다.']
    })
  }
  return key
}

export async function withIdempotency(app, request, reply, producer) {
  const key = readIdempotencyKey(request)
  const lookupKey = key
    ? `${request.authUser.id}|${request.method}|${request.routeOptions.url}|${key}`
    : null
  if (lookupKey) {
    const previous = await app.repo.findIdempotency(lookupKey)
    if (previous) {
      if (previous.location) reply.header('location', previous.location)
      return reply.code(previous.statusCode).send(JSON.parse(previous.responseJson))
    }
  }
  const result = await producer()
  if (lookupKey && result.statusCode >= 200 && result.statusCode < 300) {
    await app.repo.saveIdempotency({
      lookupKey,
      statusCode: result.statusCode,
      responseJson: JSON.stringify(result.body),
      location: result.location ?? null
    })
  }
  if (result.location) reply.header('location', result.location)
  return reply.code(result.statusCode).send(result.body)
}
