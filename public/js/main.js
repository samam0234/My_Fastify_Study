import { api } from './api.js'
import { clientPostErrors, clientSignupErrors, messageForStatus } from './form.js'
import { createStore } from './state.js'

const notice = document.querySelector('#notice')
const auth = document.querySelector('#auth')
const board = document.querySelector('#board')
const health = document.querySelector('#health')
const draftKey = 'fastify-board-draft'
const store = createStore({
  me: null,
  mode: 'login',
  posts: [],
  meta: { page: 1, totalPages: 0, q: '' },
  q: '',
  sort: '-createdAt',
  detail: null,
  comments: [],
  saving: false,
  idempotencyKey: crypto.randomUUID(),
  live: '실시간 연결 전'
})

function text(tag, value, className) {
  const node = document.createElement(tag)
  if (className) node.className = className
  node.textContent = value
  return node
}

function field(labelText, name, type = 'text', value = '') {
  const label = document.createElement('label')
  label.textContent = labelText
  const input = document.createElement(type === 'textarea' ? 'textarea' : 'input')
  if (type !== 'textarea') input.type = type
  input.name = name
  input.value = value
  label.append(input)
  return label
}

function showNotice(status, data) {
  notice.textContent = messageForStatus(status, data)
}

store.subscribe((state) => {
  auth.hidden = Boolean(state.me)
  board.hidden = !state.me
  renderAuth(state)
  renderBoard(state)
})

function renderAuth(state) {
  if (state.me) {
    auth.replaceChildren()
    return
  }
  const form = document.createElement('form')
  form.className = 'card'
  form.append(
    text('h2', state.mode === 'signup' ? '회원가입' : '로그인'),
    field('이메일', 'email', 'email'),
    field('비밀번호', 'password', 'password')
  )
  if (state.mode === 'signup') form.append(field('별명', 'nickname'))
  const submit = document.createElement('button')
  submit.type = 'submit'
  submit.textContent = state.mode === 'signup' ? '가입하기' : '들어가기'
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'quiet'
  toggle.textContent = state.mode === 'signup' ? '로그인으로' : '회원가입으로'
  toggle.addEventListener('click', () => store.set({ mode: state.mode === 'signup' ? 'login' : 'signup' }))
  form.append(submit, toggle)
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const input = Object.fromEntries(new FormData(form))
    if (state.mode === 'signup') {
      const fields = clientSignupErrors(input)
      if (Object.keys(fields).length) {
        notice.textContent = messageForStatus(422, { error: { fields } })
        return
      }
      const signup = await api('/api/auth/signup', { method: 'POST', json: input })
      showNotice(signup.status, signup.data)
      if (signup.status !== 201) return
    }
    const login = await api('/api/auth/login', { method: 'POST', json: { email: input.email, password: input.password } })
    showNotice(login.status, login.data)
    if (login.status !== 200) return
    store.set({ me: login.data.data.user })
    await refresh()
    connectSocket()
  })
  auth.replaceChildren(form)
}

