import { useState } from 'react';
import { DashboardProvider } from './context/DashboardContext';
import { NAV_ITEMS } from './config/navigation';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';
import PageShell from './components/layout/PageShell';

export default function App() {
  const [activePage, setActivePage] = useState(NAV_ITEMS[0].id);

  const activeItem = NAV_ITEMS.find((n) => n.id === activePage) || NAV_ITEMS[0];
  const ActiveComponent = activeItem.component;
  const showRepFilter = activeItem.filters?.includes('salesperson') ?? false;

  return (
    <DashboardProvider>
      <div className="flex h-screen overflow-hidden w-full">
        <Sidebar navItems={NAV_ITEMS} activePage={activePage} onNavigate={setActivePage} />
        <div className="flex flex-col flex-1 overflow-hidden">
          <Topbar pageTitle={activeItem.label} showRepFilter={showRepFilter} activePage={activePage} />
          <main className="flex-1 overflow-y-auto bg-white">
            <PageShell>
              <ActiveComponent />
            </PageShell>
          </main>
        </div>
      </div>
    </DashboardProvider>
  );
}
