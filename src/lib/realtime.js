export function createRealtime() {
  const sockets = new Set()
  return {
    add(socket) { sockets.add(socket) },
    remove(socket) { sockets.delete(socket) },
    publish(event) {
      const text = JSON.stringify(event)
      for (const socket of sockets) {
        if (socket.readyState === 1) socket.send(text)
      }
    }
  }
}
