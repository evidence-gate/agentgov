import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { createDbClient } from '../db/client';
import { runHitlWorkflow, type HitlParams } from './workflow-run';
export type { HitlParams } from './workflow-run';

type Env = { TURSO_DATABASE_URL: string; TURSO_AUTH_TOKEN: string };

export class HitlWorkflow extends WorkflowEntrypoint<Env, HitlParams> {
  async run(event: WorkflowEvent<HitlParams>, step: WorkflowStep): Promise<void> {
    await runHitlWorkflow(event, step, () => createDbClient(this.env.TURSO_DATABASE_URL, this.env.TURSO_AUTH_TOKEN));
  }
}
