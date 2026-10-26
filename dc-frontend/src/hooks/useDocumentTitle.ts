import { useEffect } from 'react';

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · VaultWatch` : 'VaultWatch: Predictive Data Center Reliability';
  }, [title]);
}
