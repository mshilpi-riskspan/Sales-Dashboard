import { useMemo } from 'react';
import { useDashboard } from '../context/DashboardContext';

export function useRepFilter(records) {
  const { selectedRep, selectedLob } = useDashboard();

  return useMemo(() => {
    if (!records) return [];
    let result = records;
    if (selectedRep !== 'all') result = result.filter((r) => r.OwnerId === selectedRep);
    if (selectedLob !== 'all') result = result.filter((r) => r.Line_of_Business__c === selectedLob);
    return result;
  }, [records, selectedRep, selectedLob]);
}
