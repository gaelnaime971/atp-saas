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
    ]
  },
};

export default nextConfig;
