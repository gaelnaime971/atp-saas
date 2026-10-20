import { describe, it, expect } from 'vitest'
import { stripAnnouncement, buildAntiRepetitionAddendum, applyGoldenRuleGuard } from './brain'

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

describe('applyGoldenRuleGuard — règle d\'or : jamais pousser à entrer', () => {
  it('texte vide → vide, rien retiré', () => {
    const r = applyGoldenRuleGuard('')
    expect(r.text).toBe('')
    expect(r.removed).toEqual([])
  })

  it('"Passe à l\'exécution selon ton plan de risque." → retiré', () => {
    const r = applyGoldenRuleGuard('Passe à l\'exécution selon ton plan de risque.')
    expect(r.text).toBe('')
    expect(r.removed).toHaveLength(1)
    expect(r.removed[0].label).toBe('push:execution')
  })

  it('"Quelle taille de position vas-tu allouer ?" → retiré', () => {
    const r = applyGoldenRuleGuard('Quelle taille de position vas-tu allouer ?')
    expect(r.text).toBe('')
    expect(r.removed[0].label).toBe('push:taille-position')
  })

  it('"Tu peux entrer maintenant." → retiré', () => {
    const r = applyGoldenRuleGuard('Tu peux entrer maintenant.')
    expect(r.text).toBe('')
    expect(r.removed[0].label).toBe('push:tu-peux-entrer')
  })

  it('"Prends position dès que le signal se confirme." → retiré', () => {
    const r = applyGoldenRuleGuard('Prends position dès que le signal se confirme.')
    expect(r.removed[0].label).toBe('push:prends-position')
  })

  it('"Clique sur buy." → retiré', () => {
    const r = applyGoldenRuleGuard('Clique sur buy.')
    expect(r.removed[0].label).toBe('push:clique-side')
  })

  it('phrase mixte : garde ce qui est OK, retire ce qui pousse', () => {
    const text = 'On attend ta zone. Passe à l\'exécution selon ton plan. Reste concentré.'
    const r = applyGoldenRuleGuard(text)
    expect(r.text).toBe('On attend ta zone. Reste concentré.')
    expect(r.removed).toHaveLength(1)
  })

  it('"C\'est toi qui cliques, et toi seul qui décides." → GARDÉ (phrase officielle)', () => {
    const r = applyGoldenRuleGuard('C\'est toi qui cliques, et toi seul qui décides.')
    expect(r.text).toBe('C\'est toi qui cliques, et toi seul qui décides.')
    expect(r.removed).toEqual([])
  })

  it('annonce ready complète → GARDÉE intégralement', () => {
    const ann = 'Ta checklist Joker est complète. C\'est toi qui cliques, et toi seul qui décides.'
    const r = applyGoldenRuleGuard(ann)
    expect(r.text).toBe(ann)
    expect(r.removed).toEqual([])
  })

  it('"Reste calme et observe le marché." → GARDÉ', () => {
    const r = applyGoldenRuleGuard('Reste calme et observe le marché.')
    expect(r.text).toBe('Reste calme et observe le marché.')
  })

  it('"Note dans ton journal après coup." → GARDÉ', () => {
    const r = applyGoldenRuleGuard('Note dans ton journal après coup.')
    expect(r.text).toBe('Note dans ton journal après coup.')
  })

  it('"Combien de lots vas-tu prendre ?" → retiré', () => {
    const r = applyGoldenRuleGuard('Combien de lots vas-tu prendre ?')
    expect(r.text).toBe('')
    expect(r.removed[0].label).toBe('push:combien-lots')
  })

  it('"Exécute le trade." → retiré', () => {
    const r = applyGoldenRuleGuard('Exécute le trade.')
    expect(r.removed[0].label).toBe('push:execute-trade')
  })
})
