export function clientSignupErrors(input) {
  const fields = {}
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email ?? '')) fields.email = ['이메일 형식을 확인하세요.']
  if ((input.password ?? '').length < 8 || (input.password ?? '').length > 72) fields.password = ['8~72자로 입력하세요.']
  if (!(input.nickname ?? '').trim()) fields.nickname = ['별명을 입력하세요.']
  return fields
}

export function clientPostErrors(input) {
  const fields = {}
  if (!(input.title ?? '').trim()) fields.title = ['제목을 입력하세요.']
  if (!(input.body ?? '').trim()) fields.body = ['본문을 입력하세요.']
  return fields
}

export function messageForStatus(status, data) {
  if (status === 200 || status === 201 || status === 202 || status === 204) return ''
  if (status === 400 || status === 422) {
    const fields = data?.error?.fields
    if (fields) return Object.entries(fields).map(([key, list]) => `${key}: ${list.join(' ')}`).join('\n')
  }
  return data?.error?.message ?? `요청이 실패했습니다. (${status})`
}
