import { useState } from 'react';
import { useBudgets, useUpdateBudgetLimit, BudgetRow } from '../hooks/useDashboard';

function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}

function formatTs(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

export default function Costs() {
  const { data, isLoading, error } = useBudgets();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const mutation = useUpdateBudgetLimit();

  if (isLoading) {
    return <p style={{ color: '#888' }}>Loading budget data...</p>;
  }

  if (error) {
    return (
      <div style={{ color: '#c00', background: '#fff0f0', padding: 12, borderRadius: 4 }}>
        Error loading budgets: {(error as Error).message}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <p style={{ color: '#888' }}>No budgets configured.</p>;
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>Budget Balances</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f5f5f5' }}>
            <th style={thStyle}>Agent ID</th>
            <th style={thStyle}>Limit (USD)</th>
            <th style={thStyle}>Spent (USD)</th>
            <th style={thStyle}>Reserved (USD)</th>
            <th style={thStyle}>Available (USD)</th>
            <th style={thStyle}>Last Updated</th>
            <th style={thStyle}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row: BudgetRow, i: number) => {
            const available = row.limitUsd - row.spentUsd - row.reservedUsd;
            const isEditing = editingId === row.agentId;
            return (
              <tr key={row.agentId} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={tdStyle}>{row.agentId}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {isEditing ? (
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      style={{ width: 100, padding: '4px 8px' }}
                    />
                  ) : (
                    formatUsd(row.limitUsd)
                  )}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{formatUsd(row.spentUsd)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{formatUsd(row.reservedUsd)}</td>
                <td style={{ ...tdStyle, textAlign: 'right', color: available < 0 ? '#c00' : '#060' }}>
                  {formatUsd(available)}
                </td>
                <td style={tdStyle}>{formatTs(row.updatedAt)}</td>
                <td style={tdStyle}>
                  {isEditing ? (
                    <>
                      <button
                        disabled={mutation.isPending}
                        onClick={() => {
                          const val = parseFloat(editValue);
                          if (!isNaN(val) && val >= 0) {
                            mutation.mutate({ agentId: row.agentId, limitUsd: val });
                            setEditingId(null);
                          }
                        }}
                        style={{ padding: '4px 8px', cursor: 'pointer', background: '#0a0', color: '#fff', border: 'none', borderRadius: 3, marginRight: 4 }}
                      >
                        {mutation.isPending ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        style={{ padding: '4px 8px', cursor: 'pointer', background: '#f5f5f5', border: '1px solid #ccc', borderRadius: 3 }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingId(row.agentId);
                        setEditValue(String(row.limitUsd));
                      }}
                      style={{ padding: '4px 8px', cursor: 'pointer', background: '#e8f0fe', border: '1px solid #ccc', borderRadius: 3 }}
                    >
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  fontWeight: 700,
  borderBottom: '2px solid #ddd',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid #eee',
};
