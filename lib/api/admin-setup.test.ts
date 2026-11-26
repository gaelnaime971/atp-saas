import { beforeEach, describe, expect, it, vi } from 'vitest'

// /api/admin/setup : 404 pour tout le monde dès qu'un admin existe
// (ou si le comptage échoue). Client Supabase service role simulé.

const db = vi.hoisted(() => ({
  adminCount: 0 as number | null,
  countError: null as null | { message: string },
  createUser: vi.fn(),
  upsert: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: async () => ({ count: db.adminCount, error: db.countError }) }),
      upsert: db.upsert,
    }),
    auth: { admin: { createUser: db.createUser } },
  }),
}))

const { GET, POST } = await import('@/app/api/admin/setup/route')
const { NextRequest } = await import('next/server')
const postReq = () => new NextRequest('http://localhost/api/admin/setup', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'new@x.fr', password: 'motdepasse', full_name: 'N' }),
})

beforeEach(() => {
  db.adminCount = 0
  db.countError = null
  db.createUser.mockReset()
  db.createUser.mockResolvedValue({ data: { user: { id: 'new-admin' } }, error: null })
  db.upsert.mockReset()
  db.upsert.mockResolvedValue({ error: null })
})

describe('un admin existe déjà', () => {
  beforeEach(() => { db.adminCount = 1 })
  it('GET → 404, corps vide', async () => {
    const r = await GET()
    expect(r.status).toBe(404)
    expect(await r.text()).toBe('')
  })
  it('POST → 404, aucun compte créé', async () => {
    const r = await POST(postReq())
    expect(r.status).toBe(404)
    expect(db.createUser).not.toHaveBeenCalled()
    expect(db.upsert).not.toHaveBeenCalled()
  })
})

describe('comptage impossible (erreur base) → fermé', () => {
  beforeEach(() => { db.adminCount = null; db.countError = { message: 'boom' } })
  it('GET et POST → 404, aucun compte créé', async () => {
    expect((await GET()).status).toBe(404)
    expect((await POST(postReq())).status).toBe(404)
    expect(db.createUser).not.toHaveBeenCalled()
  })
})

describe('aucun admin (première installation)', () => {
  it('GET → 200 { adminExists: false }', async () => {
    const r = await GET()
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ adminExists: false })
  })
  it('POST → crée le premier admin', async () => {
    const r = await POST(postReq())
    expect(r.status).toBe(200)
    expect(db.createUser).toHaveBeenCalledTimes(1)
    expect(db.upsert).toHaveBeenCalledTimes(1)
  })
})
