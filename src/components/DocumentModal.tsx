// src/components/DocumentModal.tsx

import { useState, useEffect, useRef } from 'react';
import { fetchDocument, fetchDocumentText, fetchNodeDetails } from '../api';
import type { Document } from '../types';

interface DocumentModalProps {
  docId: string;
  highlightTerm: string | null;
  secondaryHighlightTerm?: string | null;
  searchKeywords?: string;
  timeScope: 'pre-OBBBA' | 'post-OBBBA';
  onTimeScopeChange: (scope: 'pre-OBBBA' | 'post-OBBBA') => void;
  onClose: () => void;
}

interface MatchPosition {
  index: number;
  term: string;
  type: 'primary' | 'secondary' | 'search';
  percentage: number;
}

const COMMON_WORDS = new Set([
  'the', 'and', 'or', 'to', 'from', 'in', 'on', 'at', 'by', 'for', 'with',
  'about', 'as', 'into', 'through', 'during', 'before', 'after', 'above',
  'below', 'between', 'under', 'since', 'without', 'within', 'of', 'off',
  'out', 'over', 'up', 'down', 'near', 'along', 'among', 'across', 'behind',
  'beyond', 'plus', 'except', 'but', 'per', 'via', 'upon', 'against',
]);

export default function DocumentModal({
  docId,
  highlightTerm,
  secondaryHighlightTerm,
  searchKeywords,
  timeScope,
  onTimeScopeChange,
  onClose,
}: DocumentModalProps) {
  const [document, setDocument] = useState<Document | null>(null);
  const [documentText, setDocumentText] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matchPositions, setMatchPositions] = useState<MatchPosition[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  const matchRefs = useRef<Map<number, HTMLElement>>(new Map());

  useEffect(() => {
  let active = true;

  const loadDocument = async () => {
    setLoading(true);
    setError(null);

    try {
      const [doc, textData, nodeDetails] = await Promise.all([
        fetchDocument(docId, timeScope),
        fetchDocumentText(docId, timeScope),
        fetchNodeDetails(docId, timeScope),
      ]);

      if (!active) return;

      setDocument({
        ...doc,
        title: nodeDetails?.title,
        subtitle: nodeDetails?.subtitle,
        full_name: nodeDetails?.full_name,
        text: nodeDetails?.text,
        part: nodeDetails?.part,
        chapter: nodeDetails?.chapter,
        subchapter: nodeDetails?.subchapter,
        section: nodeDetails?.section,
        subsection: nodeDetails?.subsection,
        display_label: nodeDetails?.display_label,
        index_heading: nodeDetails?.index_heading,
      });

      setDocumentText(textData.text);
    } catch (err: any) {
      // Ignore request cancellations (common during rapid timeScope switching)
      if (err?.name === 'AbortError') return;

      console.error('Error loading document:', err);
      if (!active) return;

      setError(err instanceof Error ? err.message : 'Failed to load section text');
    } finally {
      if (active) setLoading(false);
    }
  };

  loadDocument();

  return () => {
    active = false;
  };
}, [docId, timeScope]);

  useEffect(() => {
  matchRefs.current.clear();
}, [docId, timeScope]);

  useEffect(() => {
    if (!documentText) return;

    const positions: MatchPosition[] = [];
    const textLength = documentText.length;

    const searchPatterns: string[] = [];
    const primaryPatterns: string[] = [];
    const secondaryPatterns: string[] = [];

    if (searchKeywords) {
      searchKeywords.split(',').forEach((keyword) => {
        const trimmed = keyword.trim();
        if (trimmed.length > 0) {
          searchPatterns.push(trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        }
      });
    }

    if (highlightTerm) {
      primaryPatterns.push(highlightTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      highlightTerm.split(/\s+/).forEach((word) => {
        if (word.length >= 3 && !COMMON_WORDS.has(word.toLowerCase())) {
          primaryPatterns.push(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        }
      });
    }

    if (secondaryHighlightTerm) {
      secondaryPatterns.push(secondaryHighlightTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      secondaryHighlightTerm.split(/\s+/).forEach((word) => {
        if (word.length >= 3 && !COMMON_WORDS.has(word.toLowerCase())) {
          secondaryPatterns.push(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        }
      });
    }

    if (searchPatterns.length > 0) {
      const regex = new RegExp(`(${searchPatterns.join('|')})`, 'gi');
      let match;
      while ((match = regex.exec(documentText)) !== null) {
        positions.push({
          index: match.index,
          term: match[0],
          type: 'search',
          percentage: (match.index / textLength) * 100,
        });
      }
    }

    if (primaryPatterns.length > 0) {
      const regex = new RegExp(`(${primaryPatterns.join('|')})`, 'gi');
      let match;
      while ((match = regex.exec(documentText)) !== null) {
        positions.push({
          index: match.index,
          term: match[0],
          type: 'primary',
          percentage: (match.index / textLength) * 100,
        });
      }
    }

    if (secondaryPatterns.length > 0) {
      const regex = new RegExp(`(${secondaryPatterns.join('|')})`, 'gi');
      let match;
      while ((match = regex.exec(documentText)) !== null) {
        positions.push({
          index: match.index,
          term: match[0],
          type: 'secondary',
          percentage: (match.index / textLength) * 100,
        });
      }
    }

    positions.sort((a, b) => a.index - b.index);
    setMatchPositions(positions);
  }, [documentText, highlightTerm, secondaryHighlightTerm, searchKeywords]);

  const scrollToMatch = (index: number) => {
    const element = matchRefs.current.get(index);
    if (element && contentRef.current) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const highlightText = (
    text: string,
    term: string | null,
    secondaryTerm: string | null,
    searchTerms: string | null,
  ): JSX.Element[] => {
    if (!term && !secondaryTerm && !searchTerms) {
      return [<span key="0">{text}</span>];
    }

    try {
      const patterns: string[] = [];
      const searchWords = new Set<string>();
      const primaryWords = new Set<string>();
      const secondaryWords = new Set<string>();

      if (searchTerms) {
        searchTerms.split(',').forEach((keyword) => {
          const trimmed = keyword.trim();
          if (trimmed.length > 0) {
            searchWords.add(trimmed.toLowerCase());
            patterns.push(trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
          }
        });
      }

      if (term) {
        patterns.push(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        term.split(/\s+/).forEach((word) => {
          if (word.length >= 3 && !COMMON_WORDS.has(word.toLowerCase())) {
            primaryWords.add(word.toLowerCase());
            patterns.push(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
          }
        });
      }

      if (secondaryTerm) {
        patterns.push(secondaryTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        secondaryTerm.split(/\s+/).forEach((word) => {
          if (word.length >= 3 && !COMMON_WORDS.has(word.toLowerCase())) {
            secondaryWords.add(word.toLowerCase());
            patterns.push(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
          }
        });
      }

      const regex = new RegExp(`(${patterns.join('|')})`, 'gi');
      const parts = text.split(regex);

      let currentIndex = 0;

      return parts.map((part, index) => {
        const partLower = part.toLowerCase();
        const partStart = currentIndex;
        currentIndex += part.length;

        let isSearchMatch = false;
        for (const searchWord of searchWords) {
          if (partLower.includes(searchWord) || searchWord.includes(partLower)) {
            isSearchMatch = true;
            break;
          }
        }

        if (isSearchMatch) {
          return (
            <mark
              key={index}
              ref={(el) => {
                if (el) matchRefs.current.set(partStart, el);
              }}
              className="bg-green-300 text-black font-semibold px-1 rounded"
            >
              {part}
            </mark>
          );
        }

        if (term && (partLower === term.toLowerCase() || primaryWords.has(partLower))) {
          return (
            <mark
              key={index}
              ref={(el) => {
                if (el) matchRefs.current.set(partStart, el);
              }}
              className="bg-yellow-400 text-black px-1 rounded"
            >
              {part}
            </mark>
          );
        }

        if (
          secondaryTerm &&
          (partLower === secondaryTerm.toLowerCase() || secondaryWords.has(partLower))
        ) {
          return (
            <mark
              key={index}
              ref={(el) => {
                if (el) matchRefs.current.set(partStart, el);
              }}
              className="bg-orange-300 text-black px-1 rounded"
            >
              {part}
            </mark>
          );
        }

        return <span key={index}>{part}</span>;
      });
    } catch {
      return [<span key="0">{text}</span>];
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col relative border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-700 flex justify-between items-start">
          <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
  <h2 className="text-2xl font-semibold text-blue-400">
    {document?.display_label || document?.name || document?.doc_id || docId}
  </h2>

  <span
    className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${
      timeScope === 'pre-OBBBA'
        ? 'bg-gray-700 text-gray-200'
        : 'bg-purple-600 text-white'
    }`}
  >
    {timeScope === 'pre-OBBBA' ? 'Pre-OBBBA' : 'Post-OBBBA'}
  </span>

  <div className="ml-auto flex gap-2">
    <button
      type="button"
      onClick={(e) => {
  e.stopPropagation();
  onTimeScopeChange('pre-OBBBA');
}}
      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
        timeScope === 'pre-OBBBA'
          ? 'bg-blue-600 text-white'
          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
      }`}
    >
      Pre
    </button>
    <button
      type="button"
      onClick={(e) => {
  e.stopPropagation();
  onTimeScopeChange('post-OBBBA');
}}
      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
        timeScope === 'post-OBBBA'
          ? 'bg-purple-600 text-white'
          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
      }`}
    >
      Post
    </button>
  </div>
</div>

          
            {document && (document.title || document.part || document.chapter || document.subchapter || document.section) && (
              <div className="space-y-1 text-sm text-gray-300 mb-3 font-mono">
                {document.title && (
                  <div>
                    <span className="text-gray-500">Title:</span> {document.title}
                  </div>
                )}
                {document.subtitle && (
                  <div>
                    <span className="text-gray-500">Subtitle:</span> {document.subtitle}
                  </div>
                )}
                {document.part && (
                  <div>
                    <span className="text-gray-500">Part:</span> {document.part}
                  </div>
                )}
                {document.chapter && (
                  <div>
                    <span className="text-gray-500">Chapter:</span> {document.chapter}
                  </div>
                )}
                {document.subchapter && (
                  <div>
                    <span className="text-gray-500">Subchapter:</span> {document.subchapter}
                  </div>
                )}
                {document.section && (
                  <div>
                    <span className="text-gray-500">Section:</span> {document.section}
                  </div>
                )}
                {document.subsection && (
                  <div>
                    <span className="text-gray-500">Subsection:</span> {document.subsection}
                  </div>
                )}
                {document.index_heading && document.index_heading.trim() !== '' && (
                  <div>
                    <span className="text-gray-500">Heading:</span> {document.index_heading}
                  </div>
                )}
              </div>
            )}
            
            {document && document.full_name && !document.title && !document.section && (
              <h3 className="text-lg font-medium text-gray-400 mb-1">
                {document.full_name}
              </h3>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-4 text-gray-400 hover:text-white text-2xl leading-none transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 pr-12 relative" ref={contentRef}>
          {!loading && !error && matchPositions.length > 0 && (
            <div className="absolute right-4 top-0 bottom-0 w-3 bg-gray-700/50 rounded-full pointer-events-none z-10">
              {matchPositions.map((match, idx) => (
                <button
                  key={idx}
                  onClick={() => scrollToMatch(match.index)}
                  className={`absolute w-3 h-3 rounded-full transform transition-all hover:scale-150 pointer-events-auto ${
                    match.type === 'search'
                      ? 'bg-green-300 hover:bg-green-200'
                      : match.type === 'primary'
                      ? 'bg-yellow-400 hover:bg-yellow-300'
                      : 'bg-orange-300 hover:bg-orange-200'
                  }`}
                  style={{ top: `${match.percentage}%` }}
                  title={`${match.term} (${idx + 1}/${matchPositions.length})`}
                />
              ))}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-400">Loading section text...</div>
            </div>
          )}

          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded p-4 text-red-300">
              {error}
            </div>
          )}

          {!loading && !error && (!documentText || documentText.trim() === '') && (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-400 text-center">
                <p className="text-lg">Full text for this node is not available.</p>
              </div>
            </div>
          )}

          {!loading && !error && documentText && documentText.trim() !== '' && (
            <div className="prose prose-invert max-w-none">
              <div className="whitespace-pre-wrap text-gray-300 leading-relaxed font-mono text-sm">
                {highlightText(
                  documentText,
                  highlightTerm,
                  secondaryHighlightTerm || null,
                  searchKeywords || null,
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-700 flex justify-between items-center">
          <div className="text-sm text-gray-500 flex gap-4">
            {searchKeywords && (
              <span>
                <span className="inline-block bg-green-300 text-black font-semibold px-2 py-0.5 rounded text-xs mr-1">
                  Search keywords
                </span>
              </span>
            )}
            {highlightTerm && (
              <span>
                <span className="inline-block bg-yellow-400 text-black px-2 py-0.5 rounded text-xs mr-1">
                  {highlightTerm}
                </span>
              </span>
            )}
            {secondaryHighlightTerm && (
              <span>
                <span className="inline-block bg-orange-300 text-black px-2 py-0.5 rounded text-xs mr-1">
                  {secondaryHighlightTerm}
                </span>
              </span>
            )}
          </div>
          <button
            onClick={(e) => {
  e.stopPropagation();
  onClose();
}}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
