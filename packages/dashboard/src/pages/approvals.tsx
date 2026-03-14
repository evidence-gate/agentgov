import { usePendingApprovals, ApprovalRow } from '../hooks/useDashboard';

function formatTs(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

function truncateId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}...` : id;
}

const RISK_TIER_COLORS: Record<string, { background: string; color: string }> = {
  irreversible: { background: '#fdd', color: '#800' },
  'semi-reversible': { background: '#ffe8cc', color: '#844' },
  reversible: { background: '#dfd', color: '#060' },
  external: { background: '#e8d8f8', color: '#408' },
};

function RiskBadge({ tier }: { tier: string }) {
  const style = RISK_TIER_COLORS[tier] ?? { background: '#eee', color: '#444' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 3,
        fontSize: 12,
        fontWeight: 700,
        ...style,
      }}
    >
      {tier}
    </span>
  );
}

export default function Approvals() {
  const { data, isLoading, error } = usePendingApprovals();

  if (isLoading) {
    return <p style={{ color: '#888' }}>Loading pending approvals...</p>;
  }

  if (error) {
    return (
      <div style={{ color: '#c00', background: '#fff0f0', padding: 12, borderRadius: 4 }}>
        Error loading approvals: {(error as Error).message}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <p style={{ color: '#888' }}>No pending approvals.</p>;
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>Pending Approvals</h2>
      <p style={{ color: '#666', fontSize: 13, margin: '0 0 12px' }}>
        Read-only view. Approvals must be submitted via the HITL API or Slack integration.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f5f5f5' }}>
            <th style={thStyle}>Approval ID</th>
            <th style={thStyle}>Agent ID</th>
            <th style={thStyle}>Action</th>
            <th style={thStyle}>Risk Tier</th>
            <th style={thStyle}>Created</th>
            <th style={thStyle}>Expires</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row: ApprovalRow, i: number) => (
            <tr key={row.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }} title={row.id}>
                {truncateId(row.id)}
              </td>
              <td style={tdStyle}>{row.agentId}</td>
              <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{row.actionName}</td>
              <td style={tdStyle}>
                <RiskBadge tier={row.riskTier} />
              </td>
              <td style={tdStyle}>{formatTs(row.createdAt)}</td>
              <td style={tdStyle}>{formatTs(row.expiresAt)}</td>
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
