import fp from 'fastify-plugin'
import { openDatabase } from '../db/open.js'

async function dbPlugin(app) {
  const opened = await openDatabase(app.config)
  app.decorate('repo', opened.repo)
  app.addHook('onClose', async () => {
    await opened.close()
  })
}

export default fp(dbPlugin, { name: 'study-db' })
