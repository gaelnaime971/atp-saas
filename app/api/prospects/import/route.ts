import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function POST(request: Request) {
  try {
    const { prospects, source } = await request.json()

    if (!Array.isArray(prospects) || prospects.length === 0) {
      return NextResponse.json({ error: 'Aucun prospect à importer' }, { status: 400 })
    }

    if (prospects.length > 500) {
      return NextResponse.json({ error: 'Maximum 500 contacts par import' }, { status: 400 })
    }

    // Fetch existing emails for dedup
    const { data: existing } = await supabase.from('prospects').select('email')
    const existingEmails = new Set((existing || []).map((p: { email: string }) => p.email.toLowerCase().trim()))

    let imported = 0
    let duplicates = 0
    let errors = 0
    const batch: Array<{
      prenom: string
      nom: string
      email: string
      whatsapp: string
      experience: string
      objectif: string
      source: string
      status: string
      action: string
      notes: string
    }> = []

    for (const p of prospects) {
      const email = (p.email || '').toLowerCase().trim()

      // Validate email
      if (!email || !isValidEmail(email)) {
        errors++
        continue
      }

      // Check duplicate
      if (existingEmails.has(email)) {
        duplicates++
        continue
      }

      // Mark as seen to avoid intra-batch duplicates
      existingEmails.add(email)

      const prenom = (p.prenom || '').trim()
      const nom = (p.nom || '').trim()

      if (!prenom && !nom) {
        errors++
        continue
      }

      const today = new Date().toLocaleDateString('fr-FR')
      const baseNote = `Import CSV le ${today}`
      batch.push({
        prenom: prenom || nom,
        nom: nom || prenom,
        email,
        whatsapp: (p.whatsapp || '').trim(),
        experience: (p.experience || '').trim(),
        objectif: (p.objectif || '').trim(),
        source: p.source || source || 'csv-import',
        status: 'nouveau',
        action: 'rien_fait',
        notes: p.notes ? `${baseNote} · ${p.notes}` : baseNote,
      })
    }

    // Insert in chunks of 50
    for (let i = 0; i < batch.length; i += 50) {
      const chunk = batch.slice(i, i + 50)
      const { error } = await supabase.from('prospects').insert(chunk)
      if (error) {
        console.error('Batch insert error:', error)
        errors += chunk.length
        imported -= chunk.length
      }
    }
    imported = batch.length

    return NextResponse.json({
      success: true,
      imported,
      duplicates,
      errors,
      total: prospects.length,
    })
  } catch (err) {
    console.error('Import error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
