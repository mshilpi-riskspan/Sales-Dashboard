import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchAllReps, invalidateCache } from '../datasources/salesforce';

const DashboardContext = createContext(null);

export function DashboardProvider({ children }) {
  const [selectedRep, setSelectedRep] = useState('all');
  const [selectedLob, setSelectedLob] = useState('all');
  const [repList, setRepList] = useState([]);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    fetchAllReps()
      .then(setRepList)
      .catch(() => setRepList([]));
  }, [refreshCount]);

  const triggerRefresh = useCallback(() => {
    invalidateCache();
    setRefreshCount((c) => c + 1);
    setLastRefreshed(new Date());
  }, []);

  return (
    <DashboardContext.Provider
      value={{ selectedRep, setSelectedRep, selectedLob, setSelectedLob, repList, lastRefreshed, refreshCount, triggerRefresh }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used inside DashboardProvider');
  return ctx;
}
