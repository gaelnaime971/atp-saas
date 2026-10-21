import { describe, it, expect } from 'vitest'
import { stripAnnouncement, buildAntiRepetitionAddendum, applyGoldenRuleGuard, applyJokerCodeFaitFoiGuard, openrouterCauseLabel } from './brain'

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

describe('applyJokerCodeFaitFoiGuard — le code fait foi côté sortie', () => {
  it('texte vide → vide', () => {
    const r = applyJokerCodeFaitFoiGuard('', 'armed')
    expect(r.text).toBe('')
  })

  it('step=ready → tout passe (M1+M5 autorisés)', () => {
    const txt = 'CHoCH M1 et M5 validés. Super.'
    const r = applyJokerCodeFaitFoiGuard(txt, 'ready')
    expect(r.text).toBe(txt)
    expect(r.removed).toEqual([])
  })

  it('step=armed + "CHoCH M1 et M5 validés." → RETIRÉ (bug prod)', () => {
    const r = applyJokerCodeFaitFoiGuard('CHoCH M1 et M5 validés.', 'armed')
    expect(r.text).toBe('')
    expect(r.removed).toHaveLength(1)
    expect(r.removed[0].label).toMatch(/joker:affirm/)
  })

  it('step=armed + "M1 est validé." → RETIRÉ', () => {
    const r = applyJokerCodeFaitFoiGuard('M1 est validé.', 'armed')
    expect(r.text).toBe('')
    expect(r.removed[0].label).toBe('joker:affirm-m1-not-registered')
  })

  it('step=armed + "M5 confirmé." → RETIRÉ', () => {
    const r = applyJokerCodeFaitFoiGuard('M5 confirmé.', 'armed')
    expect(r.removed[0].label).toBe('joker:affirm-m5-not-registered')
  })

  it('step=choch_m1 + "M1 est validé." → GARDÉ (M1 enregistré)', () => {
    const r = applyJokerCodeFaitFoiGuard('M1 est validé.', 'choch_m1')
    expect(r.text).toBe('M1 est validé.')
  })

  it('step=choch_m1 + "M5 est validé." → RETIRÉ (M5 pas encore)', () => {
    const r = applyJokerCodeFaitFoiGuard('M5 est validé.', 'choch_m1')
    expect(r.removed[0].label).toBe('joker:affirm-m5-not-registered')
  })

  it('step=armed + "M1 n\'est pas encore validé." → GARDÉ (négation)', () => {
    const r = applyJokerCodeFaitFoiGuard('M1 n\'est pas encore validé.', 'armed')
    expect(r.text).toBe('M1 n\'est pas encore validé.')
  })

  it('step=armed + "On attend ton CHoCH M1." → GARDÉ (attente)', () => {
    const r = applyJokerCodeFaitFoiGuard('On attend ton CHoCH M1.', 'armed')
    expect(r.text).toBe('On attend ton CHoCH M1.')
  })

  it('step=armed + "Il manque le CHoCH M5." → GARDÉ (manque)', () => {
    const r = applyJokerCodeFaitFoiGuard('Il manque le CHoCH M5.', 'armed')
    expect(r.text).toBe('Il manque le CHoCH M5.')
  })

  it('step=choch_m5 + "les deux CHoCHs sont validés." → GARDÉ', () => {
    const r = applyJokerCodeFaitFoiGuard('les deux CHoCHs sont validés.', 'choch_m5')
    expect(r.text).toBe('les deux CHoCHs sont validés.')
  })

  it('step=armed + "les deux CHoCHs sont validés." → RETIRÉ', () => {
    const r = applyJokerCodeFaitFoiGuard('les deux CHoCHs sont validés.', 'armed')
    expect(r.text).toBe('')
  })

  it('phrase mixte : garde ce qui est licite, retire l\'affirmation', () => {
    const txt = 'On surveille ta zone. CHoCH M1 et M5 validés. Reste concentré.'
    const r = applyJokerCodeFaitFoiGuard(txt, 'armed')
    expect(r.text).toBe('On surveille ta zone. Reste concentré.')
  })
})

describe('openrouterCauseLabel — 3G-correctif : cause lisible du secours', () => {
  it('undefined → "inconnue"', () => {
    expect(openrouterCauseLabel(undefined)).toBe('inconnue')
  })

  it('status 0 + timeout → "timeout OpenRouter"', () => {
    expect(openrouterCauseLabel({ status: 0, detail: 'AbortError: signal timed out' }))
      .toBe('timeout OpenRouter')
  })

  it('status 0 réseau → "réseau OpenRouter indisponible"', () => {
    expect(openrouterCauseLabel({ status: 0, detail: 'network error' }))
      .toBe('réseau OpenRouter indisponible')
  })

  it('status 401 → "clé OpenRouter refusée"', () => {
    expect(openrouterCauseLabel({ status: 401, detail: { error: { message: 'Invalid API key' } } }))
      .toBe('clé OpenRouter refusée')
  })

  it('status 402 → "crédits OpenRouter épuisés"', () => {
    expect(openrouterCauseLabel({ status: 402, detail: { error: 'Insufficient credits' } }))
      .toBe('crédits OpenRouter épuisés')
  })

  it('status 403 + privacy → "confidentialité OpenRouter"', () => {
    expect(openrouterCauseLabel({ status: 403, detail: { error: 'Data policy violation' } }))
      .toContain('confidentialité OpenRouter')
  })

  it('status 404 → "modèle OpenRouter introuvable"', () => {
    expect(openrouterCauseLabel({ status: 404, detail: 'model not found' }))
      .toBe('modèle OpenRouter introuvable')
  })

  it('status 400 + reasoning → "reasoning refusé par le modèle"', () => {
    expect(openrouterCauseLabel({ status: 400, detail: { error: { message: 'reasoning not supported' } } }))
      .toBe('reasoning refusé par le modèle')
  })

  it('status 429 → "limite OpenRouter atteinte"', () => {
    expect(openrouterCauseLabel({ status: 429, detail: 'rate limit' }))
      .toBe('limite OpenRouter atteinte')
  })

  it('status 500 → "panne OpenRouter (500)"', () => {
    expect(openrouterCauseLabel({ status: 500, detail: 'internal' }))
      .toBe('panne OpenRouter (500)')
  })

  it('status inconnu → "OpenRouter HTTP <n>"', () => {
    expect(openrouterCauseLabel({ status: 418, detail: 'teapot' }))
      .toBe('OpenRouter HTTP 418')
  })
})
