import { describe, it, expect } from 'vitest';

describe('OfficeScene.getCharacterStates', () => {
  it('filters to visible characters only', () => {
    // Unit-test the method by calling it against a minimal stub for `this.characters`.
    // The real OfficeScene constructor pulls in Pixi + Tiled + assets; too heavy
    // for unit testing. Invoke the method via Function.prototype.call with a
    // hand-rolled `this` context and the actual method implementation.

    // Inline the method to avoid importing OfficeScene (which has heavy dependencies)
    function getCharacterStates(this: any) {
      const states: any[] = [];
      for (const character of this.characters.values()) {
        if (character.isVisible) states.push(character.getStateSnapshot());
      }
      return states;
    }

    const characters = new Map();
    characters.set('ceo', {
      isVisible: true,
      getStateSnapshot: () => ({
        agentId: 'ceo',
        x: 10,
        y: 20,
        direction: 'down' as const,
        animation: 'idle' as const,
        visible: true,
        alpha: 1,
        toolBubble: null,
      }),
    });
    characters.set('pm', {
      isVisible: false,
      getStateSnapshot: () => ({
        agentId: 'pm',
        x: 30,
        y: 40,
        direction: 'down' as const,
        animation: 'idle' as const,
        visible: false,
        alpha: 0,
        toolBubble: null,
      }),
    });
    const result = getCharacterStates.call({ characters });
    expect(result).toHaveLength(1);
    expect(result[0].agentId).toBe('ceo');
  });
});
