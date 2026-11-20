import { buildApp } from './app.js'
import { resolveConfig } from './config.js'

const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 5)) {
  console.error('Node.js 22.5 이상이 필요합니다. 현재 버전:', process.versions.node)
  process.exit(1)
}

const preview = resolveConfig()
const app = await buildApp({
  logger: {
    level: preview.logLevel,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie'],
      censor: '[redacted]'
    }
  }
})

if (app.config.usingDevSecret) {
  app.log.warn('개발용 JWT_SECRET입니다. 운영 전에 긴 무작위 값으로 바꾸세요.')
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    app.log.info({ signal }, '서버를 종료합니다.')
    app.close().then(() => process.exit(0), () => process.exit(1))
  })
}

try {
  await app.listen({ port: app.config.port, host: app.config.host })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
