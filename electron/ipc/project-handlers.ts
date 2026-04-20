import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { IPC_CHANNELS } from '../../shared/types';
import type { Phase, GitRecoveryNote } from '../../shared/types';
import { GitManager } from '../project/git-manager';
import { writeRepoIdentity } from '../project/git-identity-apply';
import { GreenfieldGit } from '../project/greenfield-git';
import { ArtifactStore } from '../project/artifact-store';
import { ChatHistoryStore } from '../project/chat-history-store';
import { RequestStore } from '../project/request-store';
import { ProjectScanner } from '../project/project-scanner';
import { resumePhase, resumeWarroomAfterReview, resumeAwaitingReview, handleStartWarroom, handleStartBuild } from './phase-handlers';
import { resolverForRestoredQuestion } from '../orchestrator/phase-advance';
import {
  mainWindow,
  currentProjectDir,
  artifactStore,
  chatHistoryStore,
  projectManager,
  pendingQuestions,
  setCurrentProjectDir,
  setArtifactStore,
  setChatHistoryStore,
  setRequestStore,
  requestStore,
  setCurrentChatPhase,
  setCurrentChatAgentRole,
  setCurrentChatRunNumber,
  resetSessionState,
  send,
  loadWaitingState,
  loadPendingReview,
  setPendingReview,
  dataDir,
  settingsStore,
  refreshMobileArchivedRuns,
} from './state';

