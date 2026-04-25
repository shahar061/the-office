import type { AskQuestion, UIDesignReviewPayload } from '../../shared/types';
import type { JumpTarget } from '../engine/types';

export type MockEvent =
  | { kind: 'created'; delayMs?: number; isTopLevel?: boolean }
  | { kind: 'tool-start'; toolName: string; target?: string; toolId?: string; delayMs?: number }
  | { kind: 'tool-done'; toolId?: string; delayMs?: number }
  | { kind: 'message'; text: string; delayMs?: number }
  | { kind: 'ask-question'; questions: AskQuestion[]; delayMs?: number }
  | { kind: 'ui-review-ready'; payload: UIDesignReviewPayload; delayMs?: number }
  | { kind: 'write-output'; delayMs?: number }
  | { kind: 'closed'; delayMs?: number };

export interface Scenario {
  target: JumpTarget;
  events: MockEvent[];
}
