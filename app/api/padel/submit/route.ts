import { NextResponse } from 'next/server'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

interface SubmitBody {
  formId: string
  values: Record<string, string> // entryId -> value
}

export async function POST(request: Request) {
  const t0 = Date.now()
  try {
    const { formId, values } = (await request.json()) as SubmitBody
    if (!formId || !values || Object.keys(values).length === 0) {
      return NextResponse.json({ error: 'formId et values requis' }, { status: 400 })
    }

    const submitUrl = `https://docs.google.com/forms/d/e/${formId}/formResponse`

    const body = new URLSearchParams()
    for (const [entryId, value] of Object.entries(values)) {
      body.append(`entry.${entryId}`, value)
    }
    body.append('fvv', '1')
    body.append('pageHistory', '0')
    body.append('fbzx', '0')

    const res = await fetch(submitUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': UA,
        Origin: 'https://docs.google.com',
        Referer: `https://docs.google.com/forms/d/e/${formId}/viewform`,
      },
      body: body.toString(),
      redirect: 'follow',
    })

    const elapsed = Date.now() - t0
    const finalUrl = res.url
    const ok = res.ok && /formResponse|closedform/i.test(finalUrl)
    // Successful submission redirects to formResponse (thank-you page) or closedform if locked

    return NextResponse.json({
      success: ok,
      status: res.status,
      finalUrl,
      elapsedMs: elapsed,
    })
  } catch (err) {
    console.error('Padel submit error:', err)
    return NextResponse.json({ error: 'Erreur serveur', elapsedMs: Date.now() - t0 }, { status: 500 })
  }
}
