// src/components/Sidebar.tsx

import { useState, useEffect, useRef } from 'react';
import { searchActors, fetchNodeDetails } from '../api';
import type { Stats, Actor, TagCluster, SelectedNode, TimeScope } from '../types';
import { exportGraphData, exportGraphImage } from '../utils/exportUtils';


interface SidebarProps {
  stats: Stats | null;
  selectedNode: SelectedNode;
  onNodeSelect: (nodeId: string | null) => void;
  limit: number;
  onLimitChange: (limit: number) => void;
  maxHops: number | null;
  onMaxHopsChange: (maxHops: number | null) => void;
  minDensity: number;
  onMinDensityChange: (density: number) => void;
  tagClusters: TagCluster[];
  enabledClusterIds: Set<number>;
  onToggleCluster: (clusterId: number) => void;
  enabledCategories: Set<string>;
  onToggleCategory: (category: string) => void;
  enabledNodeTypes: Set<string>;
  onToggleNodeType: (nodeType: string) => void;

  graphData?: { nodes: any[]; links: any[] } | null;
  svgElement?: SVGSVGElement | null;
  searchTerm?: string;

  showOnlyChangedNodes?: boolean;
  onToggleShowOnlyChangedNodes?: (show: boolean) => void;
  highlightChangedNodes?: boolean;
  onToggleHighlightChangedNodes?: (highlight: boolean) => void;
  enabledChangeTypes?: Set<string>;
  onToggleChangeType?: (changeType: string) => void;
  selectedBills?: Set<string>;
  onToggleSelectedBill?: (bill: string) => void;
  availableChangeTypes?: string[];
  availableBills?: string[];

  graphMetricsFilter?: { degree: number; pagerank: number; betweenness: number; eigenvector: number; };
  onGraphMetricsFilterChange?: (f: { degree: number; pagerank: number; betweenness: number; eigenvector: number; }) => void;

  yearRange: [number, number];
  onYearRangeChange: (range: [number, number]) => void;
  includeUndated: boolean;
  onIncludeUndatedChange: (include: boolean) => void;
  keywords: string;
  onKeywordsChange: (keywords: string) => void;
  buildMode: 'topDown' | 'bottomUp';
  onStartNewNetwork?: () => void;
  onResetToTopDown?: () => void;
  timeScope: TimeScope;
  selectedTitle: number;
  onSelectedTitleChange: (title: number) => void;
  onTimeScopeChange: (scope: TimeScope) => void;
  availableTitles: number[];
  onBottomUpSearch?: (params: {
    keywords: string;
    expansionDegree: number;
    maxNodes: number;
    nodeTypes: string[];
    edgeTypes: string[];
    searchFields: string[];
    searchLogic: 'AND' | 'OR';
    nodeRankingMode: 'global' | 'subgraph';
  }) => void;
  displayGraphInfo?: {
    nodeCount: number;
    linkCount: number;
    truncated: boolean;
    matchedCount: number;
  };
  topDownGraphInfo?: {
    nodeCount: number;
    linkCount: number;
  } | null;
}

