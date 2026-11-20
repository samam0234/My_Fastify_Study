export function createQueue(log) {
  let chain = Promise.resolve()
  const jobs = []
  return {
    push(name, data, handler) {
      const job = { id: jobs.length + 1, name, status: 'queued' }
      jobs.push(job)
      chain = chain.then(async () => {
        job.status = 'running'
        try {
          await handler(data)
          job.status = 'done'
        } catch (error) {
          job.status = 'failed'
          log.error({ err: error, name }, '백그라운드 작업이 실패했습니다.')
        }
      })
      return job
    },
    waitIdle() {
      return chain
    },
    jobs() {
      return jobs
    }
  }
}
