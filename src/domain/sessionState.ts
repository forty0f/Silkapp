import type { Session } from './types'

/**
 * Whether a finished session moves the training plan (A/B rotation, week and
 * slot of the adaptation block). Kept separate from "work actually performed":
 * - `completed` sessions advance unless the user chose to repeat the workout
 *   (`planAdvance === false`, written by versions with partial completion);
 * - sessions without the field (all data from earlier versions) keep the plan
 *   effect they always had;
 * - `cancelled` and `in_progress` sessions never advance.
 */
export function advancesPlan(s: Pick<Session, 'status' | 'planAdvance' | 'deletedAt'>): boolean {
  return s.status === 'completed' && !s.deletedAt && s.planAdvance !== false
}
