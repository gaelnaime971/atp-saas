import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: '/Users/gaelnaime/DEV/ATP Dashboard coaching',
  },
  // URL propre → fichier statique versionné par année dans /public.
  // Prochaine édition : dupliquer le fichier en koh-samui-2028.html et
  // basculer la destination ici — l'URL /koh-samui reste stable.
  async rewrites() {
    return [
      { source: '/koh-samui', destination: '/koh-samui-2027.html' },
      // Maquettes client ALIGNÉ : Next.js 16 ne fait pas d'auto-index
      // sur public/foo/index.html. Sans ces 2 rewrites, /maquettes/aligne
      // et /maquettes/aligne/ renverraient 404. Le fichier existe bien
      // à public/maquettes/aligne/index.html.
      { source: '/maquettes/aligne', destination: '/maquettes/aligne/index.html' },
      { source: '/maquettes/aligne/', destination: '/maquettes/aligne/index.html' },
    ]
  },
  // Header noindex sur tout le sous-arbre /maquettes/* — doublé de la
  // meta noindex dans chaque HTML pour redondance. Aucun autre header
  // n'est défini ailleurs dans ce fichier, rien à fusionner pour l'instant.
  async headers() {
    return [
      {
        source: '/maquettes/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ]
  },
};

export default nextConfig;
