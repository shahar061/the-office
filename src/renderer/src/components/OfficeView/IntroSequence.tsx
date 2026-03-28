import { useState, useEffect, useCallback, useRef } from 'react';
import type { Phase } from '@shared/types';
import { colors } from '../../theme';

interface DialogueStep {
  text: string;
  highlights: Phase[];
  highlightChat?: boolean;
}

const DIALOGUE_STEPS: DialogueStep[] = [
  {
    text: 'Ah, a new project! *adjusts glasses*\nWelcome to The Office. I\'m the CEO \u2014 and we\'ve got quite the team here.',
    highlights: [],
  },
  {
    text: 'First, we Imagine \u2014 that\'s where I sit down with the leadership team and figure out exactly what we\'re building.',
    highlights: ['imagine'],
  },
  {
    text: 'Then the War Room turns it into a battle plan, and the engineers Build it. The whole team\'s had their coffee already.',
    highlights: ['imagine', 'warroom', 'build'],
  },
  {
    text: 'Over there is where we chat. You can talk to the team, answer their questions, and guide the project as it moves along.',
    highlights: [],
    highlightChat: true,
  },
  {
    text: 'So, what would you like to build?',
    highlights: [],
  },
];

const TYPEWRITER_SPEED = 30; // ms per character

interface IntroSequenceProps {
  onComplete: () => void;
  onHighlightChange: (phases: Phase[]) => void;
  onChatHighlightChange: (highlight: boolean) => void;
  onStepChange?: (step: number) => void;
}

export function IntroSequence({ onComplete, onHighlightChange, onChatHighlightChange, onStepChange }: IntroSequenceProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [displayedChars, setDisplayedChars] = useState(0);
  const [isTyping, setIsTyping] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentStep = DIALOGUE_STEPS[stepIndex];
  const fullText = currentStep.text;
  const visibleText = isTyping ? fullText.slice(0, displayedChars) : fullText;

  // Update phase and chat highlights when step changes
  useEffect(() => {
    onHighlightChange(currentStep.highlights);
    onChatHighlightChange(currentStep.highlightChat ?? false);
  }, [stepIndex, currentStep.highlights, currentStep.highlightChat, onHighlightChange, onChatHighlightChange]);

  // Notify parent of step changes (for fog of war + camera coordination)
  useEffect(() => {
    onStepChange?.(stepIndex);
  }, [stepIndex, onStepChange]);

  // Typewriter effect
  useEffect(() => {
    setDisplayedChars(0);
    setIsTyping(true);

    timerRef.current = setInterval(() => {
      setDisplayedChars((prev) => {
        if (prev >= fullText.length) {
          if (timerRef.current) clearInterval(timerRef.current);
          setIsTyping(false);
          return prev;
        }
        return prev + 1;
      });
    }, TYPEWRITER_SPEED);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [stepIndex, fullText]);

  const handleAdvance = useCallback(() => {
    if (isTyping) {
      // Skip to full text
      if (timerRef.current) clearInterval(timerRef.current);
      setDisplayedChars(fullText.length);
      setIsTyping(false);
      return;
    }

    // Advance to next step
    if (stepIndex < DIALOGUE_STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      onComplete();
    }
  }, [isTyping, stepIndex, fullText.length, onComplete]);

  // Keyboard handler
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleAdvance();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleAdvance]);

  return (
    <div style={introStyles.overlay} onClick={handleAdvance}>
      {/* Skip button */}
      <button
        style={introStyles.skipBtn}
        onClick={(e) => {
          e.stopPropagation();
          onComplete();
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = colors.text; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = colors.textDim; }}
      >
        Skip
      </button>

      {/* Dialogue box at bottom */}
      <div style={introStyles.dialogueBox}>
        <div style={introStyles.speakerLabel}>CEO</div>
        <div style={introStyles.dialogueText}>
          {visibleText.split('\n').map((line, i) => (
            <span key={i}>
              {i > 0 && <br />}
              {line}
            </span>
          ))}
        </div>
        {!isTyping && (
          <span className="blink-indicator" style={introStyles.advanceIndicator}>{'\u25BC'}</span>
        )}
      </div>
    </div>
  );
}

const introStyles = {
  overlay: {
    position: 'absolute' as const,
    inset: 0,
    background: 'linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.7) 100%)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: '24px',
    zIndex: 100,
    cursor: 'pointer',
  },
  skipBtn: {
    position: 'absolute' as const,
    top: '12px',
    right: '16px',
    background: 'rgba(0,0,0,0.4)',
    border: 'none',
    color: colors.textMuted,
    fontSize: '11px',
    cursor: 'pointer',
    padding: '4px 10px',
    borderRadius: '4px',
    zIndex: 101,
    fontFamily: 'inherit',
    transition: 'color 0.15s',
  },
  dialogueBox: {
    background: colors.surface,
    border: `2px solid ${colors.accent}`,
    borderRadius: '8px',
    padding: '12px 16px',
    maxWidth: '500px',
    width: '100%',
    position: 'relative' as const,
    marginBottom: '24px',
  },
  speakerLabel: {
    fontSize: '10px',
    color: colors.accent,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '4px',
  },
  dialogueText: {
    fontSize: '13px',
    color: colors.text,
    lineHeight: 1.5,
    minHeight: '40px',
  },
  advanceIndicator: {
    position: 'absolute' as const,
    bottom: '8px',
    right: '12px',
    fontSize: '10px',
    color: colors.accent,
  },
};
