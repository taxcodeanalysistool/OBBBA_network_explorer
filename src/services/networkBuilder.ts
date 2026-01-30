// src/services/networkBuilder.ts

import type { GraphNode, GraphLink, NetworkBuilderState, FilteredGraph } from '../types';

export class NetworkBuilder {
  private allNodes: GraphNode[];
  private allLinks: GraphLink[];
  private adjacencyMap: Map<string, Array<{ neighborId: string; edgeType: string }>>;

  constructor(nodes: GraphNode[], links: GraphLink[]) {
    this.allNodes = nodes;
    this.allLinks = links;
    
    this.adjacencyMap = new Map();
    
    links.forEach(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      const edgeType = link.edge_type;
      
      if (!this.adjacencyMap.has(sourceId)) {
        this.adjacencyMap.set(sourceId, []);
      }
      if (!this.adjacencyMap.has(targetId)) {
        this.adjacencyMap.set(targetId, []);
      }
      
      this.adjacencyMap.get(sourceId)!.push({ neighborId: targetId, edgeType });
      this.adjacencyMap.get(targetId)!.push({ neighborId: sourceId, edgeType });
    });
  }

  searchNodes(searchTerms: string[], searchFields: string[], logic: 'AND' | 'OR' = 'OR'): Set<string> {
    const matchedIds = new Set<string>();
    const normalizedTerms = searchTerms.map(t => t.toLowerCase().trim());

    this.allNodes.forEach(node => {
      const searchableValues: string[] = [];
      
      searchFields.forEach(field => {
        let value: any;
        
        switch(field) {
          case 'text':
            value = node.properties?.text || node.text || node.section_text || node.index_heading;
            break;
          case 'full_name':
            value = node.properties?.full_name || node.full_name;
            break;
          case 'display_label':
            value = node.display_label;
            break;
          case 'definition':
            value = node.properties?.definition;
            break;
          case 'entity':
            value = node.node_type === 'entity' ? node.name : null;
            break;
          case 'concept':
            value = node.node_type === 'concept' ? node.name : null;
            break;
          case 'properties':
            if (node.properties && typeof node.properties === 'object') {
              Object.values(node.properties).forEach(propValue => {
                if (typeof propValue === 'string') {
                  searchableValues.push(propValue.toLowerCase());
                }
              });
            }
            return;
          default:
            value = (node as any)[field];
        }

        if (value !== null && value !== undefined) {
          searchableValues.push(String(value).toLowerCase());
        }
      });

      if (logic === 'OR') {
        const shouldMatch = normalizedTerms.some(term => 
          searchableValues.some(searchableValue => searchableValue.includes(term))
        );
        if (shouldMatch) matchedIds.add(node.id);
      } else {
        const allTermsMatch = normalizedTerms.every(term => 
          searchableValues.some(searchableValue => searchableValue.includes(term))
        );
        if (allTermsMatch) matchedIds.add(node.id);
      }
    });

    return matchedIds;
  }

  expandFromSeeds(
    seedIds: Set<string>,
    depth: number,
    maxNeighborsPerNode: number,
    allowedEdgeTypes: string[]
  ): Set<string> {
    const expanded = new Set<string>(seedIds);
    let currentLayer = new Set<string>(seedIds);

    for (let i = 0; i < depth; i++) {
      const nextLayer = new Set<string>();

      currentLayer.forEach(nodeId => {
        const neighbors = this.adjacencyMap.get(nodeId) || [];
        
        const filteredNeighbors = allowedEdgeTypes.length > 0
          ? neighbors.filter(n => allowedEdgeTypes.includes(n.edgeType))
          : neighbors;
        
        const limitedNeighbors = maxNeighborsPerNode > 0 
          ? filteredNeighbors.slice(0, maxNeighborsPerNode)
          : filteredNeighbors;

        limitedNeighbors.forEach(({ neighborId }) => {
          if (!expanded.has(neighborId)) {
            nextLayer.add(neighborId);
            expanded.add(neighborId);
          }
        });
      });

      currentLayer = nextLayer;
      if (currentLayer.size === 0) break;
    }

    return expanded;
  }

  buildNetwork(state: NetworkBuilderState, searchLogic: 'AND' | 'OR' = 'OR', nodeRankingMode: 'global' | 'subgraph' = 'global'): FilteredGraph {
    let candidateNodeIds = new Set<string>();
    let seedNodeIds = new Set<string>();

    // Step 1: Keyword search
    if (state.searchTerms.length > 0 && state.searchFields.length > 0) {
      seedNodeIds = this.searchNodes(state.searchTerms, state.searchFields, searchLogic);

      if (seedNodeIds.size === 0) {
        return { nodes: [], links: [], truncated: false, matchedCount: 0 };
      }
      
      // Step 1b: Expand from seeds
      if (state.expansionDepth > 0) {
        candidateNodeIds = this.expandFromSeeds(
          seedNodeIds,
          state.expansionDepth,
          state.maxNodesPerExpansion,
          state.allowedEdgeTypes
        );
        
        // Filter expanded nodes by type
        if (state.allowedNodeTypes.length > 0) {
          candidateNodeIds = new Set(
            [...candidateNodeIds].filter(id => {
              const node = this.allNodes.find(n => n.id === id);
              if (!node) return false;
              if (seedNodeIds.has(id)) return true;
              return state.allowedNodeTypes.includes(node.node_type);
            })
          );
        }
      } else {
        candidateNodeIds = new Set(seedNodeIds);
      }
    } else {
      candidateNodeIds = new Set(this.allNodes.map(n => n.id));
    }

    // Step 2: Filter seed nodes by type
    if (state.searchTerms.length > 0 && state.searchFields.length > 0) {
      const seedsAfterFilter = new Set(
        [...seedNodeIds].filter(id => {
          const node = this.allNodes.find(n => n.id === id);
          if (!node) return false;
          return state.allowedNodeTypes.length > 0 && 
                 state.allowedNodeTypes.includes(node.node_type);
        })
      );
      
      if (seedsAfterFilter.size === 0) {
        return { nodes: [], links: [], truncated: false, matchedCount: 0 };
      }
      
      candidateNodeIds = new Set(
        [...candidateNodeIds].filter(id => 
          seedsAfterFilter.has(id) || !seedNodeIds.has(id)
        )
      );
      
      seedNodeIds = seedsAfterFilter;
    }

    // Step 3: Build candidate node map
    const candidateNodeMap = new Map<string, GraphNode>();
    this.allNodes.forEach(n => {
      if (candidateNodeIds.has(n.id)) {
        candidateNodeMap.set(n.id, n);
      }
    });

    const candidateNodes = Array.from(candidateNodeMap.values());

    // Step 4: Filter links by edge type
    const candidateLinks = this.allLinks.filter(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      
      const edgeTypeMatch = state.allowedEdgeTypes.length > 0 && 
                           state.allowedEdgeTypes.includes(link.edge_type);
      
      return edgeTypeMatch && candidateNodeMap.has(sourceId) && candidateNodeMap.has(targetId);
    });

    // Step 5: Remove isolated nodes and filter by type
    const nodesWithEdges = new Set<string>();
    candidateLinks.forEach(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      nodesWithEdges.add(sourceId);
      nodesWithEdges.add(targetId);
    });

    const connectedNodeIds = new Set(
      candidateNodes
        .filter(n => {
          const hasEdges = nodesWithEdges.has(n.id);
          const typeMatch = state.allowedNodeTypes.length === 0 || 
                           state.allowedNodeTypes.includes(n.node_type);
          return hasEdges && typeMatch;
        })
        .map(n => n.id)
    );

    // Step 6: Apply node cap
    const totalMatches = connectedNodeIds.size;
    const truncated = totalMatches > state.maxTotalNodes;
    let finalNodeIds: Set<string>;

    if (truncated) {
      if (nodeRankingMode === 'subgraph') {
        const nodeDegrees = new Map<string, number>();
        
        candidateLinks.forEach(link => {
          const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
          const targetId = typeof link.target === 'string' ? link.target : link.target.id;
          nodeDegrees.set(sourceId, (nodeDegrees.get(sourceId) || 0) + 1);
          nodeDegrees.set(targetId, (nodeDegrees.get(targetId) || 0) + 1);
        });
        
        const topNodes = Array.from(connectedNodeIds)
          .filter(nodeId => nodeDegrees.has(nodeId))
          .sort((a, b) => (nodeDegrees.get(b) || 0) - (nodeDegrees.get(a) || 0))
          .slice(0, state.maxTotalNodes);
        
        finalNodeIds = new Set(topNodes);
      } else {
        finalNodeIds = new Set(this.selectTopNodesByDegree(connectedNodeIds, state.maxTotalNodes));
      }
    } else {
      finalNodeIds = connectedNodeIds;
    }

    // Step 7: Build final nodes and links
    const selectedNodeMap = new Map<string, GraphNode>();
    this.allNodes.forEach(n => {
      if (finalNodeIds.has(n.id)) {
        const typeMatch = state.allowedNodeTypes.length === 0 || 
                         state.allowedNodeTypes.includes(n.node_type);
        if (typeMatch) {
          selectedNodeMap.set(n.id, n);
        }
      }
    });

    const nodes = Array.from(selectedNodeMap.values());

    const links = candidateLinks.filter(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      return selectedNodeMap.has(sourceId) && selectedNodeMap.has(targetId);
    });

    // Step 8: Compute colors by node type and degree
    const nodeDegree = new Map<string, number>();
    links.forEach(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      nodeDegree.set(sourceId, (nodeDegree.get(sourceId) || 0) + 1);
      nodeDegree.set(targetId, (nodeDegree.get(targetId) || 0) + 1);
    });

    nodes.forEach(node => {
      node.val = nodeDegree.get(node.id) || 1;
      node.totalVal = node.val;
    });

    const maxVal = Math.max(...nodes.map(n => n.val), 1);
    const strength = (v: number) => v / maxVal;

    const sectionColorScale = (t: number) => {
      const r1 = 0x9B, g1 = 0x96, b1 = 0xC9;
      const r2 = 0x41, g2 = 0x37, b2 = 0x8F;
      const r = Math.round(r1 + (r2 - r1) * t);
      const g = Math.round(g1 + (g2 - g1) * t);
      const b = Math.round(b1 + (b2 - b1) * t);
      return `rgb(${r}, ${g}, ${b})`;
    };

    const entityConceptColorScale = (t: number) => {
      const r1 = 0xF9, g1 = 0xD9, b1 = 0x9B;
      const r2 = 0xF0, g2 = 0xA7, b2 = 0x34;
      const r = Math.round(r1 + (r2 - r1) * t);
      const g = Math.round(g1 + (g2 - g1) * t);
      const b = Math.round(b1 + (b2 - b1) * t);
      return `rgb(${r}, ${g}, ${b})`;
    };

    nodes.forEach(node => {
      const t = strength(node.val);
      let color: string;

      if (node.node_type === 'section' || node.node_type === 'index') {
        color = sectionColorScale(t);
      } else if (node.node_type === 'entity' || node.node_type === 'concept') {
        color = entityConceptColorScale(t);
      } else {
        color = '#AFBBE8';
      }

      node.color = color;
      node.baseColor = color;
    });

    return {
      nodes,
      links,
      truncated,
      matchedCount: totalMatches
    };
  }

  private selectTopNodesByDegree(nodeIds: Set<string>, maxNodes: number): string[] {
    const nodeDegrees = new Map<string, number>();
    
    nodeIds.forEach(nodeId => {
      const neighbors = this.adjacencyMap.get(nodeId) || [];
      nodeDegrees.set(nodeId, neighbors.length);
    });
    
    return Array.from(nodeDegrees.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxNodes)
      .map(([nodeId]) => nodeId);
  }
}
