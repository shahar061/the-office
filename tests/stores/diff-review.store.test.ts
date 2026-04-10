import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useDiffReviewStore } from '../../src/renderer/src/stores/diff-review.store';

const mockGetRequestDiff = vi.fn();
const mockAcceptRequest = vi.fn();
const mockRejectRequest = vi.fn();

beforeEach(() => {
  (global as any).window = (global as any).window ?? {};
  (global as any).window.office = {
    getRequestDiff: mockGetRequestDiff,
    acceptRequest: mockAcceptRequest,
    rejectRequest: mockRejectRequest,
  };
  useDiffReviewStore.getState().clearSelection();
  mockGetRequestDiff.mockReset();
  mockAcceptRequest.mockReset();
  mockRejectRequest.mockReset();
});

afterEach(() => {
  useDiffReviewStore.getState().clearSelection();
});

describe('useDiffReviewStore', () => {
  it('starts idle', () => {
    const state = useDiffReviewStore.getState();
    expect(state.activeRequestId).toBeNull();
    expect(state.diff).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.expandedFiles.size).toBe(0);
    expect(state.confirmRejectOpen).toBe(false);
  });

  it('selectRequest sets loading then populates diff on success', async () => {
    const fakeDiff = { files: [], totalFilesChanged: 0, totalInsertions: 0, totalDeletions: 0 };
    mockGetRequestDiff.mockResolvedValueOnce({ ok: true, diff: fakeDiff });

    await useDiffReviewStore.getState().selectRequest('req-001');
    const state = useDiffReviewStore.getState();
    expect(state.activeRequestId).toBe('req-001');
    expect(state.diff).toEqual(fakeDiff);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('selectRequest sets error on failure', async () => {
    mockGetRequestDiff.mockResolvedValueOnce({ ok: false, error: 'bad branch' });
    await useDiffReviewStore.getState().selectRequest('req-002');
    const state = useDiffReviewStore.getState();
    expect(state.error).toBe('bad branch');
    expect(state.diff).toBeNull();
    expect(state.loading).toBe(false);
  });

  it('toggleExpandFile adds and removes paths', () => {
    useDiffReviewStore.getState().toggleExpandFile('src/a.ts');
    expect(useDiffReviewStore.getState().expandedFiles.has('src/a.ts')).toBe(true);
    useDiffReviewStore.getState().toggleExpandFile('src/a.ts');
    expect(useDiffReviewStore.getState().expandedFiles.has('src/a.ts')).toBe(false);
  });

  it('openRejectConfirm / closeRejectConfirm toggle the flag', () => {
    useDiffReviewStore.getState().openRejectConfirm();
    expect(useDiffReviewStore.getState().confirmRejectOpen).toBe(true);
    useDiffReviewStore.getState().closeRejectConfirm();
    expect(useDiffReviewStore.getState().confirmRejectOpen).toBe(false);
  });

  it('accept clears selection on success', async () => {
    const fakeDiff = { files: [], totalFilesChanged: 0, totalInsertions: 0, totalDeletions: 0 };
    mockGetRequestDiff.mockResolvedValueOnce({ ok: true, diff: fakeDiff });
    mockAcceptRequest.mockResolvedValueOnce({ ok: true, mergedAt: 12345 });

    await useDiffReviewStore.getState().selectRequest('req-001');
    await useDiffReviewStore.getState().accept();

    const state = useDiffReviewStore.getState();
    expect(state.activeRequestId).toBeNull();
    expect(state.diff).toBeNull();
    expect(mockAcceptRequest).toHaveBeenCalledWith('req-001');
  });

  it('accept sets error on failure, keeps selection', async () => {
    const fakeDiff = { files: [], totalFilesChanged: 0, totalInsertions: 0, totalDeletions: 0 };
    mockGetRequestDiff.mockResolvedValueOnce({ ok: true, diff: fakeDiff });
    mockAcceptRequest.mockResolvedValueOnce({ ok: false, error: 'conflict', conflict: true });

    await useDiffReviewStore.getState().selectRequest('req-001');
    await useDiffReviewStore.getState().accept();

    const state = useDiffReviewStore.getState();
    expect(state.activeRequestId).toBe('req-001');
    expect(state.error).toBe('conflict');
    expect(state.accepting).toBe(false);
  });

  it('reject clears selection on success', async () => {
    const fakeDiff = { files: [], totalFilesChanged: 0, totalInsertions: 0, totalDeletions: 0 };
    mockGetRequestDiff.mockResolvedValueOnce({ ok: true, diff: fakeDiff });
    mockRejectRequest.mockResolvedValueOnce({ ok: true });

    await useDiffReviewStore.getState().selectRequest('req-001');
    useDiffReviewStore.getState().openRejectConfirm();
    await useDiffReviewStore.getState().reject();

    const state = useDiffReviewStore.getState();
    expect(state.activeRequestId).toBeNull();
    expect(state.confirmRejectOpen).toBe(false);
    expect(mockRejectRequest).toHaveBeenCalledWith('req-001');
  });

  it('clearSelection resets everything', async () => {
    const fakeDiff = { files: [], totalFilesChanged: 0, totalInsertions: 0, totalDeletions: 0 };
    mockGetRequestDiff.mockResolvedValueOnce({ ok: true, diff: fakeDiff });
    await useDiffReviewStore.getState().selectRequest('req-001');
    useDiffReviewStore.getState().toggleExpandFile('a.ts');
    useDiffReviewStore.getState().openRejectConfirm();
    useDiffReviewStore.getState().clearSelection();

    const state = useDiffReviewStore.getState();
    expect(state.activeRequestId).toBeNull();
    expect(state.diff).toBeNull();
    expect(state.expandedFiles.size).toBe(0);
    expect(state.confirmRejectOpen).toBe(false);
  });
});
