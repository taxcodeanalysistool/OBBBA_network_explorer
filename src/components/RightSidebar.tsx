// src/components/RightSidebar.tsx

import { useState, useEffect } from 'react';
import { searchActors, fetchNodeDetails } from '../api';
import type { Relationship, Actor, GraphNode } from '../types';
import DocumentModal from './DocumentModal';

interface RightSidebarProps {
  selectedActor: string | null;
  relationships: Relationship[];
  totalRelationships: number;
  onClose: () => void;
  yearRange: [number, number];
  keywords?: string;
  timeScope: 'pre-OBBBA' | 'post-OBBBA';
  onTimeScopeChange: (scope: 'pre-OBBBA' | 'post-OBBBA') => void;
}

export default function RightSidebar({
  selectedActor,
  relationships,
  totalRelationships,
  onClose,
  keywords,
  timeScope,
  onTimeScopeChange,
}: RightSidebarProps) {
  const [expandedRelId, setExpandedRelId] = useState<number | null>(null);
  const [documentToView, setDocumentToView] = useState<string | null>(null);
  const [filterActor, setFilterActor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Actor[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [nodeDetails, setNodeDetails] = useState<Record<string, GraphNode | null>>({});
  const [displayLabels, setDisplayLabels] = useState<Record<string, string>>({});
  const [selectedActorDisplayLabel, setSelectedActorDisplayLabel] = useState<string | null>(null);
  const [selectedActorDetails, setSelectedActorDetails] = useState<GraphNode | null>(null);

  const getNodeTypeColor = (type?: string): string => {
    const colors: Record<string, string> = {
      'index': '#9B96C9',
      'section': '#9B96C9',
      'entity': '#F0A734',
      'concept': '#F0A734',
    };
    return colors[type || ''] || '#AFBBE8';
  };

  const getNodeTypeFromRel = (nodeId?: string): string | undefined => {
    if (nodeId && nodeDetails[nodeId]) {
      return nodeDetails[nodeId]?.node_type;
    }

    if (nodeId) {
      const parts = nodeId.split(':');
      if (parts.length > 0) {
        return parts[0];
      }
    }

    return undefined;
  };

  const fetchDisplayLabel = async (nodeId: string) => {
    if (displayLabels[nodeId]) return;
    
    try {
      const details = await fetchNodeDetails(nodeId);
      if (details?.node_type === 'index' && details.display_label) {
        setDisplayLabels(prev => ({ ...prev, [nodeId]: details.display_label }));
      }
    } catch (err) {
      console.error('Failed to fetch display label:', nodeId);
    }
  };


  useEffect(() => {
    const fetchSelectedActorLabel = async () => {
      if (!selectedActor) {
        setSelectedActorDisplayLabel(null);
        setSelectedActorDetails(null);
        return;
      }
      
      try {
        const details = await fetchNodeDetails(selectedActor);
        
        setSelectedActorDetails(details);
        
        if (details?.node_type === 'index' && details.display_label) {
          setSelectedActorDisplayLabel(details.display_label);
        } else {
          setSelectedActorDisplayLabel(null);
        }
      } catch (err) {
        console.error('Failed to fetch display label for selected actor:', err);
        setSelectedActorDisplayLabel(null);
        setSelectedActorDetails(null);
      }
    };
    
    fetchSelectedActorLabel();
  }, [selectedActor]);

  useEffect(() => {
    const performSearch = async () => {
      if (searchQuery.trim().length < 2) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const results = await searchActors(searchQuery);
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
  }, [searchQuery]);

  useEffect(() => {
    const fetchAllLabels = async () => {
      const nodeIds = new Set<string>();
      
      relationships.forEach(rel => {
        if (rel.actor_id) nodeIds.add(rel.actor_id);
        if (rel.target_id) nodeIds.add(rel.target_id);
      });
      
      for (const nodeId of nodeIds) {
        if (!displayLabels[nodeId]) {
          fetchDisplayLabel(nodeId);
        }
      }
    };
    
    if (relationships.length > 0) {
      fetchAllLabels();
    }
  }, [relationships, displayLabels]);

  const filteredRelationships = filterActor
    ? relationships.filter(rel =>
        rel.actor === filterActor || rel.target === filterActor
      )
    : relationships;

  const sortedRelationships = [...filteredRelationships].sort((a, b) => {
    if (!a.timestamp && !b.timestamp) return 0;
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return a.timestamp.localeCompare(b.timestamp);
  });

  const toggleExpand = async (rel: Relationship) => {
    if (expandedRelId === rel.id) {
      setExpandedRelId(null);
      return;
    }

    setExpandedRelId(rel.id);

    const isActorSelected = rel.actor_id === selectedActor;
    const neighborId = isActorSelected ? rel.target_id : rel.actor_id;
    if (!neighborId) return;


    if (nodeDetails[neighborId] === undefined) {
      try {
        const details = await fetchNodeDetails(neighborId);
        setNodeDetails(prev => ({ ...prev, [neighborId]: details }));
        
        if (details?.node_type === 'index' && details.display_label) {
          setDisplayLabels(prev => ({ ...prev, [neighborId]: details.display_label }));
        }
      } catch (err) {
        console.error('Failed to fetch node details:', err);
        setNodeDetails(prev => ({ ...prev, [neighborId]: null }));
      }
    }
  };

  if (!selectedActor) {
    return null;
  }

  return (
    <>
      <div className="w-96 bg-gray-800 border-l border-gray-700 flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b border-gray-700">
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <h2 className="text-lg font-semibold text-blue-400">Node relationships</h2>
              </div>
              
              <div className="mt-2">
                <p className="text-sm text-white font-medium">
                  {selectedActorDisplayLabel || selectedActor}
                </p>
                {selectedActorDetails && (
                  <p className="text-xs text-gray-400">
                    {selectedActorDetails.node_type === 'index' ? 'USC Section' : 
                     selectedActorDetails.node_type === 'entity' ? 'Entity' :
                     selectedActorDetails.node_type === 'concept' ? 'Concept' :
                     selectedActorDetails.node_type}
                  </p>
                )}
              </div>
              
              <p className="text-xs text-gray-500 mt-1">
                Showing {sortedRelationships.length} of {totalRelationships} relationships
              </p>
              
              <div className="mt-3 space-y-2">
                {selectedActorDetails && (selectedActorDetails.node_type === 'section' || selectedActorDetails.node_type === 'index') && (
                  <button
                    onClick={() => setDocumentToView(selectedActorDetails.id)}
                    className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-white font-medium transition-colors w-full"
                  >
                    View full text
                  </button>
                )}
                
                {selectedActorDetails && selectedActorDetails.node_type === 'concept' && selectedActorDetails.properties?.definition && (
                  <div className="p-2 bg-blue-900/20 border border-blue-700/30 rounded">
                    <div className="text-xs text-blue-400 font-semibold mb-1">Definition:</div>
                    <div className="text-xs text-gray-300">{selectedActorDetails.properties.definition}</div>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors ml-2"
            >
              ✕
            </button>
          </div>

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
                <label className="block text-xs text-gray-400 mb-1">
                  Filter by another node:
                </label>
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
                      <div className="px-2 py-1 text-xs text-gray-400">
                        Searching...
                      </div>
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
                      <div className="px-2 py-1 text-xs text-gray-400">
                        No nodes found
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sortedRelationships.length === 0 ? (
            <p className="text-gray-500 text-sm p-4">No relationships found</p>
          ) : (
            sortedRelationships.map((rel, index) => {
              const isExpanded = expandedRelId === rel.id;
              const isActorSelected = rel.actor_id === selectedActor;

              const neighborId = isActorSelected
                ? (rel.target_id ?? rel.target)
                : (rel.actor_id ?? rel.actor);
              const neighborDetails = nodeDetails[neighborId];

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
                            style={{ color: getNodeTypeColor(rel.actor_type || getNodeTypeFromRel(rel.actor_id)) }}
                          >
                            {displayLabels[rel.actor_id || rel.actor] || rel.actor}
                          </span>
                          <span className="text-gray-400 text-xs">
                            {rel.action}
                          </span>
                          <span 
                            className="font-medium"
                            style={{ color: getNodeTypeColor(rel.target_type || getNodeTypeFromRel(rel.target_id)) }}
                          >
                            {displayLabels[rel.target_id || rel.target] || rel.target}
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
                        <div className="text-xs text-gray-500">
                          Loading node details...
                        </div>
                      )}

                      {neighborDetails && (neighborDetails.node_type === 'section' || neighborDetails.node_type === 'index') && (
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
                          
                          {neighborDetails.section_heading && (
                            <div className="text-xs text-white">
                              {neighborDetails.section_num && (
                                <span className="font-semibold">
                                  § {neighborDetails.section_num}{' '}
                                </span>
                              )}
                              {neighborDetails.section_heading}
                            </div>
                          )}
                          
                          <div className="text-xs text-gray-400">
                            {(neighborDetails.title || neighborDetails.part || neighborDetails.chapter || neighborDetails.subchapter || neighborDetails.section) && (
                              <div className="mb-1">
                                <span className="font-semibold">Location:</span>{' '}
                                {neighborDetails.title && `Title ${neighborDetails.title}`}
                                {neighborDetails.part && `, Part ${neighborDetails.part}`}
                                {neighborDetails.chapter && `, Chapter ${neighborDetails.chapter}`}
                                {neighborDetails.subchapter && `, Subchapter ${neighborDetails.subchapter}`}
                                {neighborDetails.section && `, Section ${neighborDetails.section}`}
                              </div>
                            )}
                            
                            {neighborDetails.title_num && (
                              <div className="mb-1">
                                <span className="font-semibold">Title:</span>{' '}
                                {neighborDetails.title_num}
                                {neighborDetails.title_heading && ` – ${neighborDetails.title_heading}`}
                              </div>
                            )}
                            {neighborDetails.tags && (
                              <div className="mt-1">
                                <span className="font-semibold">Tags:</span>{' '}
                                {neighborDetails.tags}
                              </div>
                            )}
                            {neighborDetails.terms && (
                              <div className="mt-1">
                                <span className="font-semibold">Key terms:</span>{' '}
                                {neighborDetails.terms}
                              </div>
                            )}
                          </div>
                          
                          <button
                            onClick={() => setDocumentToView(neighborDetails.id)}
                            className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-white font-medium transition-colors w-full"
                          >
                            View full text
                          </button>
                        </div>
                      )}

                      {neighborDetails && neighborDetails.node_type === 'entity' && (
                        <div className="space-y-2">
                          <div className="text-xs text-gray-400 mb-1">Entity details</div>
                          
                          <div className="font-semibold text-sm text-white">
                            {neighborDetails.name}
                          </div>
                          
                          {neighborDetails.properties?.definition && (
                            <div className="p-2 bg-blue-900/20 border border-blue-700/30 rounded">
                              <div className="text-xs text-blue-400 font-semibold mb-1">Definition:</div>
                              <div className="text-xs text-gray-300">{neighborDetails.properties.definition}</div>
                            </div>
                          )}
                          
                          <div className="text-xs text-gray-400">
                            {neighborDetails.department && (
                              <div className="mb-1">
                                <span className="font-semibold">Department:</span>{' '}
                                {neighborDetails.department}
                              </div>
                            )}
                            {neighborDetails.total_mentions != null && (
                              <div className="mb-1">
                                <span className="font-semibold">Total mentions:</span>{' '}
                                {neighborDetails.total_mentions}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {neighborDetails && neighborDetails.node_type === 'concept' && (
                        <div className="space-y-2">
                          <div className="text-xs text-gray-400 mb-1">Concept details</div>
                          
                          <div className="font-semibold text-sm text-white">
                            {neighborDetails.name}
                          </div>
                          
                          {neighborDetails.properties?.definition && (
                            <div className="p-2 bg-blue-900/20 border border-blue-700/30 rounded">
                              <div className="text-xs text-blue-400 font-semibold mb-1">Definition:</div>
                              <div className="text-xs text-gray-300">{neighborDetails.properties.definition}</div>
                            </div>
                          )}
                        </div>
                      )}

                      {neighborDetails &&
                        neighborDetails.node_type !== 'section' &&
                        neighborDetails.node_type !== 'index' &&
                        neighborDetails.node_type !== 'entity' &&
                        neighborDetails.node_type !== 'concept' && (
                          <div className="text-xs text-gray-400">
                            <div className="mb-1">
                              <span className="font-semibold">Node:</span> {neighborDetails.name}
                            </div>
                            <div>
                              <span className="font-semibold">Type:</span>{' '}
                              {neighborDetails.node_type ?? 'unknown'}
                            </div>
                          </div>
                        )}

                      {neighborDetails === null && (
                        <div className="text-xs text-gray-500">
                          No additional details available for this node.
                        </div>
                      )}
                    </div>
                  )}

                  {index < sortedRelationships.length - 1 && (
                    <div className="border-b border-gray-700" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {documentToView && (
        <DocumentModal
          docId={documentToView}
          highlightTerm={selectedActor}
          secondaryHighlightTerm={null}
          searchKeywords={keywords}
          timeScope={timeScope}
          onTimeScopeChange={onTimeScopeChange}
          onClose={() => setDocumentToView(null)}
        />
      )}
    </>
  );
}
