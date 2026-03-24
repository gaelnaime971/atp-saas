import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { jsPDF } from 'jspdf'
import { readFileSync } from 'fs'
import { join } from 'path'

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  virement: 'Virement bancaire',
  stripe_comptant: 'Carte bancaire',
  stripe_2x: 'Carte bancaire (2×)',
  stripe_3x: 'Carte bancaire (3×)',
  stripe_4x: 'Carte bancaire (4×)',
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function formatCurrency(amount: number): string {
  return amount.toFixed(2).replace('.', ',') + ' €'
}

function padInvoiceNumber(num: number): string {
  return String(num).padStart(4, '0')
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Parse body
    const body = await request.json()
    const { revenue_id } = body as { revenue_id: string }

    if (!revenue_id) {
      return NextResponse.json({ error: 'Missing revenue_id' }, { status: 400 })
    }

    // Admin client for DB operations
    const adminSupabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch revenue record
    const { data: revenue, error: revenueError } = await adminSupabase
      .from('revenues')
      .select('*')
      .eq('id', revenue_id)
      .single()

    if (revenueError || !revenue) {
      return NextResponse.json({ error: 'Revenue record not found' }, { status: 404 })
    }

    // Fetch trader profile
    const { data: trader, error: traderError } = await adminSupabase
      .from('profiles')
      .select('*')
      .eq('id', revenue.trader_id)
      .single()

    if (traderError || !trader) {
      return NextResponse.json({ error: 'Trader profile not found' }, { status: 404 })
    }

    // Get next invoice number
    const { data: seqResult, error: seqError } = await adminSupabase
      .rpc('nextval_text', { seq_name: 'invoice_number_seq' })

    let invoiceNumber: number

    if (seqError) {
      // Fallback: direct SQL via admin client
      const { data: sqlResult, error: sqlError } = await adminSupabase
        .from('revenues')
        .select('invoice_number')
        .not('invoice_number', 'is', null)
        .order('invoice_number', { ascending: false })
        .limit(1)
        .single()

      if (sqlError || !sqlResult) {
        // Use raw SQL
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/nextval_text`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
              'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
            },
            body: JSON.stringify({ seq_name: 'invoice_number_seq' }),
          }
        )

        if (!res.ok) {
          // Last resort: use postgrest raw query
          const rawRes = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/sql`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
                'Prefer': 'return=representation',
              },
              body: JSON.stringify({ query: "SELECT nextval('invoice_number_seq')" }),
            }
          )
          const rawData = await rawRes.json()
          invoiceNumber = parseInt(rawData?.[0]?.nextval || rawData?.nextval || '548')
        } else {
          const data = await res.json()
          invoiceNumber = parseInt(data)
        }
      } else {
        invoiceNumber = (sqlResult.invoice_number || 547) + 1
      }
    } else {
      invoiceNumber = parseInt(seqResult as string)
    }

    // Calculate amounts
    const amount = parseFloat(revenue.amount)
    let amountHT: number
    let tva: number
    let amountTTC: number

    if (revenue.is_ttc) {
      amountTTC = amount
      amountHT = Math.round((amount / 1.2) * 100) / 100
      tva = Math.round((amount - amountHT) * 100) / 100
    } else {
      amountHT = amount
      tva = Math.round((amount * 0.2) * 100) / 100
      amountTTC = Math.round((amount * 1.2) * 100) / 100
    }

    const invoiceDate = new Date(revenue.payment_date)
    const formattedDate = invoiceDate.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
    const invoiceLabel = `F-${padInvoiceNumber(invoiceNumber)}`

    // Load logo
    let logoBase64: string | null = null
    try {
      const logoPath = join(process.cwd(), 'public', 'logo-omega.png')
      const logoBuffer = readFileSync(logoPath)
      logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`
    } catch {
      // Logo not found, skip it
    }

    // Generate PDF
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageWidth = 210
    const margin = 20
    const contentWidth = pageWidth - margin * 2

    // === HEADER BAR ===
    const headerHeight = 36
    doc.setFillColor(26, 26, 46) // #1a1a2e
    doc.rect(0, 0, pageWidth, headerHeight, 'F')

    // Logo (340x85px → ratio 4:1, display as 40x10mm)
    if (logoBase64) {
      try {
        const logoW = 40
        const logoH = 10
        const logoY = (headerHeight - logoH) / 2
        doc.addImage(logoBase64, 'PNG', margin, logoY, logoW, logoH)
      } catch {
        // Skip logo if format issue
      }
    }

    // Invoice number & date (top right, white text)
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text(invoiceLabel, pageWidth - margin, 16, { align: 'right' })
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Date : ${formattedDate}`, pageWidth - margin, 24, { align: 'right' })

    // === COMPANY INFO ===
    let y = 55
    doc.setTextColor(26, 26, 46)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Omega Investment', margin, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    y += 6
    doc.text('316 route de Néron', margin, y)
    y += 5
    doc.text('97160 Le Moule, Guadeloupe', margin, y)
    y += 5
    doc.text('SIREN : 919495424', margin, y)

    // === CLIENT INFO ===
    const clientX = pageWidth - margin
    y = 55
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(34, 197, 94) // #22c55e
    doc.text('Facturé à :', clientX, y, { align: 'right' })
    doc.setTextColor(26, 26, 46)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    y += 6
    doc.text(trader.full_name || 'Client', clientX, y, { align: 'right' })
    y += 5
    doc.text(trader.email || '', clientX, y, { align: 'right' })

    // === GREEN SEPARATOR LINE ===
    y = 85
    doc.setDrawColor(34, 197, 94)
    doc.setLineWidth(0.8)
    doc.line(margin, y, pageWidth - margin, y)

    // === TABLE HEADER ===
    y = 95
    doc.setFillColor(26, 26, 46)
    doc.rect(margin, y - 5, contentWidth, 10, 'F')

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')

    const col1 = margin + 2
    const col2 = margin + 90
    const col3 = margin + 120
    const col4 = margin + 148

    doc.text('Description', col1, y + 1)
    doc.text('Montant HT', col2, y + 1)
    doc.text('TVA (20%)', col3, y + 1)
    doc.text('Montant TTC', col4, y + 1)

    // === TABLE ROW ===
    y += 12
    doc.setTextColor(50, 50, 50)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)

    const description = revenue.description || 'Prestation de coaching trading'

    // Wrap description if too long
    const descLines = doc.splitTextToSize(description, 80)
    doc.text(descLines, col1, y)
    doc.text(formatCurrency(amountHT), col2, y)
    doc.text(formatCurrency(tva), col3, y)
    doc.text(formatCurrency(amountTTC), col4, y)

    // Row separator
    const rowHeight = Math.max(descLines.length * 5, 8)
    y += rowHeight + 3
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.3)
    doc.line(margin, y, pageWidth - margin, y)

    // === TOTALS ===
    y += 10
    doc.setFillColor(245, 245, 245)
    doc.rect(col2 - 4, y - 5, contentWidth - (col2 - margin) + 4, 24, 'F')

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(80, 80, 80)

    doc.text('Total HT :', col2, y)
    doc.text(formatCurrency(amountHT), col4, y)

    y += 8
    doc.text('TVA (20%) :', col2, y)
    doc.text(formatCurrency(tva), col4, y)

    y += 8
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(26, 26, 46)
    doc.setFontSize(11)
    doc.text('Total TTC :', col2, y)
    doc.setTextColor(34, 197, 94)
    doc.text(formatCurrency(amountTTC), col4, y)

    // === PAYMENT METHOD ===
    y += 20
    doc.setTextColor(26, 26, 46)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Moyen de paiement :', margin, y)
    doc.setFont('helvetica', 'normal')
    const paymentLabel = PAYMENT_METHOD_LABELS[revenue.payment_method] || revenue.payment_method || 'Non spécifié'
    doc.text(paymentLabel, margin + 50, y)

    // === FOOTER ===
    const footerY = 280
    doc.setDrawColor(34, 197, 94)
    doc.setLineWidth(0.5)
    doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5)

    doc.setTextColor(120, 120, 120)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text('Omega Investment — SIREN 919495424', pageWidth / 2, footerY, { align: 'center' })

    // Generate PDF buffer
    const pdfArrayBuffer = doc.output('arraybuffer')
    const pdfBuffer = Buffer.from(pdfArrayBuffer)

    // File naming
    const traderSlug = slugify(trader.full_name || 'client')
    const dateSlug = invoiceDate.toISOString().split('T')[0]
    const fileName = `facture-${invoiceLabel}-${traderSlug}-${dateSlug}.pdf`

    // Upload to Supabase Storage
    const { error: uploadError } = await adminSupabase
      .storage
      .from('invoices')
      .upload(fileName, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload invoice PDF' }, { status: 500 })
    }

    const storagePath = fileName

    // Update revenue record
    const { error: updateError } = await adminSupabase
      .from('revenues')
      .update({
        invoice_number: invoiceNumber,
        invoice_url: storagePath,
        amount_ht: amountHT,
        tva_amount: tva,
      })
      .eq('id', revenue_id)

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json({ error: 'Failed to update revenue record' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      invoice_number: invoiceLabel,
      invoice_url: storagePath,
    })
  } catch (error) {
    console.error('Invoice generation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
