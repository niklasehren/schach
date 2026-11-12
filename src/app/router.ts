import { useEffect, useState } from 'react';

export type Route =
  | { page: 'spielen' }
  | { page: 'partien' }
  | { page: 'partie'; id: string }
  | { page: 'import' };

/** Seiten über den Teil nach „#“ in der Adresse – funktioniert auf GitHub Pages ohne Server-Einstellungen */
export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'partien' && parts[1]) return { page: 'partie', id: parts[1] };
  if (parts[0] === 'partien') return { page: 'partien' };
  if (parts[0] === 'import') return { page: 'import' };
  return { page: 'spielen' };
}

export function href(route: Route): string {
  return route.page === 'partie' ? `#/partien/${encodeURIComponent(route.id)}` : `#/${route.page}`;
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
