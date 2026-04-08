import jsPDF from 'jspdf'

const ARTICLES = [
  { num: 1, title: 'OBJET', content: "Le présent contrat établit les conditions du programme de coaching individuel Alpha Trading Pro entre Gaël Naime, représentant légal d'Omega Investment (SIREN : 919 495 424), ci-après \"le Coach\", et le trader soussigné, ci-après \"le Coaché\". L'objectif est d'accompagner le Coaché vers une pratique du trading rentable, disciplinée et autonome, selon la méthodologie ATP." },
  { num: 2, title: 'CONTENU DU PROGRAMME', content: "Le programme ATP ULTRA comprend : des sessions de coaching individuelles en visioconférence avec Gaël Naime ; un suivi personnalisé par WhatsApp entre les sessions ; un accès au SaaS Alpha Trading Pro (dashboard, journal, cockpit, calculateur de risque) pour une durée de 12 mois ; un accès au Discord ATP Élite Pro (lives quotidiens, replays, analyses) pour une durée de 12 mois ; un accès à la bibliothèque de formations vidéo en replay illimité ; un accompagnement psychologique appliqué au trading animé par Vanille, coach certifiée en neurosciences." },
  { num: 3, title: 'DURÉE', content: "Le programme ATP ULTRA ne fixe pas de durée minimale d'engagement. L'accompagnement se poursuit jusqu'à l'atteinte d'un niveau d'autonomie satisfaisant, défini conjointement par les deux parties. Les quatre phases du programme sont : Diagnostic, Transmission, Live trading et Autonomie." },
  { num: 4, title: 'TARIFS ET PAIEMENT', content: "Le montant de l'investissement est défini lors du call de présélection et formalisé dans l'annexe tarifaire. Le paiement peut s'effectuer en une fois ou de manière échelonnée selon un calendrier convenu. Tout paiement est définitivement acquis. En cas de paiement échelonné, le non-respect d'une échéance entraîne la suspension immédiate de l'accès aux outils dans un délai de 7 jours, jusqu'à régularisation." },
  { num: 5, title: 'ENGAGEMENTS DU COACHÉ', content: "Le Coaché s'engage à : tenir son journal de trading de manière régulière et honnête ; saisir ses sessions dans le dashboard ATP ; respecter le plan de trading et les règles définies conjointement (gestion du risque, règle des 3 SL consécutifs) ; assister aux sessions de coaching planifiées ; maintenir une communication transparente sur ses résultats et ses difficultés ; s'acquitter des paiements aux échéances convenues." },
  { num: 6, title: 'ENGAGEMENTS DU COACH', content: "Gaël Naime s'engage à : fournir un accompagnement personnalisé et de qualité adapté au profil du Coaché ; préparer chaque session de coaching ; être disponible par WhatsApp pour les questions urgentes entre les sessions ; assurer la disponibilité des outils digitaux et signaler toute interruption technique ; respecter la confidentialité des informations personnelles et financières du Coaché." },
  { num: 7, title: 'DROIT DE RÉTRACTATION', content: "Conformément à l'article L.221-18 du Code de la consommation, le Coaché dispose d'un délai de 14 jours calendaires à compter de la signature du présent contrat pour exercer son droit de rétractation, sans justification ni pénalité. La rétractation doit être notifiée par écrit à contact@alphatradingpro.fr. Passé ce délai, aucun remboursement ne peut être accordé pour les services déjà fournis." },
  { num: 8, title: 'CONFIDENTIALITÉ ET PROPRIÉTÉ INTELLECTUELLE', content: "Les performances, résultats et contenus partagés dans le cadre du coaching sont strictement confidentiels. Aucune information ne sera divulguée à des tiers sans accord écrit préalable. L'ensemble des contenus du programme (méthode, vidéos, supports, outils SaaS) sont la propriété exclusive d'Omega Investment. Le Coaché s'interdit de reproduire, diffuser, revendre ou enseigner ces contenus à des tiers. Toute violation expose le Coaché à des poursuites judiciaires et à la résiliation immédiate du contrat sans remboursement." },
  { num: 9, title: 'ABSENCE DE GARANTIE DE RÉSULTATS', content: "Omega Investment et Gaël Naime ne garantissent aucun résultat financier spécifique. Le trading sur les marchés financiers comporte des risques importants de perte en capital. Les performances passées présentées à titre illustratif ne préjugent pas des résultats futurs. Le Coaché reconnaît avoir été informé de ces risques avant la signature du présent contrat." },
  { num: 10, title: 'RÉSILIATION', content: "Le contrat peut être résilié par accord mutuel écrit avec un préavis de 15 jours ; par le Coach en cas de manquement grave du Coaché (non-paiement persistant, violation de la propriété intellectuelle) avec effet immédiat par notification écrite ; par le Coaché dans le cadre du droit de rétractation légal. En dehors du délai légal, les sommes versées restent acquises au titre des services déjà fournis." },
  { num: 11, title: 'LOI APPLICABLE', content: "Le présent contrat est soumis au droit français. En cas de litige, les parties s'engagent à rechercher une solution amiable dans un délai de 30 jours. À défaut, tout litige sera soumis aux juridictions compétentes du ressort du domicile du Prestataire. Le Coaché peut également recourir à la médiation de la consommation (DGCCRF)." },
]

