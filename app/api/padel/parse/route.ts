import { NextResponse } from 'next/server'

interface ParsedField {
  index: number
  entryId: string
  label: string
  type: number // 0=short text, 1=paragraph, 2=radio, 3=dropdown, 4=checkbox, 9=date, 10=time, 11=image, 12=video
  required: boolean
  options?: string[] | null // for radio/dropdown/checkbox
}

interface ParsedForm {
  formId: string
  title: string
  description?: string
  fields: ParsedField[]
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export async function POST(request: Request) {
  try {
    const { url } = (await request.json()) as { url?: string }
    if (!url) return NextResponse.json({ error: 'url requise' }, { status: 400 })

    // Normalize: accept /viewform, /edit, with or without query string
    const formIdMatch = url.match(/\/forms\/d\/e\/([a-zA-Z0-9_-]+)/) || url.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/)
    if (!formIdMatch) {
      return NextResponse.json({ error: 'URL de Google Form invalide' }, { status: 400 })
    }
    const formId = formIdMatch[1]
    const viewUrl = `https://docs.google.com/forms/d/e/${formId}/viewform`

    const res = await fetch(viewUrl, { headers: { 'User-Agent': UA } })
    if (!res.ok) {
      return NextResponse.json({ error: `Formulaire inaccessible (${res.status})` }, { status: 502 })
    }
    const html = await res.text()

    // FB_PUBLIC_LOAD_DATA_ contains the structured form definition
    const m = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]+?\]);[\s\S]*?<\/script>/)
    if (!m) return NextResponse.json({ error: 'Impossible de parser le formulaire' }, { status: 502 })

    let data: unknown
    try { data = JSON.parse(m[1]) } catch {
      return NextResponse.json({ error: 'Format inattendu' }, { status: 502 })
    }

    const root = data as unknown[]
    const meta = (root[1] as unknown[]) || []
    const title = String(meta[8] || '') || 'Formulaire'
    const description = String(meta[0] || '') || undefined
    const items = (meta[1] as unknown[]) || []

    const fields: ParsedField[] = []
    items.forEach((rawItem, idx) => {
      if (!Array.isArray(rawItem) || rawItem.length < 5) return
      const item = rawItem as unknown[]
      const label = String(item[1] || '')
      const ftype = Number(item[3] ?? -1)
      const answers = item[4] as unknown[]
      if (!Array.isArray(answers) || answers.length === 0) return
      const firstAnswer = answers[0] as unknown[]
      const entryId = firstAnswer?.[0]
      if (entryId == null) return
      const required = !!firstAnswer[2]

      // Options for multichoice/dropdown/checkbox
      let options: string[] | null = null
      if (ftype === 2 || ftype === 3 || ftype === 4) {
        const choices = firstAnswer[1] as unknown[]
        if (Array.isArray(choices)) {
          options = choices
            .map(c => Array.isArray(c) ? String(c[0] ?? '') : '')
            .filter(Boolean)
        }
      }

      fields.push({
        index: idx,
        entryId: String(entryId),
        label,
        type: ftype,
        required,
        options,
      })
    })

    const parsed: ParsedForm = { formId, title, description, fields }
    return NextResponse.json(parsed)
  } catch (err) {
    console.error('Padel parse error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
