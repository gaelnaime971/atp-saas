import { describe, it, expect } from 'vitest'
import { stripAnnouncement, buildAntiRepetitionAddendum } from './brain'

describe('stripAnnouncement — 3F-correctif-2 : code place l\'annonce, retire reprise du modèle', () => {
  const ANN = 'CHoCH M1 validé. On attend le M5, pas avant.'

  it('reply vide → vide', () => {
    expect(stripAnnouncement('', ANN)).toBe('')
  })

  it('announcement null → reply inchangée', () => {
    expect(stripAnnouncement('Bonjour', null)).toBe('Bonjour')
  })

  it('reply == annonce → vide (le modèle n\'a rien ajouté)', () => {
    expect(stripAnnouncement(ANN, ANN)).toBe('')
  })

  it('reply == annonce + suite → suite seule', () => {
    const out = stripAnnouncement(`${ANN} Le prochain pas, c'est le M5.`, ANN)
    expect(out).toBe('Le prochain pas, c\'est le M5.')
  })

  it('annonce entre « » en tête → retirée', () => {
    const out = stripAnnouncement(`«${ANN}» Le prochain pas, c'est le M5.`, ANN)
    expect(out).toBe('Le prochain pas, c\'est le M5.')
  })

  it('annonce entre « » avec espaces fine → retirée', () => {
    const out = stripAnnouncement(`« ${ANN} » Le M5 arrive.`, ANN)
    expect(out).toBe('Le M5 arrive.')
  })

  it('cas prod : annonce + reprise entre « » + suite', () => {
    const reply = `${ANN} «${ANN}» Le prochain pas, c'est le M5.`
    expect(stripAnnouncement(reply, ANN)).toBe('Le prochain pas, c\'est le M5.')
  })

  it('cas target_reached : deux annonces d\'affilée', () => {
    const ann2 = 'Plus 3 R : objectif atteint. Mission du jour accomplie, on coupe.'
    const reply = `${ann2} ${ann2} Beau boulot, à demain.`
    expect(stripAnnouncement(reply, ann2)).toBe('Beau boulot, à demain.')
  })

  it('apostrophes typographiques équivalentes aux droites', () => {
    const ann = "Trois pertes d'affilée : stop pour aujourd'hui. Ce n'est pas ton jour, et ce n'est pas grave."
    const annTypo = ann.replace(/'/g, '’')
    // le modèle recrache avec ’ au lieu de '
    const out = stripAnnouncement(`${annTypo} Repose-toi.`, ann)
    expect(out).toBe('Repose-toi.')
  })
})

describe('buildAntiRepetitionAddendum — scan historique', () => {
  const user = () => 'je prends un trade sur le NQ'

  it('vide → null (rien à bannir sauf stats)', () => {
    const r = buildAntiRepetitionAddendum([], user())
    // par défaut, les stats sont toujours bannies (user n'a pas demandé)
    expect(r).toContain('NE SORS AUCUNE STAT')
  })

  it('ratio déjà mentionné → banni', () => {
    const r = buildAntiRepetitionAddendum([
      { role: 'assistant', content: 'Ton ratio minimum doit être 2 R.' },
    ], user())
    expect(r).toContain('ratio minimum')
  })

  it('journal déjà invité → banni', () => {
    const r = buildAntiRepetitionAddendum([
      { role: 'assistant', content: 'Note ça dans ton journal pour le débrief.' },
    ], user())
    expect(r).toContain('journal')
  })

  it('émotion déjà demandée → bannie', () => {
    const r = buildAntiRepetitionAddendum([
      { role: 'assistant', content: 'Quelle émotion ressens-tu maintenant ?' },
    ], user())
    expect(r).toContain('émotion')
  })

  it('user demande explicitement les stats → stats autorisées', () => {
    const r = buildAntiRepetitionAddendum([], 'c\'est quoi mon win rate sur 30 jours ?')
    expect(r).toBeNull()
  })
})
