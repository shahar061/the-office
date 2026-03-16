import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../../src/renderer/src/stores/ui.store';

describe('UIStore', () => {
  beforeEach(() => {
    useUIStore.setState({ isExpanded: false, activeTab: 'chat' });
  });

  it('defaults to collapsed with chat tab', () => {
    const state = useUIStore.getState();
    expect(state.isExpanded).toBe(false);
    expect(state.activeTab).toBe('chat');
  });

  it('toggleExpanded expands and defaults to chat tab', () => {
    useUIStore.getState().toggleExpanded();
    const state = useUIStore.getState();
    expect(state.isExpanded).toBe(true);
    expect(state.activeTab).toBe('chat');
  });

  it('toggleExpanded collapses when already expanded', () => {
    useUIStore.setState({ isExpanded: true, activeTab: 'office' });
    useUIStore.getState().toggleExpanded();
    const state = useUIStore.getState();
    expect(state.isExpanded).toBe(false);
  });

  it('toggleExpanded resets activeTab to chat when expanding', () => {
    useUIStore.setState({ isExpanded: false, activeTab: 'office' });
    useUIStore.getState().toggleExpanded();
    expect(useUIStore.getState().activeTab).toBe('chat');
  });

  it('setActiveTab changes the active tab', () => {
    useUIStore.getState().setActiveTab('office');
    expect(useUIStore.getState().activeTab).toBe('office');
    useUIStore.getState().setActiveTab('chat');
    expect(useUIStore.getState().activeTab).toBe('chat');
  });
});
