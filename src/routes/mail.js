import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import nodemailer from 'nodemailer'
import { requireAuth } from '../plugins/auth.js'
import { bearer } from '../schemas.js'

async function deliverMail(config, message) {
  await mkdir(config.outboxDir, { recursive: true })
  const file = path.join(config.outboxDir, `${Date.now()}-${randomUUID()}.json`)
  await writeFile(file, JSON.stringify(message, null, 2))
  if (config.smtpUrl) {
    const transport = nodemailer.createTransport(config.smtpUrl)
    await transport.sendMail({
      from: config.mailFrom,
      to: message.toEmail,
      subject: message.subject,
      text: message.body
    })
  }
  return file
}

export async function mailRoutes(app) {
  app.post('/api/mail', {
    schema: {
      tags: ['mail'],
      security: bearer,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['to', 'subject', 'body'],
        properties: {
          to: { type: 'string', minLength: 3, maxLength: 200 },
          subject: { type: 'string', minLength: 1, maxLength: 120 },
          body: { type: 'string', minLength: 1, maxLength: 5000 }
        }
      }
    },
    preValidation: requireAuth
  }, async (request, reply) => {
    const message = {
      ownerId: request.authUser.id,
      toEmail: request.body.to,
      subject: request.body.subject,
      body: request.body.body
    }
    app.queue.push('mail', message, async (data) => {
      await deliverMail(app.config, data)
      await app.repo.createMail(data)
    })
    return reply.code(202).send({ data: { status: 'queued' } })
  })

  app.get('/api/mail', { schema: { tags: ['mail'], security: bearer }, preValidation: requireAuth }, async (request) => {
    const rows = await app.repo.listMails(request.authUser.id)
    return {
      data: rows.map((row) => ({
        id: row.id,
        to: row.toEmail,
        subject: row.subject,
        body: row.body,
        createdAt: row.createdAt
      }))
    }
  })
}
