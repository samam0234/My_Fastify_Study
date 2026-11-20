// 이 파일은 Drizzle ORM 스키마가 SQL 어댑터와 어떻게 다른지 보여주는 참고 예제다.
// 기본 실행 경로는 src/db이며, 이 파일을 import하지 않는다.

export const users = {
  table: 'users',
  columns: {
    id: 'integer primary key',
    email: 'text not null unique',
    passwordHash: 'text not null',
    nickname: 'text not null',
    createdAt: 'text not null'
  }
}

export const posts = {
  table: 'posts',
  columns: {
    id: 'integer primary key',
    authorId: 'integer not null',
    title: 'text not null',
    body: 'text not null',
    tags: 'text not null',
    createdAt: 'text not null',
    updatedAt: 'text not null'
  }
}
