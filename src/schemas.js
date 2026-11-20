const email = { type: 'string', minLength: 3, maxLength: 200, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' }
const password = { type: 'string', minLength: 8, maxLength: 72 }
const nickname = { type: 'string', minLength: 1, maxLength: 30 }
const title = { type: 'string', minLength: 1, maxLength: 200 }
const postBody = { type: 'string', minLength: 1, maxLength: 5000 }
const tags = { type: 'array', maxItems: 10, items: { type: 'string', minLength: 1, maxLength: 20 } }

export const idParams = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: { type: 'string', pattern: '^[1-9]\\d*$' } }
}

export const signupBody = {
  type: 'object',
  additionalProperties: false,
  required: ['email', 'password', 'nickname'],
  properties: { email, password, nickname }
}

export const loginBody = {
  type: 'object',
  additionalProperties: false,
  required: ['email', 'password'],
  properties: { email, password }
}

export const postCreateBody = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'body'],
  properties: { title, body: postBody, tags }
}

export const postPatchBody = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: { title, body: postBody, tags }
}

export const commentBody = {
  type: 'object',
  additionalProperties: false,
  required: ['body'],
  properties: { body: { type: 'string', minLength: 1, maxLength: 1000 } }
}

export const listQuery = {
  type: 'object',
  additionalProperties: true,
  properties: {
    page: { type: 'string' },
    limit: { type: 'string' },
    q: { type: 'string' },
    sort: { type: 'string' }
  }
}

const author = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'nickname'],
  properties: { id: { type: 'integer' }, nickname: { type: 'string' } }
}

const postListItem = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'title', 'author', 'commentCount', 'createdAt'],
  properties: {
    id: { type: 'integer' },
    title: { type: 'string' },
    author,
    commentCount: { type: 'integer' },
    createdAt: { type: 'string' }
  }
}

const postDetail = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'title', 'body', 'tags', 'author', 'commentCount', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'integer' },
    title: { type: 'string' },
    body: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    author,
    commentCount: { type: 'integer' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' }
  }
}

export const postListResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['data', 'meta'],
  properties: {
    data: { type: 'array', items: postListItem },
    meta: {
      type: 'object',
      additionalProperties: false,
      required: ['page', 'limit', 'total', 'totalPages', 'q'],
      properties: {
        page: { type: 'integer' },
        limit: { type: 'integer' },
        total: { type: 'integer' },
        totalPages: { type: 'integer' },
        q: { type: ['string', 'null'] }
      }
    }
  }
}

export const postResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: { data: postDetail }
}

export const userResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'email', 'nickname'],
      properties: {
        id: { type: 'integer' },
        email: { type: 'string' },
        nickname: { type: 'string' }
      }
    }
  }
}

export const loginResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['user', 'accessToken'],
      properties: {
        user: userResponse.properties.data,
        accessToken: { type: 'string' }
      }
    }
  }
}

export const commentResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'body', 'author', 'createdAt'],
      properties: {
        id: { type: 'integer' },
        body: { type: 'string' },
        author,
        createdAt: { type: 'string' }
      }
    }
  }
}

export const commentListResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: { data: { type: 'array', items: commentResponse.properties.data } }
}

export const bearer = [{ bearerAuth: [] }]
