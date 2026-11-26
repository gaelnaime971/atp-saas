import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INVITE_REFUSAL } from '@/lib/invitations/attempts'

// Route /api/invitations/validate contre une table en mémoire qui
// reproduit les filtres utilisés (ilike, eq, is) et les updates
// conditionnels (compare-and-set). Aucune écriture réelle.

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({
  tables: { invitations: [] as Row[], profiles: [] as Row[] } as Record<string, Row[]>,
  createUser: vi.fn(),
}))

function likeToRegex(pattern: string): RegExp {
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '\\') { re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue }
    if (c === '%') re += '.*'
    else if (c === '_') re += '.'
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`, 'i')
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = []
      let op: 'select' | 'update' = 'select'
      let vals: Row = {}
      let returning = false
      const q = {
        select() { if (op === 'update') returning = true; return q },
        update(v: Row) { op = 'update'; vals = v; return q },
        ilike(col: string, pat: string) { const re = likeToRegex(pat); filters.push(r => re.test(String(r[col]))); return q },
        eq(col: string, v: unknown) { filters.push(r => r[col] === v); return q },
        is(col: string, v: unknown) { filters.push(r => r[col] === v); return q },
        then(res: (v: unknown) => void) {
          const rows = db.tables[table].filter(r => filters.every(f => f(r)))
          if (op === 'select') return res({ data: rows.map(r => ({ ...r })), error: null })
          rows.forEach(r => Object.assign(r, vals))
          return res({ data: returning ? rows.map(r => ({ id: r.id })) : null, error: null })
        },
      }
      return q
    },
    auth: { admin: { createUser: db.createUser } },
  }),
}))

const { POST } = await import('@/app/api/invitations/validate/route')
const { NextRequest } = await import('next/server')
const call = (body: Row) => POST(new NextRequest('http://localhost/api/invitations/validate', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}))
const attempt = (code: string, email = 'jean@example.com') => call({ email, code, password: 'motdepasse' })

const invitation = (o: Row = {}): Row => ({
  id: 'inv-1', email: 'Jean@Example.com', code: '482915',
  expires_at: '2026-12-20T00:00:00Z', used_at: null, failed_attempts: 0, locked_until: null,
  full_name: 'J', plan_type: 'group', propfirm_name: null, whop_link: null, whop_email: null, admin_observations: null,
  ...o,
})
const inv = () => db.tables.invitations[0]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-26T12:00:00Z'))
  db.tables.invitations = [invitation()]
  db.tables.profiles = []
  db.createUser.mockReset()
  db.createUser.mockResolvedValue({ data: { user: { id: 'new-user' } }, error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('invitation existante à 6 chiffres', () => {
  it('bon code → compte créé, invitation consommée', async () => {
    const r = await attempt('482915')
    expect(r.status).toBe(200)
    expect(db.createUser).toHaveBeenCalledTimes(1)
    expect(db.createUser.mock.calls[0][0]).toMatchObject({ email: 'Jean@Example.com', user_metadata: { role: 'trader' } })
    expect(inv().used_at).not.toBeNull()
  })
})

describe('5 codes faux → blocage', () => {
  it('5 refus identiques, puis invitation bloquée 15 min', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await attempt('000000')
      expect(r.status).toBe(400)
      expect(await r.json()).toEqual({ error: INVITE_REFUSAL })
    }
    expect(inv().failed_attempts).toBe(5)
    expect(inv().locked_until).toBe('2026-11-26T12:15:00.000Z')
    expect(db.createUser).not.toHaveBeenCalled()
  })
  it('bon code pendant le blocage → refusé, aucun compte créé', async () => {
    for (let i = 0; i < 5; i++) await attempt('000000')
    vi.setSystemTime(new Date('2026-11-26T12:14:00Z'))
    const r = await attempt('482915')
    expect(r.status).toBe(400)
    expect(await r.json()).toEqual({ error: INVITE_REFUSAL })
    expect(db.createUser).not.toHaveBeenCalled()
    expect(inv().used_at).toBeNull()
  })
  it('après les 15 minutes → bon code accepté', async () => {
    for (let i = 0; i < 5; i++) await attempt('000000')
    vi.setSystemTime(new Date('2026-11-26T12:16:00Z'))
    expect((await attempt('482915')).status).toBe(200)
    expect(db.createUser).toHaveBeenCalledTimes(1)
  })
  it('essais en parallèle : un seul compte, les autres perdent la course et sont refusés', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => attempt('000000')))
    for (const r of results) expect(r.status).toBe(400)
    // Les 8 ont lu 0 : un seul compare-and-set passe, les 7 autres sont
    // refusés sans avoir pu tester leur code.
    expect(inv().failed_attempts).toBe(1)
    expect(db.createUser).not.toHaveBeenCalled()
  })
  it('bon code envoyé en même temps que le 5e faux → refusé (le blocage gagne)', async () => {
    for (let i = 0; i < 4; i++) await attempt('000000')
    const [wrong, right] = await Promise.all([attempt('000000'), attempt('482915')])
    expect(wrong.status).toBe(400)
    expect(right.status).toBe(400)
    expect(inv().locked_until).not.toBeNull()
    expect(db.createUser).not.toHaveBeenCalled()
  })
})

describe('création de compte sans code valide → refusée', () => {
  it.each([
    ['code faux', () => attempt('123456')],
    ['e-mail inconnu', () => attempt('482915', 'autre@example.com')],
    ['invitation expirée', () => { inv().expires_at = '2026-11-01T00:00:00Z'; return attempt('482915') }],
    ['invitation déjà utilisée', () => { inv().used_at = '2026-11-20T00:00:00Z'; return attempt('482915') }],
  ])('%s → même message, aucun compte', async (_label, run) => {
    const r = await run()
    expect(r.status).toBe(400)
    expect(await r.json()).toEqual({ error: INVITE_REFUSAL })
    expect(db.createUser).not.toHaveBeenCalled()
  })
  it('jokers dans l’e-mail (%) : ne touche pas les invitations des autres', async () => {
    const r = await attempt('000000', '%')
    expect(r.status).toBe(400)
    expect(inv().failed_attempts).toBe(0)
  })
  it('création du compte en échec → invitation libérée pour réessayer', async () => {
    db.createUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'boom' } })
    expect((await attempt('482915')).status).toBe(500)
    expect(inv().used_at).toBeNull()
    expect((await attempt('482915')).status).toBe(200)
  })
})
