import React, { Component, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ── Error Boundary ──────────────────────────────────────────────────────────

interface ErrorBoundaryState {
  hasError: boolean;
}

class MarkdownErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

// ── Styles ──────────────────────────────────────────────────────────────────

const wrapperStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#cbd5e1',
  lineHeight: 1.5,
  wordBreak: 'break-word',
};

const tableWrapperStyle: React.CSSProperties = {
  overflowX: 'auto',
  maxWidth: '100%',
  margin: '8px 0',
};

const tableStyle: React.CSSProperties = {
  borderCollapse: 'collapse',
  width: '100%',
  fontSize: '11px',
};

const theadStyle: React.CSSProperties = {
  background: '#151528',
};

const thStyle: React.CSSProperties = {
  border: '1px solid #333',
  padding: '6px 10px',
  textAlign: 'left',
  fontWeight: 600,
  color: '#e2e8f0',
};

const tdStyle: React.CSSProperties = {
  border: '1px solid #333',
  padding: '6px 10px',
  color: '#cbd5e1',
};

const preStyle: React.CSSProperties = {
  background: '#1a1a2e',
  borderRadius: '6px',
  padding: '10px',
  overflowX: 'auto',
  margin: '8px 0',
};

const blockCodeStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: '11px',
  color: '#e2e8f0',
  background: 'none',
};

const inlineCodeStyle: React.CSSProperties = {
  background: '#2a2a4a',
  padding: '1px 5px',
  borderRadius: '3px',
  fontSize: '11px',
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
};

const linkStyle: React.CSSProperties = {
  color: '#6366f1',
  textDecoration: 'underline',
  cursor: 'pointer',
};

const blockquoteStyle: React.CSSProperties = {
  borderLeft: '3px solid #4a4a6a',
  paddingLeft: '10px',
  margin: '6px 0',
  color: '#94a3b8',
};

const hrStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid #333',
  margin: '8px 0',
};

const pStyle: React.CSSProperties = {
  margin: '4px 0',
  lineHeight: 1.5,
};

const headingStyles: Record<string, React.CSSProperties> = {
  h1: { fontSize: '14px', fontWeight: 700, color: '#e2e8f0', margin: '10px 0 4px' },
  h2: { fontSize: '13px', fontWeight: 700, color: '#e2e8f0', margin: '8px 0 4px' },
  h3: { fontSize: '12px', fontWeight: 600, color: '#e2e8f0', margin: '6px 0 4px' },
  h4: { fontSize: '12px', fontWeight: 600, color: '#94a3b8', margin: '4px 0 2px' },
  h5: { fontSize: '12px', fontWeight: 600, color: '#94a3b8', margin: '4px 0 2px' },
  h6: { fontSize: '12px', fontWeight: 600, color: '#94a3b8', margin: '4px 0 2px' },
};

const listStyle: React.CSSProperties = {
  margin: '4px 0',
  paddingLeft: '20px',
};

const liStyle: React.CSSProperties = {
  margin: '2px 0',
  color: '#cbd5e1',
};

// ── Component Overrides ─────────────────────────────────────────────────────

const components = {
  table({ children, ...rest }: any) {
    return (
      <div style={tableWrapperStyle}>
        <table style={tableStyle} {...rest}>{children}</table>
      </div>
    );
  },
  thead({ children, ...rest }: any) {
    return <thead style={theadStyle} {...rest}>{children}</thead>;
  },
  th({ children, ...rest }: any) {
    return <th style={thStyle} {...rest}>{children}</th>;
  },
  td({ children, ...rest }: any) {
    return <td style={tdStyle} {...rest}>{children}</td>;
  },
  pre({ children, ...rest }: any) {
    return <pre style={preStyle} {...rest}>{children}</pre>;
  },
  code({ children, className, ...rest }: any) {
    const isBlock = Boolean(className);
    return (
      <code style={isBlock ? blockCodeStyle : inlineCodeStyle} {...rest}>
        {children}
      </code>
    );
  },
  a({ href, children, ...rest }: any) {
    return (
      <a
        href={href}
        style={linkStyle}
        onClick={(e: React.MouseEvent) => {
          e.preventDefault();
          if (href) window.office.openExternal(href);
        }}
        {...rest}
      >
        {children}
      </a>
    );
  },
  blockquote({ children, ...rest }: any) {
    return <blockquote style={blockquoteStyle} {...rest}>{children}</blockquote>;
  },
  strong({ children, ...rest }: any) {
    return <strong style={{ fontWeight: 700, color: '#e2e8f0' }} {...rest}>{children}</strong>;
  },
  em({ children, ...rest }: any) {
    return <em style={{ fontStyle: 'italic' }} {...rest}>{children}</em>;
  },
  del({ children, ...rest }: any) {
    return <del style={{ color: '#94a3b8', textDecoration: 'line-through' }} {...rest}>{children}</del>;
  },
  hr(rest: any) {
    return <hr style={hrStyle} {...rest} />;
  },
  p({ children, ...rest }: any) {
    return <p style={pStyle} {...rest}>{children}</p>;
  },
  h1({ children, ...rest }: any) { return <h1 style={headingStyles.h1} {...rest}>{children}</h1>; },
  h2({ children, ...rest }: any) { return <h2 style={headingStyles.h2} {...rest}>{children}</h2>; },
  h3({ children, ...rest }: any) { return <h3 style={headingStyles.h3} {...rest}>{children}</h3>; },
  h4({ children, ...rest }: any) { return <h4 style={headingStyles.h4} {...rest}>{children}</h4>; },
  h5({ children, ...rest }: any) { return <h5 style={headingStyles.h5} {...rest}>{children}</h5>; },
  h6({ children, ...rest }: any) { return <h6 style={headingStyles.h6} {...rest}>{children}</h6>; },
  ul({ children, ...rest }: any) { return <ul style={listStyle} {...rest}>{children}</ul>; },
  ol({ children, ...rest }: any) { return <ol style={listStyle} {...rest}>{children}</ol>; },
  li({ children, ...rest }: any) { return <li style={liStyle} {...rest}>{children}</li>; },
};

// ── MarkdownContent ──────────────────────────────────────────────────────────

interface MarkdownContentProps {
  text: string;
}

const MarkdownContent = React.memo(function MarkdownContent({ text }: MarkdownContentProps) {
  const fallback = <span style={{ ...wrapperStyle, whiteSpace: 'pre-wrap' as const }}>{text}</span>;

  return (
    <MarkdownErrorBoundary fallback={fallback}>
      <div style={wrapperStyle}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {text}
        </ReactMarkdown>
      </div>
    </MarkdownErrorBoundary>
  );
});

export { MarkdownContent };
