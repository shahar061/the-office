import React from 'react';
import { MarkdownContent } from './MarkdownContent';

const plainTextStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#cbd5e1',
  lineHeight: 1.5,
  wordBreak: 'break-word',
  whiteSpace: 'pre-wrap',
};

interface MessageRendererProps {
  text: string;
  role: 'user' | 'agent' | 'system';
}

const MessageRenderer = React.memo(function MessageRenderer({ text, role }: MessageRendererProps) {
  if (role !== 'agent') {
    return <span style={plainTextStyle}>{text}</span>;
  }
  return <MarkdownContent text={text} />;
});

export { MessageRenderer };
