import websocket from '@fastify/websocket'

export async function realtimeRoutes(app) {
  await app.register(websocket)
  app.get('/ws', { websocket: true }, async (socket, request) => {
    const token = request.query.token || request.cookies?.access_token
    let payload
    try {
      payload = app.jwt.verify(token)
      if (!payload?.jti || await app.repo.isTokenRevoked(payload.jti)) throw new Error('revoked')
    } catch {
      socket.close(4001, 'unauthorized')
      return
    }
    app.realtime.add(socket)
    socket.send(JSON.stringify({ type: 'ready', userId: Number(payload.sub) }))
    socket.on('message', (raw) => {
      if (String(raw) === 'ping') socket.send(JSON.stringify({ type: 'pong' }))
    })
    socket.on('close', () => app.realtime.remove(socket))
  })
}
