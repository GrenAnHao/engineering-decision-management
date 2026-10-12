import { useCallback, useEffect, useState } from 'react';
import { formatHash, parseHash, type ParsedHash, type Route } from '../router';

/** hash 路由：读取用 hashchange，写入用 replaceState（不产生历史记录，后退键不刷屏） */
export function useHashRoute(): [ParsedHash, (route: Route) => void] {
  const [hash, setHash] = useState(() => location.hash);

  useEffect(() => {
    const onChange = () => setHash(location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((route: Route) => {
    const next = formatHash(route);
    if (next === location.hash) return;
    history.replaceState(null, '', next);
    setHash(next);
  }, []);

  return [parseHash(hash), navigate];
}
