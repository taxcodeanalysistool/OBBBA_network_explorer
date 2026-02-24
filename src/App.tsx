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
  const [enabledCategories, setEnabledCategories] = useState<Set<string>>(new Set(['reference']));
  const [enabledNodeTypes, setEnabledNodeTypes] = useState<Set<string>>(new Set(['index']));
  const [showOnlyChangedNodes, setShowOnlyChangedNodes] = useState(false);
  const [highlightChangedNodes, setHighlightChangedNodes] = useState(false);
  const [enabledChangeTypes, setEnabledChangeTypes] = useState<Set<string>>(new Set());
  const [selectedBills, setSelectedBills] = useState<Set<string>>(new Set());
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

  const networkGraphRef = useRef<{ getSvgElement: () => SVGSVGElement | null }>(null);
  const svgElement = networkGraphRef.current?.getSvgElement() ?? null;

  // A monotonically increasing "request id" for bottomUp search reruns; prevents older results from winning.
  const bottomUpRunIdRef = useRef(0);

  const prevBillFiltersRef = useRef({
    showOnlyChangedNodes: false,
    enabledChangeTypes: new Set<string>(),
    selectedBills: new Set<string>()
  });

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

  const applyBillChangeFilters = useCallback(
    (nodes: GraphNode[]) => {
      let filtered = nodes;

      // Filter 1: Show only changed nodes
      if (showOnlyChangedNodes) {
        filtered = filtered.filter(node => node.has_changes === true);
      }

      // Filter 2: Filter by specific change types
      if (enabledChangeTypes.size > 0) {
        filtered = filtered.filter(node => {
          if (!node.change_types || node.change_types.length === 0) return false;
          // Node must have at least one of the enabled change types
          return node.change_types.some(type => enabledChangeTypes.has(type));
        });
      }

      // Filter 3: Filter by specific bills
      if (selectedBills.size > 0) {
        filtered = filtered.filter(node => {
          if (!node.affected_bills || node.affected_bills.length === 0) return false;
          // Node must be affected by at least one of the selected bills
          return node.affected_bills.some(bill => selectedBills.has(bill));
        });
      }

      return filtered;
    },
    [showOnlyChangedNodes, enabledChangeTypes, selectedBills]
  );

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
          maxTotalNodes: 10000,  // Set high limit so builder doesn't cap early
        };

        const filtered = builder.buildNetwork(builderState, params.searchLogic, params.nodeRankingMode);

        // If another run started after this one, ignore these results.
        if (runId !== bottomUpRunIdRef.current) return;

        // Step 1: Apply bill change filters FIRST to all matched nodes
        const billFilteredNodes = applyBillChangeFilters(filtered.nodes);

        // Step 1.5: Apply maxNodes limit to the bill-filtered nodes
        let nodesToUse = billFilteredNodes;
        let nodesWereCapped = false;

        if (maxHops !== null && billFilteredNodes.length > maxHops) {
          // Sort by degree before slicing
          const nodeDegreeInFullGraph = new Map<string, number>();
          filtered.links.forEach((link) => {
            const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
            const targetId = typeof link.target === 'string' ? link.target : link.target.id;
            nodeDegreeInFullGraph.set(sourceId, (nodeDegreeInFullGraph.get(sourceId) || 0) + 1);
            nodeDegreeInFullGraph.set(targetId, (nodeDegreeInFullGraph.get(targetId) || 0) + 1);
          });

          nodesToUse = [...billFilteredNodes]
            .sort((a, b) => {
              const degreeA = nodeDegreeInFullGraph.get(a.id) || 0;
              const degreeB = nodeDegreeInFullGraph.get(b.id) || 0;
              return degreeB - degreeA;
            })
            .slice(0, maxHops);

          nodesWereCapped = true;
        }

        const billFilteredNodeIds = new Set(nodesToUse.map(n => n.id));

        // Step 2: Filter links to only include bill-filtered nodes
        let workingLinks = filtered.links.filter(link => {
          const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
          const targetId = typeof link.target === 'string' ? link.target : link.target.id;
          return billFilteredNodeIds.has(sourceId) && billFilteredNodeIds.has(targetId);
        });

        // Step 3: Apply relationship limit to the bill-filtered links
        let finalLinks = workingLinks;
        let linksTruncated = false;

        if (workingLinks.length > limit) {
          const nodeDegrees = new Map<string, number>();
          workingLinks.forEach((link) => {
            const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
            const targetId = typeof link.target === 'string' ? link.target : link.target.id;
            nodeDegrees.set(sourceId, (nodeDegrees.get(sourceId) || 0) + 1);
            nodeDegrees.set(targetId, (nodeDegrees.get(targetId) || 0) + 1);
          });

          finalLinks = [...workingLinks]
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

        // Step 4: Keep only nodes that are in the final links
        const nodesInFinalLinks = new Set<string>();
        finalLinks.forEach((link) => {
          const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
          const targetId = typeof link.target === 'string' ? link.target : link.target.id;
          nodesInFinalLinks.add(sourceId);
          nodesInFinalLinks.add(targetId);
        });

        const finalNodes = nodesToUse.filter((n) => nodesInFinalLinks.has(n.id));

        setDisplayGraph({
          nodes: finalNodes,
          links: finalLinks,
          truncated: filtered.truncated || linksTruncated || nodesWereCapped,
          matchedCount: filtered.matchedCount,
        });

        setDisplayGraphInfo({
          nodeCount: finalNodes.length,
          linkCount: finalLinks.length,
          truncated: filtered.truncated || linksTruncated || nodesWereCapped,
          matchedCount: filtered.matchedCount,
        });
      } catch (error) {
        console.error('Error building network:', error);
      } finally {
        if (!opts?.preservePreviousGraph) setLoading(false);
      }
    },
    [builder, limit, maxHops, applyBillChangeFilters]
  );

  // Bottom-up: when timeScope changes AND a search is active, re-run the same stored search params in the new scope.
  // Do NOT show scopedFullGraph fallback during this; keep previous graph until rerun finishes.
  useEffect(() => {
    if (buildMode !== 'bottomUp') return;

    const hasSearch = bottomUpSearchKeywords.trim().length > 0;

    // Check if bill filters changed (for active searches)
    const billFiltersChanged = 
      prevBillFiltersRef.current.showOnlyChangedNodes !== showOnlyChangedNodes ||
      prevBillFiltersRef.current.enabledChangeTypes !== enabledChangeTypes ||
      prevBillFiltersRef.current.selectedBills !== selectedBills;

    // Update ref
    prevBillFiltersRef.current = {
      showOnlyChangedNodes,
      enabledChangeTypes,
      selectedBills
    };

    if (!hasSearch) {
      // No search active: show a capped scoped graph (respect maxHops + limit)

      // Step 1: Apply bill change filters FIRST
      const billFilteredNodes = applyBillChangeFilters(scopedFullGraph.nodes);

      // Step 2: Apply node limit (maxHops)
      let finalNodes = billFilteredNodes;
      let nodesWereCapped = false;
      if (maxHops !== null && billFilteredNodes.length > maxHops) {
        finalNodes = billFilteredNodes.slice(0, maxHops);
        nodesWereCapped = true;
      }

      const billFilteredNodeIds = new Set(finalNodes.map((n) => n.id));

      // Step 3: Filter links to match bill-filtered nodes
      let workingLinks = scopedFullGraph.links.filter((l) => {
        const s = typeof l.source === 'string' ? l.source : l.source.id;
        const t = typeof l.target === 'string' ? l.target : l.target.id;
        return billFilteredNodeIds.has(s) && billFilteredNodeIds.has(t);
      });

      // Step 4: Apply relationship limit
      let finalLinks = workingLinks;
      const linksWereCapped = workingLinks.length > limit;
      if (linksWereCapped) {
        finalLinks = workingLinks.slice(0, limit);
      }

      setDisplayGraph({
        nodes: finalNodes,
        links: finalLinks,
        truncated: nodesWereCapped || linksWereCapped,
        matchedCount: finalNodes.length,
      });

      setDisplayGraphInfo({
        nodeCount: finalNodes.length,
        linkCount: finalLinks.length,
        truncated: nodesWereCapped || linksWereCapped,
        matchedCount: finalNodes.length,
      });

      return;
    }

    // Search is active: rerun when we have builder, params, OR when bill filters change
    if (!builder) return;
    if (!bottomUpSearchParams) return;

    // If bill filters changed and we have an active search, re-run it from scratch
    if (billFiltersChanged) {
      console.log('🔄 Bill filters changed, re-running search from full graph...');
    }

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
    applyBillChangeFilters,
    showOnlyChangedNodes,
    enabledChangeTypes,
    selectedBills,
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

      setEnabledCategories(new Set(['reference']));
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
    showOnlyChangedNodes,
    enabledChangeTypes,
    selectedBills, 
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

      // Step 1: Build unique node set from working relationships
      const uniqueNodes = new Set<string>();
      workingRelationships.forEach((rel) => {
        uniqueNodes.add(rel.actor_id ?? rel.actor);
        uniqueNodes.add(rel.target_id ?? rel.target);
      });

      // Step 2: Apply BILL FILTERS FIRST to all nodes
      const nodesForBillFilter = scopedFullGraph.nodes.filter(n => uniqueNodes.has(n.id));
      const billFilteredNodes = applyBillChangeFilters(nodesForBillFilter);
      const billFilteredNodeIds = new Set(billFilteredNodes.map(n => n.id));

      // Step 3: Filter relationships to only include bill-filtered nodes
      let filteredRelationships = workingRelationships.filter((rel) => {
        const actorId = rel.actor_id ?? rel.actor;
        const targetId = rel.target_id ?? rel.target;
        return billFilteredNodeIds.has(actorId) && billFilteredNodeIds.has(targetId);
      });

      // Step 4: NOW apply node limit to bill-filtered nodes
      if (maxHops !== null && billFilteredNodes.length > maxHops) {
        const nodeDegree = new Map<string, number>();

        filteredRelationships.forEach((rel) => {
          const actorId = rel.actor_id ?? rel.actor;
          const targetId = rel.target_id ?? rel.target;
          nodeDegree.set(actorId, (nodeDegree.get(actorId) || 0) + 1);
          nodeDegree.set(targetId, (nodeDegree.get(targetId) || 0) + 1);
        });

        const sortedNodes = Array.from(nodeDegree.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, maxHops)
          .map(([nodeId]) => nodeId);

        const allowedNodes = new Set(sortedNodes);

        filteredRelationships = filteredRelationships.filter((rel) => {
          const actorId = rel.actor_id ?? rel.actor;
          const targetId = rel.target_id ?? rel.target;
          return allowedNodes.has(actorId) && allowedNodes.has(targetId);
        });
      }

      // Step 5: Apply relationship limit
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

      // Step 6: Count final unique nodes
      const finalUniqueNodes = new Set<string>();
      filteredRelationships.forEach((rel) => {
        finalUniqueNodes.add(rel.actor_id ?? rel.actor);
        finalUniqueNodes.add(rel.target_id ?? rel.target);
      });

      setRelationships(filteredRelationships);
      setTotalBeforeLimit(workingRelationships.length);
      setActorTotalCounts(actorCounts);

      setTopDownGraphInfo({
        nodeCount: finalUniqueNodes.size,
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

    // Clear bill change filters when switching to Pre-OBBBA (no changes exist there)
    if (next === 'pre-OBBBA') {
      setShowOnlyChangedNodes(false);
      setHighlightChangedNodes(false);
      setEnabledChangeTypes(new Set());
      setSelectedBills(new Set());
    }

    setSelectedNode((prev) => {
      const anchorId = openDocId ?? prev?.id;
      if (!anchorId) return prev;
      const exists = fullGraph.nodes.some((n) => n.id === anchorId && n.time === next);
      if (!exists) return prev;
      return { id: anchorId, scope: next };
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

  const toggleChangeType = useCallback((changeType: string) => {
    setEnabledChangeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(changeType)) {
        next.delete(changeType);
      } else {
        next.add(changeType);
      }
      return next;
    });
  }, []);

  const toggleBill = useCallback((bill: string) => {
    setSelectedBills((prev) => {
      const next = new Set(prev);
      if (next.has(bill)) {
        next.delete(bill);
      } else {
        next.add(bill);
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

  const { availableChangeTypes, availableBills } = useMemo(() => {
    const nodesToCheck = scopedFullGraph?.nodes || [];

    if (nodesToCheck.length === 0) {
      return {
        availableChangeTypes: [],
        availableBills: []
      };
    }

    const changeTypes = new Set<string>();
    const bills = new Set<string>();

    nodesToCheck.forEach(node => {
      if (node.change_types) {
        node.change_types.forEach(type => changeTypes.add(type));
      }
      if (node.affected_bills) {
        node.affected_bills.forEach(bill => bills.add(bill));
      }
    });

    return {
      availableChangeTypes: Array.from(changeTypes).sort(),
      availableBills: Array.from(bills).sort()
    };
  }, [scopedFullGraph]);

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
            showOnlyChangedNodes={showOnlyChangedNodes}
            onToggleShowOnlyChangedNodes={setShowOnlyChangedNodes}
            highlightChangedNodes={highlightChangedNodes}
            onToggleHighlightChangedNodes={setHighlightChangedNodes}
            enabledChangeTypes={enabledChangeTypes}
            onToggleChangeType={toggleChangeType}
            selectedBills={selectedBills}
            onToggleSelectedBill={toggleBill}
            availableChangeTypes={availableChangeTypes}
            availableBills={availableBills}  
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
            graphData={buildMode === 'topDown' ? scopedFullGraph : displayGraph}
            svgElement={svgElement}
            searchTerm={bottomUpSearchKeywords || undefined}
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
              ref={networkGraphRef}
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
              highlightChangedNodes={highlightChangedNodes}  // ← ADD THIS
              enabledChangeTypes={enabledChangeTypes}  // ← ADD THIS
              selectedBills={selectedBills}
              nodeMetadata={scopedFullGraph.nodes}
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