function SelectedNodeBox({
  selectedNode,
  timeScope,
  onNodeSelect
}: {
  selectedNode: Exclude<SelectedNode, null>;
  timeScope: TimeScope;
  onNodeSelect: (nodeId: string | null) => void;
}) {
  const selectedNodeId = selectedNode.id;
  const selectionScope = selectedNode.scope;
  const isOutOfScope = selectionScope !== timeScope;

  const [displayLabel, setDisplayLabel] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchLabel = async () => {
      if (isOutOfScope) {
        setDisplayLabel(null);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const details = await fetchNodeDetails(selectedNodeId, timeScope);
        if ((details?.node_type === 'index' || details?.node_type === 'section') && details.display_label) {
          setDisplayLabel(details.display_label);
        } else {
          setDisplayLabel(null);
        }
      } catch (err) {
        console.error('Failed to fetch node details:', err);
        setDisplayLabel(null);
      } finally {
        setIsLoading(false);
      }
    };
    fetchLabel();
  }, [selectedNodeId, timeScope, isOutOfScope]);

  return (
    <div className="p-4 border-b border-gray-700 flex-shrink-0">
      <div className="flex items-center justify-between bg-blue-900/30 border border-blue-700/50 rounded-lg p-3">
        <div className="flex-1 mr-2">
          <div className="text-xs text-gray-400 mb-1">Selected node:</div>
          <div className="font-medium text-blue-300 break-words">
            {displayLabel || selectedNodeId}
          </div>
          {isOutOfScope && (
            <div className="text-xs text-yellow-300 mt-1">
              Selected in {selectionScope === 'pre-OBBBA' ? 'Pre' : 'Post'}-OBBBA.
            </div>
          )}
        </div>
        <button
          onClick={() => onNodeSelect(null)}
          className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs font-medium transition-colors text-white flex-shrink-0"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

export default function Sidebar({
  stats,
  selectedNode,
  onNodeSelect,
  limit,
  onLimitChange,
  maxHops,
  onMaxHopsChange,
  enabledCategories,
  onToggleCategory,
  enabledNodeTypes,
  onToggleNodeType,

  graphData = null,
  svgElement = null,
  searchTerm = '',

  showOnlyChangedNodes = false,
  onToggleShowOnlyChangedNodes,
  highlightChangedNodes = false,
  onToggleHighlightChangedNodes,
  enabledChangeTypes = new Set(),
  onToggleChangeType,
  selectedBills = new Set(),
  onToggleSelectedBill,
  availableChangeTypes = [],
  availableBills = [],
  graphMetricsFilter = { degree: 0, pagerank: 0, betweenness: 0, eigenvector: 0 },
onGraphMetricsFilterChange,

  buildMode,
  timeScope,
  onTimeScopeChange,
  selectedTitle,
  onSelectedTitleChange,
  availableTitles,
  onBottomUpSearch,
  displayGraphInfo,
  topDownGraphInfo
}: SidebarProps) {
  // ── UI state ──────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Actor[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [nodeTypesExpanded, setNodeTypesExpanded] = useState(false);
  const [graphSettingsExpanded, setGraphSettingsExpanded] = useState(true);
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [billChangesExpanded, setBillChangesExpanded] = useState(false);
  const [metricsExpanded, setMetricsExpanded] = useState(false);
  const [exportExpanded, setExportExpanded] = useState(false);
  const [localLimit, setLocalLimit] = useState(limit);
  const [localKeywords, setLocalKeywords] = useState('');
  const limitDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ── Export state ──────────────────────────────────────────────────────────
  const [exportFormat, setExportFormat] = useState<'separate' | 'edgelist'>('separate');
  const [isExporting, setIsExporting] = useState(false);

  // ── Search state ──────────────────────────────────────────────────────────
  const selectedNodeId = selectedNode?.id ?? null;
  const [expansionDegree, setExpansionDegree] = useState(1);
  const [searchFields] = useState<Set<string>>(
    new Set(['text', 'display_label', 'entity', 'concept', 'definition'])
  );
  const [searchLogic, setSearchLogic] = useState<'AND' | 'OR'>('OR');

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const performSearch = async () => {
      if (searchQuery.trim().length < 2) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      try {
        const results = await searchActors(searchQuery, timeScope);
        setSearchResults(results);
      } catch (error) {
        console.error('Search error:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };
    const timeoutId = setTimeout(performSearch, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, timeScope]);

  useEffect(() => {
    setLocalLimit(limit);
  }, [limit]);

  useEffect(() => {
    return () => {
      if (limitDebounceTimerRef.current) clearTimeout(limitDebounceTimerRef.current);
    };
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleLimitChange = (newLimit: number) => {
    setLocalLimit(newLimit);
    if (limitDebounceTimerRef.current) clearTimeout(limitDebounceTimerRef.current);
    limitDebounceTimerRef.current = setTimeout(() => {
      onLimitChange(newLimit);
    }, 2000);
  };

  const handleKeywordSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (onBottomUpSearch && localKeywords.trim()) {
      onBottomUpSearch({
        keywords: localKeywords,
        expansionDegree,
        maxNodes: maxHops || 2000,
        nodeTypes: Array.from(enabledNodeTypes),
        edgeTypes: Array.from(enabledCategories),
        searchFields: Array.from(searchFields),
        searchLogic,
        nodeRankingMode: 'global',
      });
    }
  };

  const handleExportCSV = async () => {
    if (!graphData || graphData.nodes.length === 0) {
      alert('No graph data to export.');
      return;
    }
    setIsExporting(true);
    try {
      exportGraphData(graphData, {
        format: exportFormat,
        year: timeScope,
        title: `Title ${selectedTitle}`,
        searchTerm: searchTerm || null,
      });
    } catch (err) {
      console.error('Export failed:', err);
      alert('❌ Export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPNG = async () => {
    if (!svgElement) {
      alert('Graph is not ready for export.');
      return;
    }
    setIsExporting(true);
    try {
      exportGraphImage(svgElement, {
        title: String(selectedTitle),
        timeScope,
        buildMode,
        nodeCount: graphData?.nodes.length || 0,
        selectedNode,
      });
    } catch (err) {
      console.error('PNG export failed:', err);
      alert('❌ PNG export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col h-screen overflow-hidden">

      {/* Header */}
      <div className="px-6 py-3 border-b border-gray-700 flex-shrink-0">
        <h1 className="font-bold text-blue-400" style={{ fontSize: '20px' }}>
          Title {selectedTitle} Network
        </h1>
        <p className="mt-1 text-xs text-gray-400">
          Sections in the U.S. Code (Title {selectedTitle})
        </p>
      </div>

      {/* Title selector */}
      <div className="px-4 py-3 border-b border-gray-700 flex-shrink-0">
        <label className="block text-sm text-gray-400 mb-2">Title:</label>
        <select
          value={selectedTitle}
          onChange={(e) => onSelectedTitleChange(Number(e.target.value))}
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-blue-500"
        >
          {availableTitles.length === 0 ? (
            <option value={selectedTitle}>Loading…</option>
          ) : (
            availableTitles.map((t) => (
              <option key={t} value={t}>Title {t}</option>
            ))
          )}
        </select>
      </div>

      {/* Node search */}
      <div className="py-3 border-b border-gray-700 flex-shrink-0">
        <div className="px-4 relative">
          <label className="block text-sm text-gray-400 mb-2">Search nodes:</label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="§ 1, Secretary, income tax…"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
          {searchQuery.trim().length >= 2 && (
            <div className="absolute z-10 left-4 right-4 mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {isSearching ? (
                <div className="px-3 py-2 text-sm text-gray-400">Searching...</div>
              ) : searchResults.length > 0 ? (
                searchResults.map((actor) => (
                  <button
                    key={actor.id}
                    onClick={() => {
                      onNodeSelect(actor.id);
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-600 transition-colors border-b border-gray-600 last:border-b-0"
                  >
                    <div className="font-medium text-white">{actor.name}</div>
                    <div className="text-xs text-gray-400">{actor.connection_count} relationships</div>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-sm text-gray-400">No nodes found</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="p-4 border-b border-gray-700 flex-shrink-0">
          <div className="space-y-2 text-sm">
            {((buildMode === 'topDown' && topDownGraphInfo && topDownGraphInfo.nodeCount > 0) ||
              (buildMode === 'bottomUp' && displayGraphInfo && displayGraphInfo.nodeCount > 0)) && (
              <div className="mb-3 p-2 bg-gray-900/50 rounded text-xs space-y-1 border border-gray-700">
                <div className="flex justify-between">
                  <span className="text-gray-100">Nodes displayed:</span>
                  <span className="font-mono text-green-400">
                    {buildMode === 'topDown'
                      ? topDownGraphInfo?.nodeCount.toLocaleString()
                      : displayGraphInfo?.nodeCount.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-100">Relationships displayed:</span>
                  <span className="font-mono text-green-400">
                    {buildMode === 'topDown'
                      ? topDownGraphInfo?.linkCount.toLocaleString()
                      : displayGraphInfo?.linkCount.toLocaleString()}
                  </span>
                </div>
                {buildMode === 'bottomUp' && displayGraphInfo?.truncated && (
                  <div className="text-yellow-400 text-xs mt-1">
                    ⚠️ Results truncated (matched {displayGraphInfo.matchedCount.toLocaleString()} nodes)
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-400">Total indexes:</span>
              <span className="font-mono text-blue-400">{stats.totalDocuments.count.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Total relationships:</span>
              <span className="font-mono text-purple-400">{stats.totalTriples.count.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Selected node */}
      {selectedNode && (
        <SelectedNodeBox
          selectedNode={selectedNode}
          timeScope={timeScope}
          onNodeSelect={onNodeSelect}
        />
      )}

      {/* Scrollable controls */}
      <div className="flex-1 overflow-y-auto">

        {/* Graph Settings */}
        <div className="p-4 border-b border-gray-700">
          <button
            onClick={() => setGraphSettingsExpanded(!graphSettingsExpanded)}
            className="w-full flex items-center justify-between text-base font-semibold mb-3 text-white hover:text-blue-400 transition-colors"
          >
            <span>Graph settings</span>
            <span className="text-sm">{graphSettingsExpanded ? '▼' : '▶'}</span>
          </button>
          {graphSettingsExpanded && (
            <>
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">
                  Maximum relationships: {localLimit.toLocaleString()}
                </label>
                <input
                  type="range" min="100" max="8000" step="100"
                  value={localLimit}
                  onChange={(e) => handleLimitChange(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>100</span><span>4000</span><span>8000</span>
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">
                  Maximum nodes: {maxHops === null ? '4000' : maxHops}
                </label>
                <input
                  type="range" min="100" max="4000" step="100"
                  value={maxHops === null ? 2000 : maxHops}
                  onChange={(e) => onMaxHopsChange(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>100</span><span>2000</span><span>4000</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Time scope */}
        <div className="px-4 py-3 border-b border-gray-700 flex-shrink-0">
          <div className="text-sm text-gray-400 mb-2">Time:</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onTimeScopeChange('pre-OBBBA')}
              className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                timeScope === 'pre-OBBBA'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              Pre-OBBBA
            </button>
            <button
              type="button"
              onClick={() => onTimeScopeChange('post-OBBBA')}
              className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                timeScope === 'post-OBBBA'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              Post-OBBBA
            </button>
          </div>
        </div>

        {/* Search / keyword */}
        <div className="p-4 border-b border-gray-700">
          <button
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            className="w-full flex items-center justify-between text-base font-semibold mb-3 text-white hover:text-blue-400 transition-colors"
          >
            <span>Search</span>
            <span className="text-sm">{filtersExpanded ? '▼' : '▶'}</span>
          </button>
          {filtersExpanded && (
            <>
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">
                  Degrees of connection: {expansionDegree}
                </label>
                <input
                  type="range" min="0" max="3" step="1"
                  value={expansionDegree}
                  onChange={(e) => setExpansionDegree(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0</span><span>1</span><span>2</span><span>3</span>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {expansionDegree === 0
                    ? 'Show only nodes matching the search'
                    : `Include nodes up to ${expansionDegree} connection${expansionDegree > 1 ? 's' : ''} away`}
                </p>
              </div>
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">Match logic:</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSearchLogic('OR')}
                    className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                      searchLogic === 'OR' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >ANY</button>
                  <button
                    type="button"
                    onClick={() => setSearchLogic('AND')}
                    className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                      searchLogic === 'AND' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >ALL</button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {searchLogic === 'OR'
                    ? 'Match nodes containing any keyword'
                    : 'Match nodes containing all keywords'}
                </p>
              </div>
              <form onSubmit={handleKeywordSubmit} className="mb-0">
                <label className="block text-sm text-gray-400 mb-2">Keyword search:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={localKeywords}
                    onChange={(e) => setLocalKeywords(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleKeywordSubmit()}
                    placeholder="tax, income, penalty"
                    className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-400 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-[#12B76A] hover:bg-[#0e9d5a] text-white"
                  >
                    Search
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Comma-separated keywords</p>
              </form>
            </>
          )}
        </div>

        {/* Index changes filters */}
        <div className="p-4 border-b border-gray-700">
          <button
            onClick={() => setBillChangesExpanded(!billChangesExpanded)}
            className="w-full flex items-center justify-between text-base font-semibold mb-3 text-white hover:text-blue-400 transition-colors"
          >
            <span>Legislative changes</span>
            <span className="text-sm">{billChangesExpanded ? '▼' : '▶'}</span>
          </button>

          {billChangesExpanded && (
            <>
              {/* Show only changed nodes */}
              <div className="mb-4">
                <label className="flex items-center text-sm text-gray-300 cursor-pointer hover:text-white transition-colors">
                  <input
                    type="checkbox"
                    checked={showOnlyChangedNodes}
                    onChange={(e) => onToggleShowOnlyChangedNodes?.(e.target.checked)}
                    className="mr-2 w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-800"
                  />
                  <span className="font-medium">Show only nodes with changes</span>
                </label>
              </div>

              {/* Highlight changed nodes */}
              <div className="mb-4">
                <label className="flex items-center text-sm text-gray-300 cursor-pointer hover:text-white transition-colors">
                  <input
                    type="checkbox"
                    checked={highlightChangedNodes}
                    onChange={(e) => onToggleHighlightChangedNodes?.(e.target.checked)}
                    className="mr-2 w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-800"
                  />
                  <span className="font-medium">Highlight changed nodes</span>
                </label>
                {highlightChangedNodes && (
                  <div className="mt-1 ml-6 text-xs text-gray-400 flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: '#9C3391' }}></span>
                    Magenta highlight
                  </div>
                )}
              </div>

              {/* Change type filter buttons */}
              {availableChangeTypes && availableChangeTypes.length > 0 ? (
                <>
                  <div className="flex gap-1.5 mb-3">
                    <button
                      disabled={!showOnlyChangedNodes}
                      onClick={() => {
                        if (!showOnlyChangedNodes) return;
                        availableChangeTypes.forEach(type => {
                          if (!enabledChangeTypes.has(type)) onToggleChangeType?.(type);
                        });
                      }}
                      className={`px-1.5 py-0.5 rounded transition-colors ${
                        showOnlyChangedNodes
                          ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                          : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                      }`}
                      style={{ fontSize: '9px' }}
                    >
                      Select all
                    </button>
                    <button
                      disabled={!showOnlyChangedNodes}
                      onClick={() => {
                        if (!showOnlyChangedNodes) return;
                        availableChangeTypes.forEach(type => {
                          if (enabledChangeTypes.has(type)) onToggleChangeType?.(type);
                        });
                      }}
                      className={`px-1.5 py-0.5 rounded transition-colors ${
                        showOnlyChangedNodes
                          ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                          : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                      }`}
                      style={{ fontSize: '9px' }}
                    >
                      Deselect all
                    </button>
                  </div>
                  <div className="space-y-2 mb-4">
                    {availableChangeTypes.map((changeType) => {
                      const isEnabled = enabledChangeTypes.has(changeType);
                      const labels: Record<string, string> = {
                        'addition':      'Additions',
                        'deletion':      'Deletions',
                        'transposition': 'Transpositions',
                        'amendment':     'Amendments',
                      };
                      const displayLabel = labels[changeType] || changeType.charAt(0).toUpperCase() + changeType.slice(1);
                      return (
                        <button
                          key={changeType}
                          disabled={!showOnlyChangedNodes}
                          onClick={() => {
                            if (!showOnlyChangedNodes) return;
                            onToggleChangeType?.(changeType);
                          }}
                          className={`w-full flex justify-between items-center rounded px-3 py-2 text-sm transition-colors ${
                            !showOnlyChangedNodes
                              ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                              : isEnabled
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                          }`}
                        >
                          <span>{displayLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}

              {/* Bills filter */}
              {availableBills && availableBills.length > 0 ? (
                <>
                  <label className="text-sm text-gray-400 mb-2 block">Public Laws:</label>
                  <div className="space-y-2">
                    {availableBills.map((bill) => {
                      const isEnabled = selectedBills.has(bill);
                      return (
                        <button
                          key={bill}
                          disabled={!showOnlyChangedNodes}
                          onClick={() => {
                            if (!showOnlyChangedNodes) return;
                            onToggleSelectedBill?.(bill);
                          }}
                          className={`w-full flex justify-between items-center rounded px-3 py-2 text-sm transition-colors ${
                            !showOnlyChangedNodes
                              ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                              : isEnabled
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                          }`}
                        >
                          <span className="font-mono text-xs">P.L. {bill}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}

              {/* No changes message */}
              {(!availableChangeTypes || availableChangeTypes.length === 0) &&
               (!availableBills || availableBills.length === 0) && (
                <div className="text-xs text-gray-500 italic">
                  No bill changes detected in current graph.
                </div>
              )}
            </>
          )}
        </div>

        {/* Network Metrics Filter */}
<div className="p-4 border-b border-gray-700">
  <button
    onClick={() => setMetricsExpanded(!metricsExpanded)}
    className="w-full flex items-center justify-between text-base font-semibold mb-3 text-white hover:text-blue-400 transition-colors"
  >
    <span>Network metrics</span>
    <span className="text-sm">{metricsExpanded ? '▼' : '▶'}</span>
  </button>

  {metricsExpanded && (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500">Filter nodes by minimum metric value</p>
        {Object.values(graphMetricsFilter).some(v => v > 0) && (
          <button
            onClick={() => onGraphMetricsFilterChange?.({ degree: 0, pagerank: 0, betweenness: 0, eigenvector: 0 })}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Reset
          </button>
        )}
      </div>

      {([
  { key: 'degree',      label: 'Degree',      min: 0,      max: 0.005,  step: 0.00001,  decimals: 5 },
  { key: 'pagerank',    label: 'PageRank',    min: 0,      max: 0.001, step: 0.00001, decimals: 5 },
  { key: 'betweenness', label: 'Betweenness', min: 0,      max: 0.01,  step: 0.0001,  decimals: 5 },
  { key: 'eigenvector', label: 'Eigenvector', min: 0,      max: 0.03,  step: 0.001,  decimals: 4 },
  { key: 'closeness',   label: 'Closeness',   min: 0,  max: 0.32,  step: 0.001,  decimals: 4 },
  { key: 'harmonic',    label: 'Harmonic',    min: 0,  max: 0.49,  step: 0.001,  decimals: 4 },
] as const).map(({ key, label, min, max, step, decimals }) => (
  <div key={key} className="mb-4">
    <div className="flex justify-between text-sm text-gray-400 mb-1">
      <span>{label}</span>
      <span className="font-mono text-xs">
        {graphMetricsFilter[key] > (key === 'closeness' || key === 'harmonic' ? min : 0)
          ? `≥ ${graphMetricsFilter[key].toFixed(decimals)}`
          : 'off'}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={graphMetricsFilter[key]}
      onChange={e => onGraphMetricsFilterChange?.({
        ...graphMetricsFilter,
        [key]: parseFloat(e.target.value),
      })}
      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
    />
  </div>
))}

    </div>
  )}
</div>


        {/* Node filters */}
        {stats && (
          <div className="p-4 border-b border-gray-700">
            <button
              onClick={() => setNodeTypesExpanded(!nodeTypesExpanded)}
              className="w-full flex items-center justify-between text-base font-semibold mb-3 text-white hover:text-blue-400 transition-colors"
            >
              <span>Node filters</span>
              <span className="text-sm">{nodeTypesExpanded ? '▼' : '▶'}</span>
            </button>
            {nodeTypesExpanded && (
              <>
                <div className="flex gap-1.5 mb-3">
                  <button
                    onClick={() => {
                      ['index', 'entity', 'concept'].forEach(type => {
                        if (!enabledNodeTypes.has(type)) onToggleNodeType(type);
                      });
                    }}
                    className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                    style={{ fontSize: '9px' }}
                  >Select all</button>
                  <button
                    onClick={() => {
                      ['index', 'entity', 'concept'].forEach(type => {
                        if (enabledNodeTypes.has(type)) onToggleNodeType(type);
                      });
                    }}
                    className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                    style={{ fontSize: '9px' }}
                  >Deselect all</button>
                </div>
                <div className="space-y-2">
                  {[
                    { type: 'index', label: 'Indexes' },
                    { type: 'entity', label: 'Entities' },
                    { type: 'concept', label: 'Concepts' },
                  ].map((item) => {
                    const isEnabled = enabledNodeTypes.has(item.type);
                    return (
                      <button
                        key={item.type}
                        onClick={() => onToggleNodeType(item.type)}
                        className={`w-full flex justify-between items-center rounded px-3 py-2 text-sm transition-colors ${
                          isEnabled
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                      >
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Relationship filters */}
        {stats && (
          <div className="p-4 border-b border-gray-700">
            <button
              onClick={() => setCategoriesExpanded(!categoriesExpanded)}
              className="w-full flex items-center justify-between text-base font-semibold mb-3 text-white hover:text-blue-400 transition-colors"
            >
              <span>Relationship filters</span>
              <span className="text-sm">{categoriesExpanded ? '▼' : '▶'}</span>
            </button>
            {categoriesExpanded && (
              <>
                <div className="flex gap-1.5 mb-3">
                  <button
                    onClick={() => {
                      stats.categories.forEach(cat => {
                        if (!enabledCategories.has(cat.category)) onToggleCategory(cat.category);
                      });
                    }}
                    className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                    style={{ fontSize: '9px' }}
                  >Select all</button>
                  <button
                    onClick={() => {
                      stats.categories.forEach(cat => {
                        if (enabledCategories.has(cat.category)) onToggleCategory(cat.category);
                      });
                    }}
                    className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                    style={{ fontSize: '9px' }}
                  >Deselect all</button>
                </div>
                <div className="space-y-2">
                  {stats.categories.map((cat) => {
                    const isEnabled = enabledCategories.has(cat.category);
                    const labels: Record<string, string> = {
                      'definition': 'Definition',
                      'reference':  'Reference',
                      'hierarchy':  'Hierarchy',
                    };
                    return (
                      <button
                        key={cat.category}
                        onClick={() => onToggleCategory(cat.category)}
                        className={`w-full flex justify-between items-center rounded px-3 py-2 text-sm transition-colors ${
                          isEnabled
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                      >
                        <span>{labels[cat.category] || cat.category.replace(/_/g, ' ')}</span>
                        <span className="font-mono text-xs">{cat.count.toLocaleString()}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Export */}
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={() => setExportExpanded(!exportExpanded)}
            className="w-full flex items-center justify-between text-base font-semibold mb-3 text-white hover:text-blue-400 transition-colors"
          >
            <span>Export</span>
            <span className="text-sm">{exportExpanded ? '▼' : '▶'}</span>
          </button>

          {exportExpanded && (
            <>
              {/* Format toggle */}
              <div className="mb-3">
                <label className="block text-xs text-gray-400 mb-1">CSV format:</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setExportFormat('separate')}
                    className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                      exportFormat === 'separate'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    Nodes + Links
                  </button>
                  <button
                    onClick={() => setExportFormat('edgelist')}
                    className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                      exportFormat === 'edgelist'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    Edge list
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {exportFormat === 'separate'
                    ? 'Two files: nodes CSV + links CSV'
                    : 'One file: combined source/target edge list'}
                </p>
              </div>

              {/* Count */}
              {graphData && graphData.nodes.length > 0 && (
                <div className="text-xs text-gray-400 mb-3">
                  {graphData.nodes.length.toLocaleString()} nodes · {graphData.links.length.toLocaleString()} links
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handleExportCSV}
                  disabled={isExporting || !graphData || graphData.nodes.length === 0}
                  className={`flex-1 px-3 py-2 rounded text-xs font-medium transition-colors ${
                    graphData && graphData.nodes.length > 0 && !isExporting
                      ? 'bg-green-700 hover:bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {isExporting ? '⏳…' : 'CSV'}
                </button>
                <button
                  onClick={handleExportPNG}
                  disabled={isExporting || !svgElement}
                  className={`flex-1 px-3 py-2 rounded text-xs font-medium transition-colors ${
                    svgElement && !isExporting
                      ? 'bg-purple-700 hover:bg-purple-600 text-white'
                      : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {isExporting ? '⏳…' : 'PNG'}
                </button>
              </div>

              {(!graphData || graphData.nodes.length === 0) && (
                <p className="text-xs text-gray-500 italic mt-2">
                  Load graph data to enable export.
                </p>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
}