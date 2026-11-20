import fp from 'fastify-plugin'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'

async function swaggerPluginImpl(app) {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Fastify 게시판 API',
        version: '1.0.0',
        description: '게시판 공통 API 스펙 v1. 인증은 Authorization Bearer 또는 access_token 쿠키입니다.'
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
        }
      }
    }
  })
}

export const swaggerPlugin = fp(swaggerPluginImpl, { name: 'study-swagger' })

export async function swaggerUiPlugin(app) {
  await app.register(swaggerUi, {
    routePrefix: '/api-docs',
    uiConfig: { docExpansion: 'list' }
  })
}
