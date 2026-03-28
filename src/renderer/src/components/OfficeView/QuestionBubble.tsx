import type { AskQuestion } from '@shared/types';

interface QuestionBubbleProps {
  question: AskQuestion;
  accentColor: string;
  isExpanded: boolean;
  onSelect: (label: string) => void;
}

const styles = {
  questionBubble: (accentColor: string) => ({
    background: '#151528',
    borderRadius: '8px',
    padding: '12px',
    border: `1px solid ${accentColor}44`,
    borderLeft: `3px solid ${accentColor}`,
  }),
  questionText: (isExpanded: boolean) => ({
    fontSize: isExpanded ? '13px' : '11px',
    color: '#e2e8f0',
    fontWeight: 600,
    marginBottom: '10px',
  }),
  questionOption: (isExpanded: boolean) => ({
    padding: isExpanded ? '10px 14px' : '8px 12px',
    fontSize: isExpanded ? '12px' : '11px',
    background: '#1a1a3e',
    border: '1px solid #333',
    borderRadius: '8px',
    color: '#cbd5e1',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontFamily: 'inherit',
  }),
  questionOptionsGrid: (isExpanded: boolean) => ({
    display: isExpanded ? 'grid' : 'flex',
    gridTemplateColumns: isExpanded ? '1fr 1fr' : undefined,
    flexDirection: isExpanded ? undefined : ('column' as const),
    gap: '6px',
  }),
  questionHint: (accentColor: string) => ({
    fontSize: '10px',
    color: accentColor,
    fontStyle: 'italic',
    marginTop: '8px',
  }),
  expandedQuestionCard: (isRecommended: boolean, accentColor: string) => ({
    padding: '14px 16px',
    background: isRecommended ? '#1a1a2e' : '#151528',
    border: isRecommended ? `1px solid ${accentColor}88` : '1px solid #333',
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    transition: 'border-color 0.15s',
  }),
  expandedCardLabel: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#e2e8f0',
  },
  expandedCardDescription: {
    fontSize: '12px',
    color: '#94a3b8',
    lineHeight: 1.4,
  },
  expandedCardTradeoffs: {
    fontSize: '11px',
    color: '#64748b',
    lineHeight: 1.4,
    fontStyle: 'italic' as const,
  },
  expandedCardBadge: (accentColor: string) => ({
    display: 'inline-block',
    fontSize: '9px',
    fontWeight: 700,
    color: accentColor,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '2px',
  }),
};

export function QuestionBubble({ question, accentColor, isExpanded, onSelect }: QuestionBubbleProps) {
  return (
    <div
      className="bubble-waiting"
      style={{
        ...styles.questionBubble(accentColor),
        '--accent-color': accentColor,
      } as React.CSSProperties}
    >
      <div style={styles.questionText(isExpanded)}>
        {question.question}
      </div>

      {isExpanded ? (
        /* Expanded mode: rich cards with description, tradeoffs, recommendation */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {question.options.map((opt) => {
            const isRecommended = question.recommendation === opt.label;
            return (
              <button
                key={opt.label}
                onClick={() => onSelect(opt.label)}
                style={styles.expandedQuestionCard(isRecommended, accentColor)}
              >
                {isRecommended && (
                  <span style={styles.expandedCardBadge(accentColor)}>
                    ★ Recommended
                  </span>
                )}
                <span style={styles.expandedCardLabel}>{opt.label}</span>
                {opt.description && (
                  <span style={styles.expandedCardDescription}>{opt.description}</span>
                )}
                {opt.tradeoffs && (
                  <span style={styles.expandedCardTradeoffs}>{opt.tradeoffs}</span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        /* Compact mode: label-only buttons */
        <div style={styles.questionOptionsGrid(false)}>
          {question.options.map((opt) => (
            <button
              key={opt.label}
              onClick={() => onSelect(opt.label)}
              title={opt.description}
              style={styles.questionOption(false)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      <div style={styles.questionHint(accentColor)}>
        Click to select or type your own answer
      </div>
    </div>
  );
}
