import { useMemo } from 'react';
import { diff_match_patch } from 'diff-match-patch';

interface Props {
  beforeText: string;
  afterText: string;
}

export default function DiffViewer({ beforeText, afterText }: Props) {
  const diffSegments = useMemo(() => {
    const dmp = new diff_match_patch();

    // Word-level diff by tokenizing on whitespace
    const tokensA: string[] = [];
    const tokensB: string[] = [];
    const wordMap = new Map<string, string>();

    // Encode words to single unicode chars for dmp
    let charCode = 0xE000; // Private use area
    const encode = (text: string, tokens: string[]) => {
      return text.replace(/\S+|\s+/g, (token) => {
        if (!wordMap.has(token)) {
          const char = String.fromCharCode(charCode++);
          wordMap.set(token, char);
        }
        tokens.push(token);
        return wordMap.get(token)!;
      });
    };

    const encodedA = encode(beforeText, tokensA);
    const encodedB = encode(afterText, tokensB);

    const diffs = dmp.diff_main(encodedA, encodedB);
    dmp.diff_cleanupSemantic(diffs);

    // Decode back to words
    const reverseMap = new Map<string, string>();
    wordMap.forEach((char, word) => reverseMap.set(char, word));

    return diffs.map(([op, chars]) => ({
      op,
      text: chars.split('').map(c => reverseMap.get(c) ?? c).join(''),
    }));
  }, [beforeText, afterText]);

  return (
    <div className="whitespace-pre-wrap text-gray-300 leading-relaxed font-mono text-sm">
      {diffSegments.map((seg, i) => {
        if (seg.op === 0) {
          // Unchanged
          return <span key={i}>{seg.text}</span>;
        } else if (seg.op === 1) {
          // Insertion — green underline
          return (
            <ins
              key={i}
              style={{
                textDecoration: 'underline',
                textDecorationColor: '#4ade80',
                backgroundColor: 'rgba(74, 222, 128, 0.15)',
                color: '#86efac',
                textDecorationThickness: '2px',
              }}
              title="Added"
            >
              {seg.text}
            </ins>
          );
        } else {
          // Deletion — red strikethrough
          return (
            <del
              key={i}
              style={{
                textDecoration: 'line-through',
                textDecorationColor: '#f87171',
                backgroundColor: 'rgba(248, 113, 113, 0.15)',
                color: '#fca5a5',
                textDecorationThickness: '2px',
              }}
              title="Removed"
            >
              {seg.text}
            </del>
          );
        }
      })}
    </div>
  );
}
