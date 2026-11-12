import { useEffect, useState } from 'react';

export type Route =
  | { page: 'spielen' }
  | { page: 'partien' }
  | { page: 'partie'; id: string; ply?: number }
  | { page: 'import' }
  | { page: 'training' };

/** Seiten über den Teil nach „#“ in der Adresse – funktioniert auf GitHub Pages ohne Server-Einstellungen */
export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'partien' && parts[1]) return { page: 'partie', id: parts[1], ply: parts[2] !== undefined && /^\d+$/.test(parts[2]) ? Number(parts[2]) : undefined };
  if (parts[0] === 'training') return { page: 'training' };
  if (parts[0] === 'partien') return { page: 'partien' };
  if (parts[0] === 'import') return { page: 'import' };
  return { page: 'spielen' };
}

export function href(route: Route): string {
  if (route.page === 'partie') return `#/partien/${encodeURIComponent(route.id)}${route.ply !== undefined ? `/${route.ply}` : ''}`;
  return `#/${route.page}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
