/**
 * Layout du labo /test.
 *
 * Isole tout ce qui vient de shadcn (tokens oklch, imports Tailwind additionnels,
 * variant .dark, radius scale shadcn) dans un fichier CSS chargé uniquement
 * pour cette route. Le reste de l'app n'est pas affecté.
 */
import './lab-tokens.css'

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