export function initProjectHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.GET_RECENT_PROJECTS, async () => {
    return projectManager.getRecentProjects();
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_PROJECT, async (_event, projectPath: string) => {
    try {
      // Read persisted waiting state BEFORE reset clears the file
      const saved = loadWaitingState(projectPath);

      resetSessionState();
      projectManager.openProject(projectPath);
      setCurrentProjectDir(projectPath);
      setArtifactStore(new ArtifactStore(projectPath));
      setRequestStore(new RequestStore(projectPath));
      chatHistoryStore?.flush();
      const newChatStore = new ChatHistoryStore(projectPath);
      setChatHistoryStore(newChatStore);

      // Sub-project 4: sweep for orphan git state from crashed requests
      if (requestStore) {
        const git = new GitManager(projectPath);
        const failedIsolated = requestStore.list().filter(
          (r) => r.status === 'failed' && r.branchIsolated && r.branchName && r.baseBranch,
        );

        if (failedIsolated.length > 0 && (await git.isGitRepo())) {
          const currentBranch = await git.currentBranch();
          const dirty = await git.isDirty();

          // 1. Safe branch switch if we're on an orphan with a clean tree
          for (const req of failedIsolated) {
            if (currentBranch === req.branchName) {
              if (dirty) {
                const note: GitRecoveryNote = {
                  level: 'warning',
                  message: `You're on a leftover request branch '${req.branchName}' with uncommitted changes. Resolve manually.`,
                  requestId: req.id,
                };
                send(IPC_CHANNELS.GIT_RECOVERY_NOTE, note);
              } else {
                try {
                  await git.checkoutExistingBranch(req.baseBranch!);
                  const note: GitRecoveryNote = {
                    level: 'info',
                    message: `Returned to '${req.baseBranch}' after a previous session ended on '${req.branchName}'.`,
                    requestId: req.id,
                  };
                  send(IPC_CHANNELS.GIT_RECOVERY_NOTE, note);
                } catch (err: any) {
                  console.error('[Git recovery] checkout failed:', err);
                }
              }
              break; // only handle whichever orphan we're currently on
            }
          }

          // 2. Pop owned stash if it's on top
          try {
            const popResult = await git.stashPopIfOwned('the-office:');
            if (!popResult.ok) {
              // Conflict — leave stash, surface warning
              const note: GitRecoveryNote = {
                level: 'warning',
                message:
                  'A stash from a previous request could not be restored automatically. Run `git stash pop` manually to recover your work.',
              };
              send(IPC_CHANNELS.GIT_RECOVERY_NOTE, note);
            }
          } catch (err) {
            console.error('[Git recovery] stash pop check failed:', err);
          }
        }
      }

      // Sub-project 6: write-through git identity to .git/config (best-effort)
      try {
        const currentState = projectManager.getProjectState(projectPath);
        const resolved = settingsStore.resolveIdentityForProject(currentState);
        if (resolved) {
          const gm = new GitManager(projectPath);
          if (await gm.isGitRepo()) {
            await writeRepoIdentity(gm.getSimpleGitInstance(), resolved);
          }
        }
      } catch (err) {
        console.warn('[OPEN_PROJECT] identity write-through failed:', err);
      }

      // Sub-project 3: resume any awaiting_review requests with a persisted plan
      if (requestStore) {
        const awaitingReview = requestStore.list().filter(
          (r) => r.status === 'awaiting_review' && r.plan,
        );
        for (const req of awaitingReview) {
          resumeAwaitingReview(req);
        }
      }

      // Auto-enter workshop mode for already-completed projects
      const openedState = projectManager.getProjectState(projectPath);

      // Crash recovery: reset in_progress scans so they retry
      if (openedState.scanStatus === 'in_progress') {
        projectManager.updateProjectState(projectPath, { scanStatus: 'pending' });
      }

      if (openedState.completedPhases?.includes('build') && openedState.mode !== 'workshop') {
        projectManager.updateProjectState(projectPath, {
          mode: 'workshop',
          scanStatus: 'done', // rely on imagine artifacts instead of a scan
        });
      }

      // Restore persisted waiting question (survives app restart)
      if (saved && saved.questions?.length) {
        // Set chat context so the USER_RESPONSE handler can persist the Q&A
        if (saved.phase) {
          setCurrentChatPhase(saved.phase);
          setCurrentChatAgentRole(saved.agentRole);
          const runNum = newChatStore.nextRunNumber(saved.phase, saved.agentRole);
          // Use the latest existing run (the one that asked the question), not a new one
          setCurrentChatRunNumber(Math.max(runNum - 1, 1));
        }

        // Register a pending entry that resumes the phase after the user answers
        pendingQuestions.set(saved.sessionId, {
          resolve: resolverForRestoredQuestion(saved, {
            toWarroom: () => { void handleStartWarroom(); },
            toBuild: () => { void handleStartBuild({
              modelPreset: 'default',
              retryLimit: 2,
              permissionMode: 'auto-all',
            }); },
            fallback: (phase) => { resumePhase(phase); },
          }),
          reject: () => {},
        });

        // Emit after a tick so the renderer's listeners are ready
        setTimeout(() => send(IPC_CHANNELS.AGENT_WAITING, saved), 100);
      }

      // Restore persisted warroom plan review (survives app restart)
      const savedReview = loadPendingReview(projectPath);
      if (savedReview) {
        try {
          const store = new ArtifactStore(projectPath);
          const planContent = store.readArtifact('plan.md');

          // Register a pending review that resumes warroom after the user responds
          setPendingReview({
            resolve: (response) => { resumeWarroomAfterReview(response); },
          });

          // Re-emit review + war table state so the overlay reappears
          setTimeout(() => {
            send(IPC_CHANNELS.WAR_TABLE_STATE, 'review');
            send(IPC_CHANNELS.WAR_TABLE_REVIEW_READY, {
              content: planContent,
              artifact: savedReview.artifact,
            });
          }, 100);
        } catch {
          // plan.md missing — stale review state, ignore
        }
      }

      // Push initial archivedRuns to any connected mobile client. resetTail
      // false because sub-project 2's snapshot sync has already seeded the
      // tail with live content; we don't want to clobber it.
      refreshMobileArchivedRuns(false);

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to open project';
      return { success: false, error: message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.CREATE_PROJECT, async (_event, name: string, projectPath: string) => {
    try {
      resetSessionState();
      projectManager.createProject(name, projectPath);
      setCurrentProjectDir(projectPath);
      setArtifactStore(new ArtifactStore(projectPath));
      setRequestStore(new RequestStore(projectPath));
      chatHistoryStore?.flush();
      setChatHistoryStore(new ChatHistoryStore(projectPath));

      // Greenfield git init (no-op for non-greenfield identity configs, handled in helper)
      const gg = new GreenfieldGit(
        projectPath,
        projectManager,
        settingsStore,
        (note) => send(IPC_CHANNELS.GREENFIELD_GIT_NOTE, note),
      );
      await gg.initializeOnCreation();

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create project';
      return { success: false, error: message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PICK_DIRECTORY, async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.CHECK_PROJECT_EXISTS, async (_event, projectPath: string) => {
    try {
      if (!fs.existsSync(projectPath)) {
        return { exists: false, fileCount: 0 };
      }
      const configPath = path.join(projectPath, '.the-office', 'config.json');
      if (fs.existsSync(configPath)) {
        return { exists: true, fileCount: 0 };
      }
      // Count non-trivial files so the "start fresh" modal can decide
      // whether to show its second confirmation
      const scanner = new ProjectScanner(projectPath);
      const tree = scanner.getFileTree(500);
      const TRIVIAL = new Set(['.DS_Store', '.gitignore', 'LICENSE', 'README.md']);
      const lines = tree.split('\n').filter(l => l && !l.startsWith('...'));
      const significantFiles = lines.filter(l => {
        const base = path.basename(l);
        return !TRIVIAL.has(base);
      });
      return { exists: false, fileCount: significantFiles.length };
    } catch (err) {
      console.error('[CHECK_PROJECT_EXISTS] Error:', err);
      return { exists: false, fileCount: 0 };
    }
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_DIRECTORY_AS_WORKSHOP, async (_event, projectPath: string) => {
    try {
      if (!fs.existsSync(projectPath)) {
        return { success: false, error: 'Directory does not exist' };
      }

      // Create minimal .the-office/config.json in Workshop mode
      const officeDir = path.join(projectPath, '.the-office');
      if (!fs.existsSync(officeDir)) {
        fs.mkdirSync(officeDir, { recursive: true });
      }
      const configPath = path.join(officeDir, 'config.json');
      const initialState = {
        name: path.basename(projectPath),
        path: projectPath,
        currentPhase: 'idle' as const,
        completedPhases: [],
        interrupted: false,
        introSeen: true,
        buildIntroSeen: false,
        mode: 'workshop' as const,
        scanStatus: 'pending' as const,
      };
      fs.writeFileSync(configPath, JSON.stringify(initialState, null, 2), 'utf-8');

      // Add to recent projects
      projectManager.addToRecentProjects(initialState.name, projectPath, null);

      // Proceed with the normal open flow (reuse the OPEN_PROJECT setup logic)
      resetSessionState();
      projectManager.openProject(projectPath);
      setCurrentProjectDir(projectPath);
      setArtifactStore(new ArtifactStore(projectPath));
      setRequestStore(new RequestStore(projectPath));
      chatHistoryStore?.flush();
      setChatHistoryStore(new ChatHistoryStore(projectPath));

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to open directory';
      return { success: false, error: message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_PROJECT_STATE, async () => {
    if (!currentProjectDir) {
      return { name: '', path: '', currentPhase: 'idle', completedPhases: [], interrupted: false, introSeen: true };
    }
    return projectManager.getProjectState(currentProjectDir);
  });

  ipcMain.handle(IPC_CHANNELS.MARK_INTRO_SEEN, async () => {
    if (!currentProjectDir) throw new Error('No project open');
    projectManager.updateProjectState(currentProjectDir, { introSeen: true });
  });

  // ── Chat History ──

  ipcMain.handle(IPC_CHANNELS.GET_CHAT_HISTORY, async (_event, phase: string) => {
    if (!currentProjectDir || !chatHistoryStore) return [];
    return chatHistoryStore.getPhaseHistory(phase as Phase);
  });

  // ── Artifacts ──

  ipcMain.handle(IPC_CHANNELS.READ_ARTIFACT, async (_event, filename: string) => {
    if (!artifactStore) return { error: 'No project open' };
    try {
      const content = artifactStore.readArtifact(filename);
      return { content };
    } catch {
      return { error: 'Artifact not found' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_ARTIFACT_STATUS, async () => {
    if (!artifactStore) return {};
    const filenames = ['01-vision-brief.md', '02-prd.md', '03-market-analysis.md', '04-system-design.md'];
    const status: Record<string, boolean> = {};
    for (const f of filenames) {
      try {
        artifactStore.readArtifact(f);
        status[f] = true;
      } catch {
        status[f] = false;
      }
    }
    return status;
  });

  // ── Layouts ──

  ipcMain.handle(IPC_CHANNELS.GET_LAYOUTS, async () => {
    const layoutsPath = path.join(dataDir, 'layouts.json');
    try {
      if (fs.existsSync(layoutsPath)) {
        return JSON.parse(fs.readFileSync(layoutsPath, 'utf-8'));
      }
    } catch {
      // Corrupted file — return null to use defaults
    }
    return null;
  });

  ipcMain.handle(IPC_CHANNELS.SAVE_LAYOUTS, async (_event, layouts: Record<string, unknown>) => {
    const layoutsPath = path.join(dataDir, 'layouts.json');
    fs.writeFileSync(layoutsPath, JSON.stringify(layouts, null, 2), 'utf-8');
  });
}
