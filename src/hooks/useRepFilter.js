import { useMemo } from 'react';
import { useDashboard } from '../context/DashboardContext';

export function useRepFilter(records) {
  const { selectedRep } = useDashboard();

  return useMemo(() => {
    if (!records) return [];
    if (selectedRep === 'all') return records;
    return records.filter((r) => r.OwnerId === selectedRep);
  }, [records, selectedRep]);
}
