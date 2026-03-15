import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export interface BudgetRow {
  agentId: string;
  limitUsd: number;
  spentUsd: number;
  reservedUsd: number;
  updatedAt: number;
}

export interface AuditRow {
  seq: number;
  eventType: string;
  agentId: string;
  model: string | null;
  costDelta: number;
  runningBalance: number;
  payload: string | null;
  prevHash: string | null;
  hash: string;
  ts: number;
}

export interface ApprovalRow {
  id: string;
  agentId: string;
  status: string;
  riskTier: string;
  actionName: string;
  requestPayload: string | null;
  approver: string | null;
  approverReason: string | null;
  holdId: string | null;
  createdAt: number;
  expiresAt: number;
  decidedAt: number | null;
}

export function useBudgets() {
  return useQuery<BudgetRow[]>({
    queryKey: ['budgets'],
    queryFn: () => fetchJson(`${API_BASE}/api/v1/dashboard/budgets`),
    refetchInterval: 5000,
    staleTime: 3000,
  });
}

export function useAuditLog(limit = 100) {
  return useQuery<AuditRow[]>({
    queryKey: ['audit', limit],
    queryFn: () => fetchJson(`${API_BASE}/api/v1/dashboard/audit?limit=${limit}`),
    refetchInterval: 5000,
  });
}

export function usePendingApprovals() {
  return useQuery<ApprovalRow[]>({
    queryKey: ['approvals'],
    queryFn: () => fetchJson(`${API_BASE}/api/v1/dashboard/approvals`),
    refetchInterval: 5000,
  });
}

export function useUpdateBudgetLimit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, limitUsd }: { agentId: string; limitUsd: number }) =>
      fetch(`${API_BASE}/api/v1/dashboard/budgets/${encodeURIComponent(agentId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limitUsd }),
      }).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
}
