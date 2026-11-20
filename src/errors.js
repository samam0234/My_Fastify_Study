export class AppError extends Error {
  constructor(statusCode, code, message, fields) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.fields = fields
  }
}

export function errorBody(request, { code, message, fields }) {
  const error = { code, message, requestId: request.id }
  if (fields && Object.keys(fields).length > 0) error.fields = fields
  return { error }
}

export function validationError(fields) {
  return new AppError(400, 'VALIDATION_ERROR', '입력값을 확인하세요.', fields)
}
