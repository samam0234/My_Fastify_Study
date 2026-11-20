import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const files = [
  'study0.md', 'study1.md', 'study2.md', 'study3.md', 'study4.md', 'study5.md',
  'study6.md', 'study7.md', 'study8.md', 'study9.md', 'study10.md', 'studymidpoint.md',
  'study11.md', 'study12.md', 'study13.md', 'study14.md', 'study15.md', 'study16.md',
  'study17.md', 'study18.md', 'studyfinal.md', 'README.md'
]

const sections = [
  '## ① 목표',
  '## ② 📖 이론',
  '## ③ 🛠️ 실기',
  '## ④ 🔗 연동 포인트',
  '## ⑤ 오류 노트',
  '## ⑥ 직접 해보기',
  '## ⑦ ☐ 체크리스트',
  '## ⑧ 다음 단계'
]

test('study documents keep the shared sections and checklist phrases', async () => {
  const bodies = new Map()
  for (const file of files) bodies.set(file, await readFile(new URL(`../${file}`, import.meta.url), 'utf8'))
  for (const file of files) {
    if (file === 'README.md') continue
    for (const section of sections) assert.ok(bodies.get(file).includes(section), `${file} missing ${section}`)
  }
  assert.match(bodies.get('study2.md'), /Fastify 프로젝트, 라우트와 플러그인/)
  assert.match(bodies.get('study4.md'), /오류 핸들러로 HTTP · REST · API 설계 형식 맞추기/)
  assert.match(bodies.get('study5.md'), /JSON Schema로 요청 검증 \(Express에서는 Zod를 썼다\)/)
  assert.match(bodies.get('study7.md'), /훅\(hooks\)으로 인증, 로깅/)
  const all = [...bodies.values()].join('\n')
  assert.equal(all.includes('Express와 요청 처리 흐름 비교'), false)
  assert.match(bodies.get('study18.md'), /문서에서 찾을 수 없습니다/)
  assert.match(bodies.get('studymidpoint.md'), /1차 배포 체크리스트/)
  assert.match(bodies.get('studyfinal.md'), /최종 회고/)
})
