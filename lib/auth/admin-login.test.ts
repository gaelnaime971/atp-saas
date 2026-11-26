import { describe, expect, it, vi } from 'vitest'
import { adminLogin, ADMIN_LOGIN_ERROR, type AdminLoginPorts } from '@/lib/auth/admin-login'

function fake(opts: { authOk: boolean; role?: string | null }) {
  const ports = {
    signIn: vi.fn(async () => (opts.authOk ? 'u1' : null)),
    readRole: vi.fn(async () => opts.role ?? null),
    signOut: vi.fn(async () => ({})),
  } satisfies AdminLoginPorts
  return ports
}

describe('adminLogin', () => {
  it('admin → connexion réussie, pas de déconnexion', async () => {
    const p = fake({ authOk: true, role: 'admin' })
    expect(await adminLogin(p, 'a@x.fr', 'pw')).toEqual({ ok: true })
    expect(p.signIn).toHaveBeenCalledWith('a@x.fr', 'pw')
    expect(p.readRole).toHaveBeenCalledWith('u1')
    expect(p.signOut).not.toHaveBeenCalled()
  })
  it('compte non admin → déconnecté et message générique', async () => {
    const p = fake({ authOk: true, role: 'trader' })
    expect(await adminLogin(p, 't@x.fr', 'pw')).toEqual({ ok: false, error: ADMIN_LOGIN_ERROR })
    expect(p.signOut).toHaveBeenCalledTimes(1)
  })
  it('rôle illisible → déconnecté et message générique', async () => {
    const p = fake({ authOk: true, role: null })
    expect(await adminLogin(p, 't@x.fr', 'pw')).toEqual({ ok: false, error: ADMIN_LOGIN_ERROR })
    expect(p.signOut).toHaveBeenCalledTimes(1)
  })
  it('mauvais identifiants → même message, rôle jamais lu', async () => {
    const p = fake({ authOk: false })
    expect(await adminLogin(p, 'x@x.fr', 'bad')).toEqual({ ok: false, error: ADMIN_LOGIN_ERROR })
    expect(p.readRole).not.toHaveBeenCalled()
    expect(p.signOut).not.toHaveBeenCalled()
  })
  it('le message ne distingue pas « pas admin » de « mauvais mot de passe »', async () => {
    const a = await adminLogin(fake({ authOk: true, role: 'trader' }), 'e', 'p')
    const b = await adminLogin(fake({ authOk: false }), 'e', 'p')
    expect(a).toEqual(b)
    expect(ADMIN_LOGIN_ERROR).toBe('Identifiants invalides')
  })
})