export function generateContractPdf(signedName: string, signedDate: string): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 20
  const contentW = pageW - margin * 2
  let y = 20

  const addPage = () => { doc.addPage(); y = 20 }
  const checkSpace = (needed: number) => { if (y + needed > 270) addPage() }

  // Header
  doc.setFillColor(9, 9, 11)
  doc.rect(0, 0, pageW, 40, 'F')
  doc.setTextColor(34, 197, 94)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('ALPHA TRADING PRO', pageW / 2, 18, { align: 'center' })
  doc.setFontSize(10)
  doc.setTextColor(150, 150, 150)
  doc.text('CONTRAT DE COACHING — ATP ULTRA', pageW / 2, 28, { align: 'center' })
  doc.setFontSize(8)
  doc.text('Omega Investment — SIREN : 919 495 424', pageW / 2, 34, { align: 'center' })

  y = 50

  // Parties
  doc.setTextColor(60, 60, 60)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Entre : Gaël Naime, représentant légal d'Omega Investment ("le Coach")`, margin, y)
  y += 6
  doc.text(`Et : ${signedName} ("le Coaché")`, margin, y)
  y += 6
  doc.text(`Date de signature : ${new Date(signedDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`, margin, y)
  y += 12

  // Line
  doc.setDrawColor(34, 197, 94)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageW - margin, y)
  y += 10

  // Articles
  ARTICLES.forEach(art => {
    checkSpace(30)

    // Title
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(34, 197, 94)
    doc.text(`ART. ${art.num} — ${art.title}`, margin, y)
    y += 7

    // Content
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(50, 50, 50)
    const lines = doc.splitTextToSize(art.content, contentW)
    lines.forEach((line: string) => {
      checkSpace(5)
      doc.text(line, margin, y)
      y += 4.5
    })
    y += 6
  })

  // Signature section
  checkSpace(50)
  y += 5
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageW - margin, y)
  y += 12

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(30, 30, 30)
  doc.text('SIGNATURE DU COACHÉ', margin, y)
  y += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(60, 60, 60)
  doc.text(`Nom : ${signedName}`, margin, y)
  y += 6
  doc.text(`Date : ${new Date(signedDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`, margin, y)
  y += 6
  doc.text('Mention : "Lu et approuvé"', margin, y)
  y += 14

  // Signature box
  doc.setDrawColor(34, 197, 94)
  doc.setLineWidth(0.4)
  doc.roundedRect(margin, y, 70, 20, 2, 2)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bolditalic')
  doc.setTextColor(34, 197, 94)
  doc.text(signedName, margin + 8, y + 13)

  // Footer
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(150, 150, 150)
    doc.text(`Alpha Trading Pro — Contrat ATP ULTRA — Page ${i}/${totalPages}`, pageW / 2, 290, { align: 'center' })
  }

  return doc
}

export function downloadContractPdf(signedName: string, signedDate: string) {
  const doc = generateContractPdf(signedName, signedDate)
  doc.save(`Contrat_ATP_${signedName.replace(/\s+/g, '_')}.pdf`)
}