function renderBoard(state) {
  if (!state.me) {
    board.replaceChildren()
    return
  }
  const draft = JSON.parse(localStorage.getItem(draftKey) || '{}')
  const writer = document.createElement('form')
  writer.className = 'card'
  writer.append(
    text('h2', `${state.me.nickname}님의 글`),
    field('제목', 'title', 'text', draft.title ?? ''),
    field('본문', 'body', 'textarea', draft.body ?? '')
  )
  const save = document.createElement('button')
  save.type = 'submit'
  save.textContent = state.saving ? '저장 중' : '등록'
  save.disabled = state.saving
  const logout = document.createElement('button')
  logout.type = 'button'
  logout.className = 'quiet'
  logout.textContent = '로그아웃'
  logout.addEventListener('click', async () => {
    const result = await api('/api/auth/logout', { method: 'POST' })
    showNotice(result.status, result.data)
    if (result.status === 204) store.set({ me: null, detail: null, posts: [] })
  })
  writer.append(save, logout)
  writer.addEventListener('input', () => {
    const input = Object.fromEntries(new FormData(writer))
    localStorage.setItem(draftKey, JSON.stringify({ title: input.title ?? '', body: input.body ?? '' }))
  })
  writer.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (store.get().saving) return
    const input = Object.fromEntries(new FormData(writer))
    const fields = clientPostErrors(input)
    if (Object.keys(fields).length) {
      notice.textContent = messageForStatus(422, { error: { fields } })
      return
    }
    store.set({ saving: true })
    const result = await api('/api/posts', {
      method: 'POST',
      json: { title: input.title, body: input.body, tags: ['note'] },
      idempotencyKey: store.get().idempotencyKey
    })
    showNotice(result.status, result.data)
    store.set({ saving: false, idempotencyKey: result.status === 201 ? crypto.randomUUID() : store.get().idempotencyKey })
    if (result.status === 201) {
      localStorage.removeItem(draftKey)
      await refresh()
    }
  })

  const filters = document.createElement('form')
  filters.className = 'row'
  const q = document.createElement('input')
  q.name = 'q'
  q.value = state.q
  q.placeholder = '제목 또는 본문'
  const sort = document.createElement('select')
  sort.name = 'sort'
  for (const [value, label] of [['-createdAt', '최신순'], ['createdAt', '오래된순'], ['-commentCount', '댓글 많은순']]) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label
    option.selected = value === state.sort
    sort.append(option)
  }
  const search = document.createElement('button')
  search.type = 'submit'
  search.textContent = '찾기'
  filters.append(q, sort, search)
  filters.addEventListener('submit', async (event) => {
    event.preventDefault()
    store.set({ q: q.value, sort: sort.value })
    await refresh()
  })

  const list = document.createElement('div')
  for (const post of state.posts) {
    const item = document.createElement('article')
    const open = document.createElement('button')
    open.type = 'button'
    open.className = 'quiet'
    open.textContent = '열기'
    open.addEventListener('click', () => openPost(post.id))
    item.append(text('h2', post.title), text('p', `${post.author.nickname} · 댓글 ${post.commentCount} · ${post.createdAt}`, 'meta'), open)
    list.append(item)
  }
  const pager = document.createElement('div')
  pager.className = 'pager'
  const prev = document.createElement('button')
  prev.type = 'button'
  prev.className = 'quiet'
  prev.textContent = '이전'
  prev.disabled = state.meta.page <= 1
  const next = document.createElement('button')
  next.type = 'button'
  next.className = 'quiet'
  next.textContent = '다음'
  next.disabled = state.meta.page >= state.meta.totalPages
  prev.addEventListener('click', () => changePage(state.meta.page - 1))
  next.addEventListener('click', () => changePage(state.meta.page + 1))
  pager.append(prev, text('span', `${state.meta.page} / ${state.meta.totalPages || 0}`), next)

  const detail = document.createElement('section')
  if (state.detail) {
    detail.className = 'card'
    detail.append(text('h2', state.detail.title), text('p', state.detail.body), text('p', state.detail.tags.join(', '), 'meta'))
    if (state.detail.author.id === state.me.id) {
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'quiet'
      remove.textContent = '글 삭제'
      remove.addEventListener('click', async () => {
        const result = await api(`/api/posts/${state.detail.id}`, { method: 'DELETE' })
        showNotice(result.status, result.data)
        if (result.status === 204) {
          store.set({ detail: null, comments: [] })
          await refresh()
        }
      })
      detail.append(remove)
    }
    for (const comment of state.comments) {
      detail.append(text('p', `${comment.author.nickname}: ${comment.body}`))
    }
    const commentForm = document.createElement('form')
    commentForm.append(field('댓글', 'body', 'text'))
    const send = document.createElement('button')
    send.type = 'submit'
    send.textContent = '댓글 등록'
    commentForm.append(send)
    commentForm.addEventListener('submit', async (event) => {
      event.preventDefault()
      const input = Object.fromEntries(new FormData(commentForm))
      const result = await api(`/api/posts/${state.detail.id}/comments`, { method: 'POST', json: { body: input.body } })
      showNotice(result.status, result.data)
      if (result.status === 201) await openPost(state.detail.id)
    })
    detail.append(commentForm)
  }
  board.replaceChildren(writer, filters, text('p', state.live, 'hint'), list, pager, detail)
}

async function refresh() {
  const state = store.get()
  const params = new URLSearchParams({ page: String(state.meta.page || 1), limit: '10', sort: state.sort })
  if (state.q) params.set('q', state.q)
  const result = await api(`/api/posts?${params}`)
  showNotice(result.status, result.data)
  if (result.status === 200) store.set({ posts: result.data.data, meta: result.data.meta })
}

async function changePage(page) {
  const meta = { ...store.get().meta, page }
  store.set({ meta })
  await refresh()
}

async function openPost(id) {
  const [post, comments] = await Promise.all([
    api(`/api/posts/${id}`),
    api(`/api/posts/${id}/comments`)
  ])
  showNotice(post.status, post.data)
  if (post.status === 200 && comments.status === 200) {
    store.set({ detail: post.data.data, comments: comments.data.data })
  }
}

function connectSocket() {
  const socket = new WebSocket(`${location.origin.replace(/^http/, 'ws')}/ws`)
  socket.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data)
    if (payload.type === 'ready') store.set({ live: `실시간 연결됨 · 사용자 ${payload.userId}` })
    if (payload.type === 'post.created') store.set({ live: `새 글 번호 ${payload.id}` })
  })
  socket.addEventListener('close', () => store.set({ live: '실시간 연결이 끊겼습니다.' }))
}

const healthResult = await api('/health')
health.textContent = healthResult.status === 200 ? '서버 상태: ok' : '서버 상태를 읽지 못했습니다.'
const me = await api('/api/auth/me')
if (me.status === 200) {
  store.set({ me: me.data.data })
  await refresh()
  connectSocket()
} else {
  store.set({ me: null })
}
