// shared/types/settings.ts — App settings, auth, and stats types

import type { PairedDevice } from './mobile';
import type { BuildConfig } from './project';

export interface AuthStatus {
  connected: boolean;
  account?: string;
  method?: 'api-key' | 'cli-auth';
}

export interface GitIdentity {
  id: string;      // stable uuid
  label: string;   // e.g. "Work", "Personal"
  name: string;    // git author name
  email: string;   // git author email
}

export interface AppSettings {
  defaultModelPreset: BuildConfig['modelPreset'];
  defaultPermissionMode: BuildConfig['permissionMode'];
  maxParallelTLs: number;
  windowBounds?: { x: number; y: number; width: number; height: number };
  gitIdentities: GitIdentity[];
  defaultGitIdentityId: string | null;
  gitPreferences?: {
    includeOfficeStateInRepo: boolean;
  };
  mobile?: {
    enabled: boolean;
    port: number | null;  // null = dynamic
    devices: PairedDevice[];
  };
  audio?: {
    musicMuted: boolean;
    sfxMuted: boolean;
  };
}

export interface RateLimitState {
  status: 'allowed' | 'allowed_warning' | 'rejected';
  utilization: number;
  rateLimitType: string;
  resetsAt: number | null;
  isUsingOverage: boolean;
  overageStatus: string | null;
}

export interface ActStats {
  name: string;
  startedAt: number;
  completedAt: number | null;
  cost: number;
  tokens: number;
}

export interface PhaseStats {
  startedAt: number;
  completedAt: number | null;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  acts: ActStats[];
}

export interface AgentStats {
  cost: number;
  inputTokens: number;
  outputTokens: number;
  timeActiveMs: number;
  tasksCompleted: number;
  phases: string[];
}

export interface StatsState {
  rateLimit: RateLimitState | null;
  session: {
    totalCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheReadTokens: number;
    totalCacheWriteTokens: number;
    startedAt: number;
  };
  phases: Record<string, PhaseStats>;
  agents: Record<string, AgentStats>;
}
