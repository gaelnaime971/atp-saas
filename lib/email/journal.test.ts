import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { recordEmailSend } from '@/lib/email/journal'

let errSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => { errSpy = vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => vi.restoreAllMocks())

describe('recordEmailSend', () => {
  it('écriture OK → true, aucun log', async () => {
    expect(await recordEmailSend('r', 'welcome', async () => ({ error: null }))).toBe(true)
    expect(errSpy).not.toHaveBeenCalled()
  })
  it('écriture refusée (contrainte) → false, erreur loggée avec route, mode et code', async () => {
    const ok = await recordEmailSend('send-welcome-email', 'welcome', async () => ({
      error: { code: '23514', message: 'new row violates check constraint "email_broadcasts_recipient_mode_check"' },
    }))
    expect(ok).toBe(false)
    expect(errSpy).toHaveBeenCalledTimes(1)
    const [msg, detail] = errSpy.mock.calls[0]
    expect(String(msg)).toContain('send-welcome-email')
    expect(String(msg)).toContain('welcome')
    expect(detail).toEqual({ code: '23514', message: expect.stringContaining('check constraint') })
  })
  it('exception (réseau) → false, loggée, ne remonte jamais', async () => {
    const ok = await recordEmailSend('email-broadcast', 'source', () => Promise.reject(new Error('fetch failed')))
    expect(ok).toBe(false)
    expect(errSpy).toHaveBeenCalledTimes(1)
    expect(errSpy.mock.calls[0][1]).toEqual({ message: 'fetch failed' })
  })
})

describe('migration email_broadcasts', () => {
  const root = path.resolve(__dirname, '../..')
  const migration = readFileSync(path.join(root, 'supabase/migrations/20261126000001_email_broadcasts_modes.sql'), 'utf8')

  it('autorise tous les modes écrits par les routes', () => {
    const dir = path.join(root, 'app/api/prospects')
    const modes = new Set<string>()
    for (const sub of readdirSync(dir)) {
      let src = ''
      try { src = readFileSync(path.join(dir, sub, 'route.ts'), 'utf8') } catch { continue }
      for (const m of src.matchAll(/recipient_mode:\s*([^,\n]+)/g)) {
        for (const lit of m[1].matchAll(/'([a-z_]+)'/g)) modes.add(lit[1])
      }
    }
    expect([...modes].sort()).toEqual(['closing', 'manual', 'payment_reminder', 'test', 'welcome'])
    for (const mode of [...modes, 'source']) expect(migration).toContain(`'${mode}'`)
  })
  it('remplace la contrainte existante dans une transaction', () => {
    expect(migration).toMatch(/DROP CONSTRAINT IF EXISTS email_broadcasts_recipient_mode_check/)
    expect(migration).toMatch(/BEGIN;[\s\S]*COMMIT;/)
  })
})
