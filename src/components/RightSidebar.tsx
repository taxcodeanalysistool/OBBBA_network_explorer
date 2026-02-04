// src/components/RightSidebar.tsx

import { useState, useEffect } from 'react';
import { searchActors, fetchNodeDetails } from '../api';
import type { Relationship, Actor, GraphNode, SelectedNode, TimeScope } from '../types';

interface RightSidebarProps {
  selectedNode: SelectedNode;
  relationships: Relationship[];
  totalRelationships: number;
  onClose: () => void;
  yearRange: [number, number];
  keywords?: string;
  timeScope: TimeScope;
  onTimeScopeChange: (scope: TimeScope) => void;
  onViewFullText: (docId: string) => void;
}

export default function RightSidebar({
  selectedNode,
  relationships,
  totalRelationships,
  onClose,
  keywords,
  timeScope,
  onTimeScopeChange,
  onViewFullText,
}: RightSidebarProps) {
  const [expandedRelId, setExpandedRelId] = useState<number | null>(null);
  const [filterActor, setFilterActor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Actor[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // allow "loading" sentinel
  const [nodeDetails, setNodeDetails] = useState<Record<string, GraphNode | null | undefined>>(
    {}
  );
  const [displayLabels, setDisplayLabels] = useState<Record<string, string>>({});

  const [selectedNodeDisplayLabel, setSelectedNodeDisplayLabel] = useState<string | null>(null);
  const [selectedNodeDetails, setSelectedNodeDetails] = useState<GraphNode | null>(null);
  const [isSelectedNodeLoading, setIsSelectedNodeLoading] = useState(false);

  const scopedKey = (id: string) => `${timeScope}::${id}`;

  const selectedNodeId = selectedNode?.id ?? null;
  const selectionScope = selectedNode?.scope ?? null;
  const isSelectionOutOfScope = !!selectedNode && selectionScope !== timeScope;

  const getNodeTypeColor = (type?: string): string => {
    const colors: Record<string, string> = {
      index: '#9B96C9',
      section: '#9B96C9',
      entity: '#F0A734',
      concept: '#F0A734',
    };
    return colors[type || ''] || '#AFBBE8';
  };

  const getNodeTypeFromRel = (nodeId?: string): string | undefined => {
    if (nodeId) {
      const k = scopedKey(nodeId);
      if (nodeDetails[k]) return nodeDetails[k]?.node_type;
    }

    if (nodeId) {
      const parts = nodeId.split(':');
      if (parts.length > 0) return parts[0];
    }

    return undefined;
  };

  const fetchDisplayLabel = async (nodeId: string) => {
    const k = scopedKey(nodeId);
    if (displayLabels[k]) return displayLabels[k];

    try {
      const details = await fetchNodeDetails(nodeId, selectionScope ?? timeScope);
      const label = details?.display_label;
      if (label) {
        setDisplayLabels((prev) => ({ ...prev, [k]: label }));
        return label;
      }
    } catch (err) {
      console.error('Failed to fetch display label:', nodeId, err);
    }

    return null;
  };

  useEffect(() => {
    const fetchSelectedNodeLabel = async () => {
      if (!selectedNodeId || isSelectionOutOfScope) {
        setSelectedNodeDisplayLabel(null);
        setSelectedNodeDetails(null);
        setIsSelectedNodeLoading(false);
        return;
      }

      setIsSelectedNodeLoading(true);
      try {
        const details = await fetchNodeDetails(selectedNodeId, selectionScope ?? timeScope);
        setSelectedNodeDetails(details ?? null);

        if (
          (details?.node_type === 'index' || details?.node_type === 'section') &&
          details.display_label
        ) {
          setSelectedNodeDisplayLabel(details.display_label);
        } else {
          setSelectedNodeDisplayLabel(null);
        }
      } catch (err) {
        console.error('Failed to fetch details for selected node:', err);
        setSelectedNodeDisplayLabel(null);
        setSelectedNodeDetails(null);
      } finally {
        setIsSelectedNodeLoading(false);
      }
    };

    fetchSelectedNodeLabel();
  }, [selectedNodeId, timeScope, isSelectionOutOfScope]);

  useEffect(() => {
    setExpandedRelId(null);
    setFilterActor(null);
    setSearchQuery('');
    setSearchResults([]);
  }, [timeScope]);

  useEffect(() => {
    const performSearch = async () => {
      if (searchQuery.trim().length < 2) {
        setSearchResults([]);
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
    const fetchAllLabels = async () => {
      const nodeIds = new Set<string>();

      relationships.forEach((rel) => {
        if (rel.actor_id) nodeIds.add(rel.actor_id);
        if (rel.target_id) nodeIds.add(rel.target_id);
      });

      for (const nodeId of nodeIds) {
        const k = scopedKey(nodeId);
        if (!displayLabels[k]) {
          fetchDisplayLabel(nodeId);
        }
      }
    };

    if (relationships.length > 0) {
      fetchAllLabels();
    }
    // intentionally NOT depending on displayLabels to avoid looping
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relationships, timeScope]);

  const filteredRelationships = filterActor
    ? relationships.filter((rel) => rel.actor === filterActor || rel.target === filterActor)
    : relationships;

  const sortedRelationships = [...filteredRelationships].sort((a, b) => {
    if (!a.timestamp && !b.timestamp) return 0;
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return a.timestamp.localeCompare(b.timestamp);
  });

  const toggleExpand = async (rel: Relationship) => {
  if (!selectedNodeId) return;

  if (expandedRelId === rel.id) {
    setExpandedRelId(null);
    return;
  }

  setExpandedRelId(rel.id);

  const isSelectedIsActorSide = rel.actor_id === selectedNodeId;
  const neighborId = isSelectedIsActorSide ? rel.target_id : rel.actor_id;
  if (!neighborId) return;

  const neighborKey = scopedKey(neighborId);

  // Check if key exists in the object
  if (neighborKey in nodeDetails) {
    const currentValue = nodeDetails[neighborKey];
    
    // If undefined, it's loading
    if (currentValue === undefined) {
      return;
    }
    
    // If null, we tried and it wasn't found
    if (currentValue === null) {
      return;
    }
    
    // If truthy object, already loaded
    return;
  }

  // Key doesn't exist yet, so start loading
  setNodeDetails((prev) => ({ ...prev, [neighborKey]: undefined }));

  try {
    const details = await fetchNodeDetails(neighborId, selectionScope ?? timeScope);
    setNodeDetails((prev) => ({ ...prev, [neighborKey]: details ?? null }));

    if (
      (details?.node_type === 'index' || details?.node_type === 'section') &&
      details.display_label
    ) {
      setDisplayLabels((prev) => ({ ...prev, [neighborKey]: details.display_label! }));
    }
  } catch (e) {
    console.error('Failed to fetch neighbor details', e);
    setNodeDetails((prev) => ({ ...prev, [neighborKey]: null }));
  }
};


  // Always render the sidebar shell; show content based on selection state.
  const headerTitle = !selectedNodeId
    ? 'Node relationships'
    : isSelectionOutOfScope
    ? 'Selection out of scope'
    : 'Node relationships';

  return (
    <div className="w-96 bg-gray-800 border-l border-gray-700 flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-gray-700">
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-blue-400">{headerTitle}</h2>

            {!selectedNodeId ? (
              <p className="text-sm text-gray-400 mt-2">Select a node to see its relationships.</p>
            ) : (
              <div className="mt-2">
                <p className="text-sm text-white font-medium">
                  {selectedNodeDisplayLabel || selectedNodeId}
                </p>

                {selectedNodeDetails && (
                  <p className="text-xs text-gray-400">
                    {selectedNodeDetails.node_type === 'index'
                      ? 'USC Section'
                      : selectedNodeDetails.node_type === 'entity'
                      ? 'Entity'
                      : selectedNodeDetails.node_type === 'concept'
                      ? 'Concept'
                      : selectedNodeDetails.node_type}
                  </p>
                )}

                <p className="text-xs text-gray-500 mt-1">
                  Showing {sortedRelationships.length} of {totalRelationships} relationships
                </p>

                {isSelectionOutOfScope && (
                  <div className="mt-3 p-2 bg-yellow-900/20 border border-yellow-700/30 rounded">
                    <div className="text-xs text-yellow-300 font-semibold">
                      You selected this node in {selectionScope === 'pre-OBBBA' ? 'Pre' : 'Post'}
                      -OBBBA.
                    </div>
                    <div className="text-xs text-gray-300 mt-1">
                      Switch back to that time scope to view its relationships, or click a node in
                      the current scope.
                    </div>
                  </div>
                )}

                {!isSelectionOutOfScope &&
                  selectedNodeDetails &&
                  (selectedNodeDetails.node_type === 'section' ||
                    selectedNodeDetails.node_type === 'index') && (
                    <button
                      onClick={() => onViewFullText(selectedNodeDetails.id)}
                      className="mt-3 text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-white font-medium transition-colors w-full"
                    >
                      View full text
                    </button>
                  )}

                {!isSelectionOutOfScope &&
                  selectedNodeDetails?.node_type === 'concept' &&
                  selectedNodeDetails.properties?.definition && (
                    <div className="mt-3 p-2 bg-blue-900/20 border border-blue-700/30 rounded">
                      <div className="text-xs text-blue-400 font-semibold mb-1">Definition:</div>
                      <div className="text-xs text-gray-300">
                        {selectedNodeDetails.properties.definition}
                      </div>
                    </div>
                  )}
              </div>
            )}
          </div>

          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors ml-2">
            ✕
          </button>
        </div>

        {/* Filter/search UI: only useful when there's a selection in-scope */}
        {!selectedNodeId || isSelectionOutOfScope ? null : (
          <div className="relative">
            {filterActor ? (
              <div className="flex items-center justify-between bg-blue-900/30 border border-blue-700/50 rounded px-2 py-1">
                <div>
                  <div className="text-xs text-gray-400">Filtered by node:</div>
                  <div className="text-sm text-blue-300 font-medium">{filterActor}</div>
                </div>
                <button
                  onClick={() => {
                    setFilterActor(null);
                    setSearchQuery('');
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Clear
                </button>
              </div>
            ) : (
              <>
                <label className="block text-xs text-gray-400 mb-1">Filter by another node:</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g., § 1, Secretary, income tax"
                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
                />

                {searchQuery.trim().length >= 2 && (
                  <div className="absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded shadow-lg max-h-40 overflow-y-auto">
                    {isSearching ? (
                      <div className="px-2 py-1 text-xs text-gray-400">Searching...</div>
                    ) : searchResults.length > 0 ? (
                      searchResults.map((actor) => (
                        <button
                          key={actor.id}
                          onClick={() => {
                            setFilterActor(actor.name);
                            setSearchQuery('');
                            setSearchResults([]);
                          }}
                          className="w-full px-2 py-1 text-left text-xs hover:bg-gray-600 transition-colors border-b border-gray-600 last:border-b-0"
                        >
                          <div className="font-medium text-white">{actor.name}</div>
                          <div className="text-xs text-gray-400">
                            {actor.connection_count} relationships
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-2 py-1 text-xs text-gray-400">No nodes found</div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {!selectedNodeId ? (
          <p className="text-gray-500 text-sm p-4">No node selected.</p>
        ) : isSelectedNodeLoading ? (
          <p className="text-gray-500 text-sm p-4">Loading node details…</p>
        ) : isSelectionOutOfScope ? (
          <p className="text-gray-500 text-sm p-4">
            No relationships to show because this node isn’t present in the current time scope.
          </p>
        ) : sortedRelationships.length === 0 ? (
          <p className="text-gray-500 text-sm p-4">No relationships found</p>
        ) : (
          sortedRelationships.map((rel, index) => {
            const isExpanded = expandedRelId === rel.id;
            const isSelectedIsActorSide = rel.actor_id === selectedNodeId;

            const neighborId = isSelectedIsActorSide
              ? rel.target_id ?? rel.target
              : rel.actor_id ?? rel.actor;

            const neighborKey = scopedKey(neighborId);
            const neighborDetails = nodeDetails[neighborKey];

            return (
              <div key={rel.id}>
                <div
                  onClick={() => toggleExpand(rel)}
                  className={`p-4 cursor-pointer hover:bg-gray-700/30 transition-colors ${
                    isExpanded ? 'bg-gray-700/20' : ''
                  }`}
                >
                  <div className="text-sm flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span
                          className="font-medium"
                          style={{
                            color: getNodeTypeColor(rel.actor_type || getNodeTypeFromRel(rel.actor_id)),
                          }}
                        >
                          {displayLabels[scopedKey(rel.actor_id || rel.actor)] || rel.actor}
                        </span>
                        <span className="text-gray-400 text-xs">{rel.action}</span>
                        <span
                          className="font-medium"
                          style={{
                            color: getNodeTypeColor(
                              rel.target_type || getNodeTypeFromRel(rel.target_id)
                            ),
                          }}
                        >
                          {displayLabels[scopedKey(rel.target_id || rel.target)] || rel.target}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {rel.edge_type?.replace(/_/g, ' ')}
                      </div>
                    </div>
                    <span className="text-gray-500 text-xs ml-2 flex-shrink-0">
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 bg-gray-700/10">
                    {neighborDetails === undefined && (
                      <div className="text-xs text-gray-500">Loading node details...</div>
                    )}

                    {neighborDetails &&
                      (neighborDetails.node_type === 'section' ||
                        neighborDetails.node_type === 'index') && (
                        <div className="space-y-2">
                          <div className="text-xs text-gray-400 mb-1">USC Section</div>

                          <div className="font-semibold text-sm text-white">
                            {neighborDetails.display_label || neighborDetails.name}
                          </div>

                          {(neighborDetails.properties?.full_name || neighborDetails.full_name) && (
                            <div className="text-xs text-white">
                              {neighborDetails.properties?.full_name || neighborDetails.full_name}
                            </div>
                          )}

                          <button
                            onClick={() => onViewFullText(neighborDetails.id)}
                            className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-white font-medium transition-colors w-full"
                          >
                            View full text
                          </button>
                        </div>
                      )}

                    {neighborDetails && neighborDetails.node_type === 'entity' && (
                      <div className="space-y-2">
                        <div className="text-xs text-gray-400 mb-1">Entity details</div>

                        <div className="font-semibold text-sm text-white">{neighborDetails.name}</div>

                        {neighborDetails.properties?.definition && (
                          <div className="p-2 bg-blue-900/20 border border-blue-700/30 rounded">
                            <div className="text-xs text-blue-400 font-semibold mb-1">
                              Definition:
                            </div>
                            <div className="text-xs text-gray-300">
                              {neighborDetails.properties.definition}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {neighborDetails && neighborDetails.node_type === 'concept' && (
                      <div className="space-y-2">
                        <div className="text-xs text-gray-400 mb-1">Concept details</div>

                        <div className="font-semibold text-sm text-white">{neighborDetails.name}</div>

                        {neighborDetails.properties?.definition && (
                          <div className="p-2 bg-blue-900/20 border border-blue-700/30 rounded">
                            <div className="text-xs text-blue-400 font-semibold mb-1">
                              Definition:
                            </div>
                            <div className="text-xs text-gray-300">
                              {neighborDetails.properties.definition}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {neighborDetails === null && (
                      <div className="text-xs text-gray-500">
                        No additional details available for this node.
                      </div>
                    )}
                  </div>
                )}

                {index < sortedRelationships.length - 1 && <div className="border-b border-gray-700" />}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
