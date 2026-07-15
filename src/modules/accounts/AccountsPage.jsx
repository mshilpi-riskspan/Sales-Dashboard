import { useState } from 'react';
import AccountSearch from './AccountSearch';
import AccountView from './AccountView';

export default function AccountsPage() {
  const [selectedAccountId, setSelectedAccountId] = useState(null);

  if (selectedAccountId) {
    return (
      <AccountView
        accountId={selectedAccountId}
        onBack={() => setSelectedAccountId(null)}
      />
    );
  }

  return <AccountSearch onSelect={setSelectedAccountId} />;
}
