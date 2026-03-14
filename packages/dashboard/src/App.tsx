import { useState } from 'react';
import Costs from './pages/costs';
import Approvals from './pages/approvals';
import Audit from './pages/audit';

type Tab = 'costs' | 'approvals' | 'audit';

const TAB_LABELS: Record<Tab, string> = {
  costs: 'Costs',
  approvals: 'Approvals',
  audit: 'Audit',
};

const TABS: Tab[] = ['costs', 'approvals', 'audit'];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('costs');

  return (
    <div style={{ fontFamily: 'monospace, sans-serif', maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>agentgov Dashboard</h1>
        <p style={{ margin: '4px 0 0', color: '#666', fontSize: 14 }}>
          AI agent cost governance — budget balances, pending approvals, enforcement audit log
        </p>
      </header>

      <nav style={{ display: 'flex', gap: 0, borderBottom: '2px solid #ddd', marginBottom: 24 }}>
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 24px',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #333' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: activeTab === tab ? 700 : 400,
              color: activeTab === tab ? '#333' : '#888',
              marginBottom: -2,
            }}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </nav>

      <main>
        {activeTab === 'costs' && <Costs />}
        {activeTab === 'approvals' && <Approvals />}
        {activeTab === 'audit' && <Audit />}
      </main>
    </div>
  );
}
