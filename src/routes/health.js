export async function healthRoutes(app) {
  app.get('/health', {
    schema: {
      tags: ['health'],
      response: {
        200: {
          type: 'object',
          additionalProperties: false,
          required: ['status'],
          properties: { status: { type: 'string' } }
        }
      }
    }
  }, async () => {
    await app.repo.ping()
    return { status: 'ok' }
  })
}
