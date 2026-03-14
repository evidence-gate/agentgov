import { useAuditLog, AuditRow } from '../hooks/useDashboard';

function formatUsdDelta(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}$${value.toFixed(4)}`;
}

function formatTs(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

const EVENT_TYPE_COLORS: Record<string, { background: string; color: string }> = {
  budget_hold: { background: '#e8f0ff', color: '#003' },
  budget_settle: { background: '#dfd', color: '#050' },
  budget_cancel: { background: '#f8f0cc', color: '#640' },
  budget_exceeded: { background: '#fdd', color: '#800' },
  alert_fired: { background: '#ffe8cc', color: '#840' },
  stuck_detected: { background: '#f8d8f8', color: '#408' },
};

function EventBadge({ type }: { type: string }) {
  const style = EVENT_TYPE_COLORS[type] ?? { background: '#eee', color: '#444' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 3,
        fontSize: 11,
        fontWeight: 700,
        ...style,
      }}
    >
      {type}
    </span>
  );
}

export default function Audit() {
  const { data, isLoading, error } = useAuditLog(100);

  if (isLoading) {
    return <p style={{ color: '#888' }}>Loading audit log...</p>;
  }

  if (error) {
    return (
      <div style={{ color: '#c00', background: '#fff0f0', padding: 12, borderRadius: 4 }}>
        Error loading audit log: {(error as Error).message}
      </div>
    );
  }

  // API returns ASC; display DESC (newest first)
  const rows = data ? [...data].reverse() : [];

  if (rows.length === 0) {
    return <p style={{ color: '#888' }}>No audit events.</p>;
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>Audit Log</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f5f5f5' }}>
            <th style={thStyle}>Seq</th>
            <th style={thStyle}>Event Type</th>
            <th style={thStyle}>Agent ID</th>
            <th style={thStyle}>Model</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Cost Delta</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Running Balance</th>
            <th style={thStyle}>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row: AuditRow, i: number) => (
            <tr key={row.seq} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={{ ...tdStyle, color: '#888' }}>{row.seq}</td>
              <td style={tdStyle}>
                <EventBadge type={row.eventType} />
              </td>
              <td style={tdStyle}>{row.agentId}</td>
              <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{row.model ?? '—'}</td>
              <td
                style={{
                  ...tdStyle,
                  textAlign: 'right',
                  fontFamily: 'monospace',
                  color: row.costDelta >= 0 ? '#800' : '#060',
                }}
              >
                {formatUsdDelta(row.costDelta)}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace' }}>
                ${row.runningBalance.toFixed(4)}
              </td>
              <td style={tdStyle}>{formatTs(row.ts)}</td>
            </tr>
          ))}
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
