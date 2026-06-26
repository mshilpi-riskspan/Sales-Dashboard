import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { formatDistanceToNow } from 'date-fns';
import { useDashboard } from '../../context/DashboardContext';
import LoadingSpinner from '../common/LoadingSpinner';
import RepFilterDropdown from '../common/RepFilterDropdown';
import { useState } from 'react';

export default function Topbar({ pageTitle, showRepFilter = false }) {
  const { selectedRep, setSelectedRep, repList, lastRefreshed, triggerRefresh } = useDashboard();
  const [refreshing, setRefreshing] = useState(false);

  function handleRefresh() {
    setRefreshing(true);
    triggerRefresh();
    setTimeout(() => setRefreshing(false), 1200);
  }

  return (
    <header className="h-[60px] bg-rs-surface border-b border-rs-border flex items-center px-6 gap-4 shrink-0">
      <h1 className="text-base font-semibold text-rs-text flex-1">{pageTitle}</h1>

      <div className="flex items-center gap-3">
        {showRepFilter && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-rs-muted font-medium whitespace-nowrap">Salesperson</label>
            <RepFilterDropdown
              value={selectedRep}
              onChange={setSelectedRep}
              options={repList}
            />
          </div>
        )}

        <span className="text-xs text-rs-muted whitespace-nowrap">
          Updated {formatDistanceToNow(lastRefreshed, { addSuffix: true })}
        </span>

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-rs-teal text-white text-xs font-medium rounded-[5px] hover:bg-rs-teal/90 disabled:opacity-60 transition-colors"
        >
          {refreshing ? (
            <LoadingSpinner size="sm" />
          ) : (
            <ArrowPathIcon className="h-3.5 w-3.5" />
          )}
          Refresh
        </button>
      </div>
    </header>
  );
}
