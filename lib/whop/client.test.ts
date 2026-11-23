/**
 * Tests de `fetchEliteProAccess`, `hasActiveEliteProMembership` et
 * `listActiveEliteProMemberships`.
 *
 * fetch est mocké globalement — zéro requête réseau réelle. Les
 * variables d'env sont posées en beforeEach + reset en afterEach pour
 * ne pas fuiter d'un test à l'autre.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchEliteProAccess,
  hasActiveEliteProMembership,
  listActiveEliteProMemberships,
} from './client'

const WHOP_USER_ID = 'user_abc123'
const PRODUCT_ID = 'prod_ElitePro'
const COMPANY_ID = 'biz_Atp'
const API_KEY = 'apik_test'

function mockFetchResponse(body: unknown, init: {
  ok?: boolean
  status?: number
  headers?: Record<string, string>
} = {}): Response {
  const ok = init.ok ?? true
  const status = init.status ?? 200
  return {
    ok,
    status,
    headers: new Headers(init.headers ?? {}),
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response
}

function stubFetch(responses: Array<Response | Error>): ReturnType<typeof vi.fn> {
  const fn = vi.fn()
  for (const r of responses) {
    if (r instanceof Error) fn.mockRejectedValueOnce(r)
    else fn.mockResolvedValueOnce(r)
  }
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

beforeEach(() => {
  process.env.WHOP_API_KEY = API_KEY
  process.env.WHOP_PRODUCT_ID = PRODUCT_ID
  process.env.WHOP_COMPANY_ID = COMPANY_ID
  delete process.env.WHOP_API_VERSION_DATE
})
afterEach(() => {
  vi.restoreAllMocks()
})

// ─── fetchEliteProAccess ─────────────────────────────────────────────

describe('fetchEliteProAccess — compose correctement la requête', () => {
  it('tape /api/v1/memberships avec les bons filtres + header Bearer + Api-Version-Date', async () => {
    const fetchMock = stubFetch([mockFetchResponse({ data: [], page_info: { has_next_page: false } })])
    await fetchEliteProAccess(WHOP_USER_ID)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('https://api.whop.com/api/v1/memberships')
    expect(url).toContain(`user_id=${WHOP_USER_ID}`)
    expect(url).toContain(`company_id=${COMPANY_ID}`)
    expect(url).toContain(encodeURIComponent(PRODUCT_ID))
    for (const s of ['active', 'trialing', 'completed', 'canceling', 'past_due']) {
      expect(url).toContain(`statuses%5B%5D=${s}`)
    }
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe(`Bearer ${API_KEY}`)
    expect(headers['Api-Version-Date']).toBeTruthy()
  })

  it('respecte WHOP_API_VERSION_DATE si posé', async () => {
    process.env.WHOP_API_VERSION_DATE = '2026-10-15'
    const fetchMock = stubFetch([mockFetchResponse({ data: [], page_info: { has_next_page: false } })])
    await fetchEliteProAccess(WHOP_USER_ID)
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers['Api-Version-Date']).toBe('2026-10-15')
  })
})

describe('fetchEliteProAccess — accès accordé (product.id ÉLITE PRO + status ∈ ACTIVE_STATUSES)', () => {
  it('status="active" → granted (reason=status)', async () => {
    stubFetch([mockFetchResponse({
      data: [{
        id: 'mem_1', status: 'active',
        product: { id: PRODUCT_ID }, user: { id: WHOP_USER_ID },
        member: { access_level: 'customer' },
      }],
      page_info: { has_next_page: false },
    })])
    const r = await fetchEliteProAccess(WHOP_USER_ID)
    expect(r.granted).toBe(true)
    expect(r.memberships[0].reasonValid).toBe('status')
    expect(r.pagesChecked).toBe(1)
  })

  it('status="trialing" (member.access_level=no_access n\'empêche rien) → granted', async () => {
    stubFetch([mockFetchResponse({
      data: [{
        id: 'mem_2', status: 'trialing',
        product: { id: PRODUCT_ID }, user: { id: WHOP_USER_ID },
        member: { access_level: 'no_access' },
      }],
      page_info: { has_next_page: false },
    })])
    const r = await fetchEliteProAccess(WHOP_USER_ID)
    expect(r.granted).toBe(true)
    expect(r.memberships[0].reasonValid).toBe('status')
  })

  it('status="past_due" acceptée (grâce)', async () => {
    stubFetch([mockFetchResponse({
      data: [{
        id: 'mem_3', status: 'past_due',
        product: { id: PRODUCT_ID }, user: { id: WHOP_USER_ID },
      }],
      page_info: { has_next_page: false },
    })])
    expect(await hasActiveEliteProMembership(WHOP_USER_ID)).toBe(true)
  })

  it('status="completed" + status="canceling" acceptés', async () => {
    stubFetch([mockFetchResponse({
      data: [{
        id: 'mem_completed', status: 'completed',
        product: { id: PRODUCT_ID }, user: { id: WHOP_USER_ID },
      }],
      page_info: { has_next_page: false },
    })])
    expect(await hasActiveEliteProMembership(WHOP_USER_ID)).toBe(true)

    stubFetch([mockFetchResponse({
      data: [{
        id: 'mem_canceling', status: 'canceling',
        product: { id: PRODUCT_ID }, user: { id: WHOP_USER_ID },
      }],
      page_info: { has_next_page: false },
    })])
    expect(await hasActiveEliteProMembership(WHOP_USER_ID)).toBe(true)
  })
})

describe('fetchEliteProAccess — accès refusé', () => {
  it('status="canceled" → NOT granted', async () => {
    stubFetch([mockFetchResponse({
      data: [{
        id: 'mem_5', status: 'canceled',
        product: { id: PRODUCT_ID }, user: { id: WHOP_USER_ID },
        member: { access_level: 'no_access' },
      }],
      page_info: { has_next_page: false },
    })])
    const r = await fetchEliteProAccess(WHOP_USER_ID)
    expect(r.granted).toBe(false)
    expect(r.memberships[0].reasonValid).toBeNull()
  })

  it('status="expired" → NOT granted', async () => {
    stubFetch([mockFetchResponse({
      data: [{
        id: 'mem_6', status: 'expired',
        product: { id: PRODUCT_ID }, user: { id: WHOP_USER_ID },
      }],
      page_info: { has_next_page: false },
    })])
    expect(await hasActiveEliteProMembership(WHOP_USER_ID)).toBe(false)
  })

  it('aucune membership du tout → NOT granted', async () => {
    stubFetch([mockFetchResponse({ data: [], page_info: { has_next_page: false } })])
    expect(await hasActiveEliteProMembership(WHOP_USER_ID)).toBe(false)
  })

  it('membership d\'un AUTRE produit → NOT granted (défense en profondeur)', async () => {
    stubFetch([mockFetchResponse({
      data: [{
        id: 'mem_other', status: 'active',
        product: { id: 'prod_OTHER' }, user: { id: WHOP_USER_ID },
        member: { access_level: 'customer' },
      }],
      page_info: { has_next_page: false },
    })])
    expect(await hasActiveEliteProMembership(WHOP_USER_ID)).toBe(false)
  })

  // ─── CAS CRITIQUE — défense en profondeur sur member.access_level ─────
  //
  // member.access_level est GLOBAL au membre (toutes offres du marchand).
  // Un ÉLITE PRO expiré ET un abonnement Discord actif → access_level=customer
  // alors que l'ÉLITE PRO est bel et bien expiré. Historiquement, la fonction
  // l'aurait accepté (reason='access_level'). Depuis le durcissement, status
  // est la SEULE source de vérité → refus.
  it('ÉLITE PRO expiré + member.access_level=customer (autre offre active) → REFUS', async () => {
    stubFetch([mockFetchResponse({
      data: [{
        id: 'mem_expired_but_customer',
        status: 'expired',
        product: { id: PRODUCT_ID },
        user: { id: WHOP_USER_ID },
        member: { access_level: 'customer' }, // ← piège
      }],
      page_info: { has_next_page: false },
    })])
    const r = await fetchEliteProAccess(WHOP_USER_ID)
    expect(r.granted).toBe(false)
    expect(r.memberships[0].reasonValid).toBeNull()
    expect(r.memberships[0].memberAccessLevel).toBe('customer')
    expect(r.memberships[0].status).toBe('expired')
  })

  it('ÉLITE PRO canceled + member.access_level=admin (team member autre produit) → REFUS', async () => {
    stubFetch([mockFetchResponse({
      data: [{
        id: 'mem_canceled_but_admin',
        status: 'canceled',
        product: { id: PRODUCT_ID },
        user: { id: WHOP_USER_ID },
        member: { access_level: 'admin' },
      }],
      page_info: { has_next_page: false },
    })])
    expect(await hasActiveEliteProMembership(WHOP_USER_ID)).toBe(false)
  })
})

describe('fetchEliteProAccess — pagination curseur', () => {
  it('plusieurs pages : parcourt jusqu\'à la valide, early-return', async () => {
    stubFetch([
      mockFetchResponse({
        data: [{
          id: 'mem_page1_canceled', status: 'canceled',
          product: { id: PRODUCT_ID }, user: { id: WHOP_USER_ID },
        }],
        page_info: { has_next_page: true, end_cursor: 'cursor_p2' },
      }),
      mockFetchResponse({
        data: [{
          id: 'mem_page2_active', status: 'active',
          product: { id: PRODUCT_ID }, user: { id: WHOP_USER_ID },
        }],
        page_info: { has_next_page: true, end_cursor: 'cursor_p3' },
      }),
    ])
    const r = await fetchEliteProAccess(WHOP_USER_ID)
    expect(r.granted).toBe(true)
    expect(r.pagesChecked).toBe(2)
    // 3e page JAMAIS appelée (early-return après la valide en page 2)
  })

  it('page_info sans end_cursor → arrêt propre', async () => {
    stubFetch([
      mockFetchResponse({ data: [], page_info: { has_next_page: true, end_cursor: null } }),
    ])
    const r = await fetchEliteProAccess(WHOP_USER_ID)
    expect(r.granted).toBe(false)
    expect(r.pagesChecked).toBe(1)
  })
})

describe('fetchEliteProAccess — fail-closed', () => {
  it('HTTP 403 → granted=false + errorMessage mentionne les permissions', async () => {
    stubFetch([mockFetchResponse({ error: 'forbidden' }, { ok: false, status: 403 })])
    const r = await fetchEliteProAccess(WHOP_USER_ID)
    expect(r.granted).toBe(false)
    expect(r.errorStatus).toBe(403)
    expect(r.errorMessage).toContain('permissions')
    expect(r.errorMessage).toContain('member:basic:read')
  })

  it('HTTP 401 → granted=false + errorMessage mentionne la clé refusée', async () => {
    stubFetch([mockFetchResponse({ error: 'unauthorized' }, { ok: false, status: 401 })])
    const r = await fetchEliteProAccess(WHOP_USER_ID)
    expect(r.granted).toBe(false)
    expect(r.errorStatus).toBe(401)
    expect(r.errorMessage).toContain('clé')
  })

  it('HTTP 500 → granted=false, errorStatus propagé', async () => {
    stubFetch([mockFetchResponse('internal', { ok: false, status: 500 })])
    const r = await fetchEliteProAccess(WHOP_USER_ID)
    expect(r.granted).toBe(false)
    expect(r.errorStatus).toBe(500)
  })

  it('erreur réseau → granted=false + errorStatus=0', async () => {
    stubFetch([new Error('ECONNRESET')])
    const r = await fetchEliteProAccess(WHOP_USER_ID)
    expect(r.granted).toBe(false)
    expect(r.errorStatus).toBe(0)
    expect(r.errorMessage).toContain('ECONNRESET')
  })

  it('JSON invalide → granted=false, errorMessage="JSON parse failed"', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      headers: new Headers(),
      json: async () => { throw new Error('invalid json') },
    }) as unknown as typeof fetch
    const r = await fetchEliteProAccess(WHOP_USER_ID)
    expect(r.granted).toBe(false)
    expect(r.errorMessage).toBe('JSON parse failed')
  })

  it('env manquante (WHOP_COMPANY_ID) → granted=false, pas d\'appel réseau', async () => {
    delete process.env.WHOP_COMPANY_ID
    const fetchMock = stubFetch([mockFetchResponse({ data: [] })])
    const r = await fetchEliteProAccess(WHOP_USER_ID)
    expect(r.granted).toBe(false)
    expect(r.errorMessage).toContain('WHOP_COMPANY_ID')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('fetchEliteProAccess — observabilité', () => {
  it('header Deprecation capturé', async () => {
    stubFetch([mockFetchResponse(
      { data: [], page_info: { has_next_page: false } },
      { headers: { deprecation: 'true' } },
    )])
    const r = await fetchEliteProAccess(WHOP_USER_ID)
    expect(r.deprecationHeader).toBe('true')
  })
})

// ─── listActiveEliteProMemberships ───────────────────────────────────

describe('listActiveEliteProMemberships', () => {
  it('ne pose PAS user_id, parcourt plusieurs pages via curseur', async () => {
    const fetchMock = stubFetch([
      mockFetchResponse({
        data: [
          { id: 'mem_a', status: 'active', product: { id: PRODUCT_ID }, user: { id: 'user_a', email: 'a@x.com' } },
          { id: 'mem_b', status: 'trialing', product: { id: PRODUCT_ID }, user: { id: 'user_b', email: 'b@x.com' } },
        ],
        page_info: { has_next_page: true, end_cursor: 'c2' },
      }),
      mockFetchResponse({
        data: [
          { id: 'mem_c', status: 'past_due', product: { id: PRODUCT_ID }, user: { id: 'user_c', email: 'c@x.com' } },
        ],
        page_info: { has_next_page: false },
      }),
    ])
    const r = await listActiveEliteProMemberships()
    expect(r.memberships).toHaveLength(3)
    expect(r.pagesChecked).toBe(2)
    expect(r.truncated).toBe(false)
    expect(fetchMock.mock.calls[0][0]).not.toContain('user_id=')
    expect(fetchMock.mock.calls[1][0]).toContain('after=c2')
  })

  it('exclut une membership d\'un autre produit (défense en profondeur) même si Whop la renvoie', async () => {
    stubFetch([mockFetchResponse({
      data: [
        { id: 'mem_ok', status: 'active', product: { id: PRODUCT_ID }, user: { id: 'u1', email: 'ok@x.com' } },
        { id: 'mem_bad', status: 'active', product: { id: 'prod_OTHER' }, user: { id: 'u2', email: 'bad@x.com' } },
      ],
      page_info: { has_next_page: false },
    })])
    const r = await listActiveEliteProMemberships()
    expect(r.memberships).toHaveLength(1)
    expect(r.memberships[0].membershipId).toBe('mem_ok')
  })

  it('exclut une membership au status non-actif (défense en profondeur)', async () => {
    stubFetch([mockFetchResponse({
      data: [
        { id: 'mem_ok', status: 'active', product: { id: PRODUCT_ID }, user: { id: 'u1' } },
        { id: 'mem_exp', status: 'expired', product: { id: PRODUCT_ID }, user: { id: 'u2' } },
      ],
      page_info: { has_next_page: false },
    })])
    const r = await listActiveEliteProMemberships()
    expect(r.memberships).toHaveLength(1)
    expect(r.memberships[0].membershipId).toBe('mem_ok')
  })

  it('truncated=true quand on atteint le plafond maxPages', async () => {
    stubFetch([
      mockFetchResponse({
        data: [{ id: 'mem_1', status: 'active', product: { id: PRODUCT_ID }, user: { id: 'u1' } }],
        page_info: { has_next_page: true, end_cursor: 'c2' },
      }),
    ])
    const r = await listActiveEliteProMemberships({ maxPages: 1 })
    expect(r.pagesChecked).toBe(1)
    expect(r.truncated).toBe(true)
  })

  it('HTTP 403 → fail-closed avec errorStatus + errorMessage', async () => {
    stubFetch([mockFetchResponse({}, { ok: false, status: 403 })])
    const r = await listActiveEliteProMemberships()
    expect(r.memberships).toEqual([])
    expect(r.errorStatus).toBe(403)
    expect(r.errorMessage).toContain('permissions')
  })

  it('env manquante → errorMessage, pas d\'appel réseau', async () => {
    delete process.env.WHOP_COMPANY_ID
    const fetchMock = stubFetch([mockFetchResponse({ data: [] })])
    const r = await listActiveEliteProMemberships()
    expect(r.errorMessage).toContain('WHOP_COMPANY_ID')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
