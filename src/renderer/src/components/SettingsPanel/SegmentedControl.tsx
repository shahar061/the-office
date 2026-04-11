import React, { useState } from 'react';
import { colors } from '../../theme';

interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  name: string;
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

const styles = {
  container: {
    display: 'inline-flex',
    alignSelf: 'flex-start',
    alignItems: 'stretch',
    background: colors.surfaceDark,
    border: `1px solid ${colors.borderLight}`,
    borderRadius: '6px',
    padding: '2px',
    height: '28px',
    width: 'fit-content',
    position: 'relative' as const,
  },
  cell: (selected: boolean, hovered: boolean) => ({
    position: 'relative' as const,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 14px',
    minWidth: '56px',
    height: '100%',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: selected ? 600 : 500,
    color: selected ? colors.text : colors.textMuted,
    cursor: selected ? 'default' : 'pointer',
    userSelect: 'none' as const,
    transition: 'background 120ms ease, color 120ms ease',
    background: selected
      ? `linear-gradient(180deg, ${colors.accent} 0%, ${colors.accentPurple} 100%)`
      : hovered
        ? 'rgba(99, 102, 241, 0.08)'
        : 'transparent',
    boxShadow: selected
      ? 'inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 0 0 1px rgba(59, 130, 246, 0.35)'
      : 'none',
  }),
  hiddenInput: {
    position: 'absolute' as const,
    opacity: 0,
    pointerEvents: 'none' as const,
    width: 0,
    height: 0,
    margin: 0,
  },
  label: {
    textTransform: 'capitalize' as const,
    letterSpacing: '0.2px',
  },
};

export function SegmentedControl<T extends string>({
  name,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const [hoveredValue, setHoveredValue] = useState<T | null>(null);

  return (
    <div
      role="radiogroup"
      aria-label={name}
      style={styles.container}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const hovered = hoveredValue === option.value && !selected;
        return (
          <label
            key={option.value}
            style={styles.cell(selected, hovered)}
            onMouseEnter={() => setHoveredValue(option.value)}
            onMouseLeave={() => setHoveredValue(null)}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
              style={styles.hiddenInput}
            />
            <span style={styles.label}>{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}
