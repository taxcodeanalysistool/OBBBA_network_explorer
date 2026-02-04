// src/App.tsx

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import NetworkGraph from './components/NetworkGraph';
import Sidebar from './components/Sidebar';
import RightSidebar from './components/RightSidebar';
import MobileBottomNav from './components/MobileBottomNav';
import { WelcomeModal } from './components/WelcomeModal';
import { NetworkBuilder } from './services/networkBuilder';
import DocumentModal from './components/DocumentModal';
import { fetchRelationships, fetchActorRelationships, fetchActorCounts } from './api';
import type {
  Stats,
  Relationship,
  TagCluster,
  NetworkBuilderState,
  FilteredGraph,
  GraphNode,
  GraphLink,
  TimeScope,
  SelectedNode,
} from './types';

function App() {
  const [buildMode, setBuildMode] = useState<'topDown' | 'bottomUp'>('topDown');
  const [timeScope, setTimeScope] = useState<TimeScope>('pre-OBBBA');
  const [openDocId, setOpenDocId] = useState<string | null>(null);
  const [fullGraph, setFullGraph] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({
    nodes: [],
    links: [],
  });

  const scopedFullGraph = useMemo(() => {
    const nodes = fullGraph.nodes.filter((n) => n.time === timeScope);
    const nodeIds = new Set(nodes.map((n) => n.id));

    const links = fullGraph.links.filter((l) => {
      const s = typeof l.source === 'string' ? l.source : l.source.id;
      const t = typeof l.target === 'string' ? l.target : l.target.id;
      return l.time === timeScope && nodeIds.has(s) && nodeIds.has(t);
    });

    return { nodes, links };
  }, [fullGraph, timeScope]);

  const [builder, setBuilder] = useState<NetworkBuilder | null>(null);
  const [displayGraph, setDisplayGraph] = useState<FilteredGraph>({
    nodes: [],
    links: [],
    truncated: false,
    matchedCount: 0,
  });

  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);

  const [displayGraphInfo, setDisplayGraphInfo] = useState<{
    nodeCount: number;
    linkCount: number;
    truncated: boolean;
    matchedCount: number;
  } | null>(null);

  const [topDownGraphInfo, setTopDownGraphInfo] = useState<{
    nodeCount: number;
    linkCount: number;
  } | null>(null);

  const [stats, setStats] = useState<Stats | null>(null);
  const [tagClusters] = useState<TagCluster[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [bottomUpSearchKeywords, setBottomUpSearchKeywords] = useState('');
  const [totalBeforeLimit, setTotalBeforeLimit] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<SelectedNode>(null);
  const [actorRelationships, setActorRelationships] = useState<Relationship[]>([]);
  const [actorTotalBeforeFilter, setActorTotalBeforeFilter] = useState<number>(0);
  const [limit, setLimit] = useState(4000);
  const [maxHops, setMaxHops] = useState<number | null>(2000);
  const [minDensity, setMinDensity] = useState(50);
  const [enabledClusterIds, setEnabledClusterIds] = useState<Set<number>>(new Set());
  const [enabledCategories, setEnabledCategories] = useState<Set<string>>(new Set());
  const [enabledNodeTypes, setEnabledNodeTypes] = useState<Set<string>>(new Set(['index']));
  const [yearRange] = useState<[number, number]>([1980, 2025]);
  const [includeUndated] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState<number>(26);
  const [keywords, setKeywords] = useState('');
  const [availableTitles, setAvailableTitles] = useState<number[]>([]);
  const [actorTotalCounts, setActorTotalCounts] = useState<Record<string, number>>({});
  const [manifestLoaded, setManifestLoaded] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => {
    return !localStorage.getItem('hasSeenWelcome');
  });
  const [isInitialized, setIsInitialized] = useState(false);

  // Used to stop flicker/clears while we switch scopes and rebuild bottomUp search.
  const [isSwitchingScope, setIsSwitchingScope] = useState(false);

  // This holds the *exact* bottomUp search params so we can re-run the same search in the new scope.
  const [bottomUpSearchParams, setBottomUpSearchParams] = useState<{
    keywords: string;
    expansionDegree: number;
    maxNodes: number;
    nodeTypes: string[];
    edgeTypes: string[];
    searchFields: string[];
    searchLogic: 'AND' | 'OR';
    nodeRankingMode: 'global' | 'subgraph';
  } | null>(null);

  // A monotonically increasing "request id" for bottomUp search reruns; prevents older results from winning.
  const bottomUpRunIdRef = useRef(0);

  const selectedNodeId = selectedNode?.id ?? null;

  const isSelectedInScope = !!selectedNode && selectedNode.scope === timeScope;

  const rightSidebarRelationships = isSelectedInScope ? actorRelationships : [];
  const rightSidebarTotal = isSelectedInScope ? actorTotalBeforeFilter : 0;

  const convertGraphToRelationships = useCallback(
    (nodes: GraphNode[], links: GraphLink[]): Relationship[] => {
      const nodeMap = new Map(nodes.map((n) => [n.id, n] as const));

      return links.map((link, idx) => {
        const s = typeof link.source === 'string' ? link.source : link.source.id;
        const t = typeof link.target === 'string' ? link.target : link.target.id;

        const sourceNode = nodeMap.get(s);
        const targetNode = nodeMap.get(t);

        return {
          id: idx,
          doc_id: sourceNode?.id || '',
          timestamp: (link as any).timestamp || null,
          actor: sourceNode?.name || sourceNode?.id || '',
          action: link.action || link.edge_type || 'relationship',
          target: targetNode?.name || targetNode?.id || '',
          location: (link as any).location || null,
          tags: [],
          actor_type: sourceNode?.node_type,
          target_type: targetNode?.node_type,
          actor_id: sourceNode?.id,
          target_id: targetNode?.id,
        };
      });
    },
    []
  );

  useEffect(() => {
    if (!manifestLoaded) return;

    const loadGraphData = async () => {
      try {
        setLoading(true);

        setIsInitialized(false);
        setStats(null);

        const apiModule = await import('./api');
        const data = await apiModule.loadGraph(selectedTitle);

        setFullGraph(data);


        // strongly recommended reset when switching titles
        setSelectedNode(null);
        setActorRelationships([]);
        setActorTotalBeforeFilter(0);
        setBottomUpSearchKeywords('');
        setBottomUpSearchParams(null);
        setDisplayGraphInfo(null);
        setTopDownGraphInfo(null);
      } catch (err) {
        console.error('Failed to load graph data:', err);
        setFullGraph({ nodes: [], links: [] });
      } finally {
        setLoading(false);
      }
    };

    loadGraphData();
  }, [selectedTitle, manifestLoaded]);

  useEffect(() => {
    setBuilder(new NetworkBuilder(scopedFullGraph.nodes, scopedFullGraph.links));
  }, [scopedFullGraph.nodes, scopedFullGraph.links]);

  const executeBottomUpSearch = useCallback(
    async (
      params: {
        keywords: string;
        expansionDegree: number;
        maxNodes: number;
        nodeTypes: string[];
        edgeTypes: string[];
        searchFields: string[];
        searchLogic: 'AND' | 'OR';
        nodeRankingMode: 'global' | 'subgraph';
      },
      opts?: { preservePreviousGraph?: boolean }
    ) => {
      if (!builder || params.searchFields.length === 0) return;

      const runId = ++bottomUpRunIdRef.current;

      // We want to keep the graph visible during scope flips; avoid full-screen "loading" flash.
      if (!opts?.preservePreviousGraph) setLoading(true);

      setRelationships([]);
      setTopDownGraphInfo(null);

      try {
        const terms = params.keywords
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t);

        const builderState: NetworkBuilderState = {
          searchTerms: terms,
          searchFields: params.searchFields,
          allowedNodeTypes: params.nodeTypes as ('index' | 'entity' | 'concept')[],
          allowedEdgeTypes: params.edgeTypes as ('definition' | 'reference' | 'hierarchy')[],
          allowedTitles: [],
          allowedSections: [],
          seedNodeIds: [],
          expansionDepth: params.expansionDegree,
          maxNodesPerExpansion: 100,
          maxTotalNodes: params.maxNodes,
        };

        const filtered = builder.buildNetwork(builderState, params.searchLogic, params.nodeRankingMode);

        // If another run started after this one, ignore these results.
        if (runId !== bottomUpRunIdRef.current) return;

        let finalLinks = filtered.links;
        let linksTruncated = false;

        if (finalLinks.length > limit) {
          const nodeDegrees = new Map<string, number>();
          filtered.links.forEach((link) => {
            const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
            const targetId = typeof link.target === 'string' ? link.target : link.target.id;
            nodeDegrees.set(sourceId, (nodeDegrees.get(sourceId) || 0) + 1);
            nodeDegrees.set(targetId, (nodeDegrees.get(targetId) || 0) + 1);
          });

          finalLinks = [...filtered.links]
            .sort((a, b) => {
              const sourceA = typeof a.source === 'string' ? a.source : a.source.id;
              const targetA = typeof a.target === 'string' ? a.target : a.target.id;
              const sourceB = typeof b.source === 'string' ? b.source : b.source.id;
              const targetB = typeof b.target === 'string' ? b.target : b.target.id;

              const degreeA = (nodeDegrees.get(sourceA) || 0) + (nodeDegrees.get(targetA) || 0);
              const degreeB = (nodeDegrees.get(sourceB) || 0) + (nodeDegrees.get(targetB) || 0);

              return degreeB - degreeA;
            })
            .slice(0, limit);

          linksTruncated = true;
        }

        const nodesInFinalLinks = new Set<string>();
        finalLinks.forEach((link) => {
          const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
          const targetId = typeof link.target === 'string' ? link.target : link.target.id;
          nodesInFinalLinks.add(sourceId);
          nodesInFinalLinks.add(targetId);
        });

        const finalNodes = filtered.nodes.filter((n) => nodesInFinalLinks.has(n.id));

        setDisplayGraph({
          nodes: finalNodes,
          links: finalLinks,
          truncated: filtered.truncated || linksTruncated,
          matchedCount: filtered.matchedCount,
        });

        setDisplayGraphInfo({
          nodeCount: finalNodes.length,
          linkCount: finalLinks.length,
          truncated: filtered.truncated || linksTruncated,
          matchedCount: filtered.matchedCount,
        });
      } catch (error) {
        console.error('Error building network:', error);
      } finally {
        if (!opts?.preservePreviousGraph) setLoading(false);
      }
    },
    [builder, limit]
  );

  // Bottom-up: when timeScope changes AND a search is active, re-run the same stored search params in the new scope.
  // Do NOT show scopedFullGraph fallback during this; keep previous graph until rerun finishes.
  useEffect(() => {
    if (buildMode !== 'bottomUp') return;

    const hasSearch = bottomUpSearchKeywords.trim().length > 0;

    if (!hasSearch) {
      // No search active: show a capped scoped graph (respect maxHops + limit)
      const cappedNodes =
        maxHops !== null && scopedFullGraph.nodes.length > maxHops
          ? scopedFullGraph.nodes.slice(0, maxHops)
          : scopedFullGraph.nodes;

      const allowed = new Set(cappedNodes.map((n) => n.id));

      let cappedLinks = scopedFullGraph.links.filter((l) => {
        const s = typeof l.source === 'string' ? l.source : l.source.id;
        const t = typeof l.target === 'string' ? l.target : l.target.id;
        return allowed.has(s) && allowed.has(t);
      });

      const linksWereCapped = cappedLinks.length > limit;
      if (linksWereCapped) cappedLinks = cappedLinks.slice(0, limit);

      const nodesWereCapped = cappedNodes.length !== scopedFullGraph.nodes.length;

      setDisplayGraph({
        nodes: cappedNodes,
        links: cappedLinks,
        truncated: nodesWereCapped || linksWereCapped,
        matchedCount: cappedNodes.length,
      });

      setDisplayGraphInfo({
        nodeCount: cappedNodes.length,
        linkCount: cappedLinks.length,
        truncated: nodesWereCapped || linksWereCapped,
        matchedCount: cappedNodes.length,
      });

      return;
    }

    // Search is active: rerun only when we have both builder and stored params.
    if (!builder) return;
    if (!bottomUpSearchParams) return;

    // Preserve previous graph while recomputing in the new scope.
    executeBottomUpSearch(bottomUpSearchParams, { preservePreviousGraph: true }).finally(() => {
      setIsSwitchingScope(false);
    });
  }, [
    buildMode,
    bottomUpSearchKeywords,
    timeScope,
    builder,
    bottomUpSearchParams,
    maxHops,
    limit,
    scopedFullGraph,
    executeBottomUpSearch,
  ]);

  useEffect(() => {
    const loadManifest = async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}titles-manifest.json`);
      if (!res.ok) throw new Error('Failed to load titles-manifest.json');

      const data = (await res.json()) as {
        version: number;
        titles: Array<{
          id: string;
          kind: 'single' | 'split';
          file?: string;
          meta?: string;
          label?: string;
        }>;
      };

      const ids = data.titles
        .map((t) => Number(t.id))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);

      setAvailableTitles(ids);

      setSelectedTitle((prev) => {
        if (ids.includes(prev)) return prev;
        return ids.includes(26) ? 26 : ids[0];
      });

      setManifestLoaded(true);
    };

    loadManifest().catch((e) => console.error(e));
  }, []);

  useEffect(() => {
    if (fullGraph.nodes.length > 0) {
      const indexNodes = fullGraph.nodes.filter((n) => n.node_type === 'index').length;
      const entityNodes = fullGraph.nodes.filter((n) => n.node_type === 'entity').length;
      const conceptNodes = fullGraph.nodes.filter((n) => n.node_type === 'concept').length;

      const definitionLinks = fullGraph.links.filter((l) => l.edge_type === 'definition').length;
      const referenceLinks = fullGraph.links.filter((l) => l.edge_type === 'reference').length;
      const hierarchyLinks = fullGraph.links.filter((l) => l.edge_type === 'hierarchy').length;

      setStats({
        totalDocuments: { count: indexNodes },
        totalTriples: { count: fullGraph.links.length },
        totalActors: { count: entityNodes + conceptNodes },
        categories: [
          { category: 'definition', count: definitionLinks },
          { category: 'reference', count: referenceLinks },
          { category: 'hierarchy', count: hierarchyLinks },
        ],
      });

      setEnabledCategories(new Set(['definition', 'reference', 'hierarchy']));
      setIsInitialized(true);
    }
  }, [fullGraph]);

  useEffect(() => {
    if (!manifestLoaded) return;
    if (!isInitialized) return;
    if (loading) return;
    if (buildMode !== 'topDown') return;
    if (fullGraph.nodes.length === 0) return;

    loadData();
  }, [
    manifestLoaded,
    isInitialized,
    loading,
    buildMode,
    fullGraph.nodes.length,
    timeScope,
    limit,
    enabledClusterIds,
    enabledCategories,
    enabledNodeTypes,
    yearRange,
    includeUndated,
    keywords,
    maxHops,
  ]);

  const loadData = async () => {
    try {
      setLoading(true);
      const clusterIds = Array.from(enabledClusterIds);
      const categories = Array.from(enabledCategories);

      const [relationshipsResponse, actorCounts] = await Promise.all([
        fetchRelationships(
          limit * 2,
          clusterIds,
          categories,
          yearRange,
          includeUndated,
          keywords,
          maxHops,
          timeScope
        ),
        fetchActorCounts(300, undefined, timeScope),
      ]);

      let workingRelationships = relationshipsResponse.relationships;

      // Filter by node types
      if (enabledNodeTypes.size > 0 && enabledNodeTypes.size < 3) {
        workingRelationships = workingRelationships.filter((rel) => {
          const actorType = rel.actor_type;
          const targetType = rel.target_type;
          return (
            actorType &&
            enabledNodeTypes.has(actorType) &&
            targetType &&
            enabledNodeTypes.has(targetType)
          );
        });
      }

      let filteredRelationships = workingRelationships;

      // Apply node limit
      if (maxHops !== null) {
        const nodeSet = new Set<string>();
        const nodeDegree = new Map<string, number>();

        workingRelationships.forEach((rel) => {
          const actorId = rel.actor_id ?? rel.actor;
          const targetId = rel.target_id ?? rel.target;

          nodeSet.add(actorId);
          nodeSet.add(targetId);

          nodeDegree.set(actorId, (nodeDegree.get(actorId) || 0) + 1);
          nodeDegree.set(targetId, (nodeDegree.get(targetId) || 0) + 1);
        });

        if (nodeSet.size > maxHops) {
          const sortedNodes = Array.from(nodeDegree.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxHops)
            .map(([nodeId]) => nodeId);

          const allowedNodes = new Set(sortedNodes);

          filteredRelationships = workingRelationships.filter((rel) => {
            const actorId = rel.actor_id ?? rel.actor;
            const targetId = rel.target_id ?? rel.target;
            return allowedNodes.has(actorId) && allowedNodes.has(targetId);
          });
        }
      }

      // Apply relationship limit
      if (filteredRelationships.length > limit) {
        const nodeDegree = new Map<string, number>();
        filteredRelationships.forEach((rel) => {
          const actorId = rel.actor_id ?? rel.actor;
          const targetId = rel.target_id ?? rel.target;
          nodeDegree.set(actorId, (nodeDegree.get(actorId) || 0) + 1);
          nodeDegree.set(targetId, (nodeDegree.get(targetId) || 0) + 1);
        });

        filteredRelationships = filteredRelationships
          .sort((a, b) => {
            const actorIdA = a.actor_id ?? a.actor;
            const targetIdA = a.target_id ?? a.target;
            const actorIdB = b.actor_id ?? b.actor;
            const targetIdB = b.target_id ?? b.target;

            const degreeA = (nodeDegree.get(actorIdA) || 0) + (nodeDegree.get(targetIdA) || 0);
            const degreeB = (nodeDegree.get(actorIdB) || 0) + (nodeDegree.get(targetIdB) || 0);

            return degreeB - degreeA;
          })
          .slice(0, limit);
      }

      setRelationships(filteredRelationships);
      setTotalBeforeLimit(workingRelationships.length);
      setActorTotalCounts(actorCounts);

      const uniqueNodes = new Set<string>();
      filteredRelationships.forEach((rel) => {
        uniqueNodes.add(rel.actor_id ?? rel.actor);
        uniqueNodes.add(rel.target_id ?? rel.target);
      });

      setTopDownGraphInfo({
        nodeCount: uniqueNodes.size,
        linkCount: filteredRelationships.length,
      });

      setDisplayGraphInfo(null);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
      setIsSwitchingScope(false);
    }
  };

  const handleNodeClick = useCallback(
    (nodeId: string | null) => {
      setSelectedNode((prev) => {
        if (nodeId === null) return null;
        if (prev?.id === nodeId && prev.scope === timeScope) return null;
        return { id: nodeId, scope: timeScope };
      });

      if (nodeId) setIsRightSidebarOpen(true);
    },
    [timeScope]
  );

  const switchTimeScope = useCallback(
    (next: TimeScope) => {
      setIsSwitchingScope(true);
      setTimeScope(next);

      setSelectedNode((prev) => {
  const anchorId = openDocId ?? prev?.id;
  if (!anchorId) return prev;
  const exists = fullGraph.nodes.some((n) => n.id === anchorId && n.time === next);
  if (!exists) return prev; // keep out-of-scope with old scope
  return { id: anchorId, scope: next }; // ← THIS LINE should always run when exists is true
});


      if (openDocId) setIsRightSidebarOpen(true);
    },
    [fullGraph.nodes, openDocId]
  );

  const toggleCluster = useCallback((clusterId: number) => {
    setEnabledClusterIds((prev) => {
      const next = new Set(prev);
      if (next.has(clusterId)) {
        next.delete(clusterId);
      } else {
        next.add(clusterId);
      }
      return next;
    });
  }, []);

  const toggleCategory = useCallback((category: string) => {
    setEnabledCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const toggleNodeType = useCallback((nodeType: string) => {
    setEnabledNodeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeType)) {
        next.delete(nodeType);
      } else {
        next.add(nodeType);
      }
      return next;
    });
  }, []);

  const handleCloseWelcome = useCallback(() => {
    localStorage.setItem('hasSeenWelcome', 'true');
    setShowWelcome(false);
  }, []);

  useEffect(() => {
    const id = selectedNode?.id ?? null;
    const isOutOfScope = !!selectedNode && selectedNode.scope !== timeScope;

    if (!id || isOutOfScope) {
      // During scope flips, keep last relationships visible until the new scope loads.
      if (!isSwitchingScope) {
        setActorRelationships([]);
        setActorTotalBeforeFilter(0);
      }
      return;
    }

    if (buildMode === 'topDown') {
      const loadNodeRelationships = async () => {
        try {
          const clusterIds = Array.from(enabledClusterIds);
          const categories = Array.from(enabledCategories);

          const response = await fetchActorRelationships(
            id,
            clusterIds,
            categories,
            yearRange,
            includeUndated,
            keywords,
            maxHops,
            timeScope
          );

          setActorRelationships(response.relationships);
          setActorTotalBeforeFilter(response.totalBeforeFilter);
        } catch (error) {
          console.error('Error loading node relationships:', error);
          if (!isSwitchingScope) {
            setActorRelationships([]);
            setActorTotalBeforeFilter(0);
          }
        }
      };

      loadNodeRelationships();
    } else {
      const relatedLinks = displayGraph.links.filter((link) => {
        const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
        const targetId = typeof link.target === 'string' ? link.target : link.target.id;
        return sourceId === id || targetId === id;
      });

      const rels = convertGraphToRelationships(displayGraph.nodes, relatedLinks);
      setActorRelationships(rels);
      setActorTotalBeforeFilter(rels.length);
    }
  }, [
    buildMode,
    selectedNode,
    enabledClusterIds,
    enabledCategories,
    yearRange,
    includeUndated,
    keywords,
    maxHops,
    timeScope,
    displayGraph,
    convertGraphToRelationships,
    isSwitchingScope,
  ]);

  const handleBottomUpSearch = useCallback(
    (params: {
      keywords: string;
      expansionDegree: number;
      maxNodes: number;
      nodeTypes: string[];
      edgeTypes: string[];
      searchFields: string[];
      searchLogic: 'AND' | 'OR';
      nodeRankingMode: 'global' | 'subgraph';
    }) => {
      if (!builder) {
        alert('Network builder is not ready. Please wait for the data to load.');
        return;
      }

      if (!params.keywords.trim()) {
        alert('Please enter some keywords to search for (e.g., "tax")');
        return;
      }

      if (params.searchFields.length === 0) {
        alert('Please select at least one field to search in.');
        return;
      }

      const effective = {
        ...params,
        maxNodes: maxHops || 1500,
      };

      // Store params so we can rerun on timeScope flips.
      setBottomUpSearchParams(effective);
      setBottomUpSearchKeywords(params.keywords);
      setBuildMode('bottomUp');

      executeBottomUpSearch(effective);
    },
    [builder, executeBottomUpSearch, maxHops]
  );

  const handleStartNewNetwork = useCallback(() => {
    setBuildMode('bottomUp');
    setKeywords('');
    setBottomUpSearchKeywords('');
    setBottomUpSearchParams(null);
    setRelationships([]);
    setDisplayGraph({
      nodes: [],
      links: [],
      truncated: false,
      matchedCount: 0,
    });
    setDisplayGraphInfo(null);
    setTopDownGraphInfo(null);
    setSelectedNode(null);
    setActorRelationships([]);
  }, []);

  const handleResetToTopDown = useCallback(() => {
    setBuildMode('topDown');
    setBottomUpSearchKeywords('');
    setBottomUpSearchParams(null);
    setDisplayGraphInfo(null);
    setSelectedNode(null);
    setActorRelationships([]);
    loadData();
  }, []);

  return (
    <>
      <div className="flex h-screen bg-gray-900 text-white">
        <div className="hidden lg:block">
          <Sidebar
            stats={stats}
            selectedNode={selectedNode}
            onNodeSelect={(nodeId) => {
              setSelectedNode(nodeId ? { id: nodeId, scope: timeScope } : null);
              if (nodeId) setIsRightSidebarOpen(true);
            }}
            limit={limit}
            onLimitChange={setLimit}
            maxHops={maxHops}
            onMaxHopsChange={setMaxHops}
            minDensity={minDensity}
            onMinDensityChange={setMinDensity}
            tagClusters={tagClusters}
            enabledClusterIds={enabledClusterIds}
            onToggleCluster={toggleCluster}
            enabledCategories={enabledCategories}
            onToggleCategory={toggleCategory}
            enabledNodeTypes={enabledNodeTypes}
            onToggleNodeType={toggleNodeType}
            yearRange={yearRange}
            onYearRangeChange={() => {}}
            includeUndated={includeUndated}
            onIncludeUndatedChange={() => {}}
            keywords={keywords}
            onKeywordsChange={setKeywords}
            buildMode={buildMode}
            timeScope={timeScope}
            onTimeScopeChange={switchTimeScope}
            selectedTitle={selectedTitle}
            onSelectedTitleChange={setSelectedTitle}
            availableTitles={availableTitles}
            onStartNewNetwork={handleStartNewNetwork}
            onResetToTopDown={handleResetToTopDown}
            onBottomUpSearch={handleBottomUpSearch}
            displayGraphInfo={displayGraphInfo}
            topDownGraphInfo={topDownGraphInfo}
          />
        </div>

        <div className="flex-1 relative pb-16 lg:pb-0">
          {buildMode === 'bottomUp' && displayGraph.truncated && (
            <div className="absolute top-4 left-4 z-10 bg-yellow-100 border border-yellow-400 text-yellow-900 px-4 py-2 rounded shadow-lg">
              ⚠ Showing {displayGraph.nodes.length} of {displayGraph.matchedCount} matching nodes
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-full bg-gray-900">
              <div className="text-center">
                <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-gray-400">Loading network data...</p>
              </div>
            </div>
          ) : (
            <NetworkGraph
              key={`${selectedTitle}::${buildMode}::${timeScope}`}
              graphData={buildMode === 'bottomUp' ? displayGraph : undefined}
              relationships={buildMode === 'topDown' ? relationships : undefined}
              selectedNode={selectedNode}
              onNodeClick={handleNodeClick}
              minDensity={minDensity}
              actorTotalCounts={actorTotalCounts}
              enabledCategories={enabledCategories}
              enabledNodeTypes={enabledNodeTypes}
              timeScope={timeScope}
            />
          )}
        </div>

        <div className="hidden lg:block">
          {isRightSidebarOpen && (
            <RightSidebar
              selectedNode={selectedNode}
              relationships={rightSidebarRelationships}
              totalRelationships={rightSidebarTotal}
              onClose={() => setIsRightSidebarOpen(false)}
              yearRange={yearRange}
              keywords={buildMode === 'bottomUp' ? bottomUpSearchKeywords : keywords}
              timeScope={timeScope}
              onTimeScopeChange={switchTimeScope}
              onViewFullText={(docId) => setOpenDocId(docId)}
            />
          )}
        </div>

        <div className="lg:hidden">
          <MobileBottomNav
            timeScope={timeScope}
            stats={stats}
            selectedNode={selectedNode}
            onNodeSelect={(nodeId) => {
              setSelectedNode(nodeId ? { id: nodeId, scope: timeScope } : null);
            }}
            onViewFullText={(docId) => setOpenDocId(docId)}
            limit={limit}
            onLimitChange={setLimit}
            tagClusters={tagClusters}
            enabledClusterIds={enabledClusterIds}
            onToggleCluster={toggleCluster}
            enabledCategories={enabledCategories}
            onToggleCategory={toggleCategory}
            relationships={
              selectedNode?.scope === timeScope && selectedNode?.id ? actorRelationships : relationships
            }
          />
        </div>
      </div>

      <WelcomeModal isOpen={showWelcome} onClose={handleCloseWelcome} />

      {openDocId && (
        <DocumentModal
          docId={openDocId}
          highlightTerm={selectedNodeId}
          secondaryHighlightTerm={null}
          searchKeywords={buildMode === 'bottomUp' ? bottomUpSearchKeywords : keywords}
          timeScope={timeScope}
          onTimeScopeChange={switchTimeScope}
          onClose={() => setOpenDocId(null)}
        />
      )}
    </>
  );
}

export default App;
