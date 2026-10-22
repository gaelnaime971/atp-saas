/**
 * Tests de `fetchEliteProAccessNew` et `hasActiveEliteProMembershipNew`.
 *
 * fetch est mocké globalement — zéro requête réseau réelle. Les
 * variables d'env sont posées en beforeEach + reset en afterEach pour
 * ne pas fuiter d'un test à l'autre.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchEliteProAccessNew, hasActiveEliteProMembershipNew } from './client'

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

describe('fetchEliteProAccessNew — compose correctement la requête', () => {
  it('tape /api/v1/memberships avec les bons filtres + header Bearer + Api-Version-Date', async () => {
    const fetchMock = stubFetch([mockFetchResponse({ data: [], page_info: { has_next_page: false } })])
    await fetchEliteProAccessNew(WHOP_USER_ID)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('https://api.whop.com/api/v1/memberships')
    expect(url).toContain(`user_id=${WHOP_USER_ID}`)
    expect(url).toContain(`company_id=${COMPANY_ID}`)
    expect(url).toContain(encodeURIComponent(PRODUCT_ID))
    // Les 5 statuts actifs doivent apparaître
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
    await fetchEliteProAccessNew(WHOP_USER_ID)
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers['Api-Version-Date']).toBe('2026-10-15')
  })
})

describe('fetchEliteProAccessNew — accès accordé', () => {
  it('membership "active" avec member.access_level=customer → granted (reason=access_level)', async () => {
    stubFetch([mockFetchResponse({
      data: [{
        id: 'mem_1', status: 'active',
        product: { id: PRODUCT_ID }, user: { id: WHOP_USER_ID },
        member: { access_level: 'customer' },
      }],
      page_info: { has_next_page: false },
    })])
    const r = await fetchEliteProAccessNew(WHOP_USER_ID)
    expect(r.granted).toBe(true)
    expect(r.memberships[0].reasonValid).toBe('access_level')
    expect(r.pagesChecked).toBe(1)
  })

  it('membership "trialing" sans access_level → granted (reason=status)', async () => {
    stubFetch([mockFetchResponse({
      data: [{
        id: 'mem_2', status: 'trialing',
        product: { id: PRODUCT_ID }, user: { id: WHOP_USER_ID },
        member: { access_level: 'no_access' },
      }],
      page_info: { has_next_page: false },
    })])
    const r = await fetchEliteProAccessNew(WHOP_USER_ID)
    expect(r.granted).toBe(true)
    expect(r.memberships[0].reasonValid).toBe('status')
  })

  it('membership "past_due" acceptée (grâce)', async () => {
    stubFetch([mockFetchResponse({
      data: [{
        id: 'mem_3', status: 'past_due',
        product: { id: PRODUCT_ID }, user: { id: WHOP_USER_ID },
        member: { access_level: 'customer' },
      }],
      page_info: { has_next_page: false },
    })])
    expect(await hasActiveEliteProMembershipNew(WHOP_USER_ID)).toBe(true)
  })

  it('membership "admin" team member → granted', async () => {
    stubFetch([mockFetchResponse({
      data: [{
        id: 'mem_4', status: 'active',
        product: { id: PRODUCT_ID }, user: { id: WHOP_USER_ID },
        member: { access_level: 'admin' },
      }],
      page_info: { has_next_page: false },
    })])
    expect(await hasActiveEliteProMembershipNew(WHOP_USER_ID)).toBe(true)
  })
})

describe('fetchEliteProAccessNew — accès refusé', () => {
  it('membership "canceled" → NOT granted', async () => {
    stubFetch([mockFetchResponse({
      data: [{
        id: 'mem_5', status: 'canceled',
        product: { id: PRODUCT_ID }, user: { id: WHOP_USER_ID },
        member: { access_level: 'no_access' },
      }],
      page_info: { has_next_page: false },
    })])
    const r = await fetchEliteProAccessNew(WHOP_USER_ID)
    expect(r.granted).toBe(false)
    expect(r.memberships[0].reasonValid).toBeNull()
  })

  it('membership "expired" → NOT granted', async () => {
    stubFetch([mockFetchResponse({
      data: [{
        id: 'mem_6', status: 'expired',
        product: { id: PRODUCT_ID }, user: { id: WHOP_USER_ID },
      }],
      page_info: { has_next_page: false },
    })])
    expect(await hasActiveEliteProMembershipNew(WHOP_USER_ID)).toBe(false)
  })

  it('aucune membership du tout → NOT granted', async () => {
    stubFetch([mockFetchResponse({ data: [], page_info: { has_next_page: false } })])
    expect(await hasActiveEliteProMembershipNew(WHOP_USER_ID)).toBe(false)
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
    expect(await hasActiveEliteProMembershipNew(WHOP_USER_ID)).toBe(false)
  })
})

describe('fetchEliteProAccessNew — pagination curseur', () => {
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
          member: { access_level: 'customer' },
        }],
        page_info: { has_next_page: true, end_cursor: 'cursor_p3' },
      }),
    ])
    const r = await fetchEliteProAccessNew(WHOP_USER_ID)
    expect(r.granted).toBe(true)
    expect(r.pagesChecked).toBe(2)
    // 3e page JAMAIS appelée (early-return après la valide en page 2)
  })

  it('page_info sans end_cursor → arrêt propre', async () => {
    stubFetch([
      mockFetchResponse({ data: [], page_info: { has_next_page: true, end_cursor: null } }),
    ])
    const r = await fetchEliteProAccessNew(WHOP_USER_ID)
    expect(r.granted).toBe(false)
    expect(r.pagesChecked).toBe(1)
  })
})

describe('fetchEliteProAccessNew — fail-closed', () => {
  it('HTTP 403 → granted=false + errorMessage mentionne les permissions', async () => {
    stubFetch([mockFetchResponse({ error: 'forbidden' }, { ok: false, status: 403 })])
    const r = await fetchEliteProAccessNew(WHOP_USER_ID)
    expect(r.granted).toBe(false)
    expect(r.errorStatus).toBe(403)
    expect(r.errorMessage).toContain('permissions')
    expect(r.errorMessage).toContain('member:basic:read')
  })

  it('HTTP 401 → granted=false + errorMessage mentionne la clé refusée', async () => {
    stubFetch([mockFetchResponse({ error: 'unauthorized' }, { ok: false, status: 401 })])
    const r = await fetchEliteProAccessNew(WHOP_USER_ID)
    expect(r.granted).toBe(false)
    expect(r.errorStatus).toBe(401)
    expect(r.errorMessage).toContain('clé')
  })

  it('HTTP 500 → granted=false, errorStatus propagé', async () => {
    stubFetch([mockFetchResponse('internal', { ok: false, status: 500 })])
    const r = await fetchEliteProAccessNew(WHOP_USER_ID)
    expect(r.granted).toBe(false)
    expect(r.errorStatus).toBe(500)
  })

  it('erreur réseau → granted=false + errorStatus=0', async () => {
    stubFetch([new Error('ECONNRESET')])
    const r = await fetchEliteProAccessNew(WHOP_USER_ID)
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
    const r = await fetchEliteProAccessNew(WHOP_USER_ID)
    expect(r.granted).toBe(false)
    expect(r.errorMessage).toBe('JSON parse failed')
  })

  it('env manquante (WHOP_COMPANY_ID) → granted=false, pas d\'appel réseau', async () => {
    delete process.env.WHOP_COMPANY_ID
    const fetchMock = stubFetch([mockFetchResponse({ data: [] })])
    const r = await fetchEliteProAccessNew(WHOP_USER_ID)
    expect(r.granted).toBe(false)
    expect(r.errorMessage).toContain('WHOP_COMPANY_ID')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('fetchEliteProAccessNew — observabilité', () => {
  it('header Deprecation capturé', async () => {
    stubFetch([mockFetchResponse(
      { data: [], page_info: { has_next_page: false } },
      { headers: { deprecation: 'true' } },
    )])
    const r = await fetchEliteProAccessNew(WHOP_USER_ID)
    expect(r.deprecationHeader).toBe('true')
  })
})
