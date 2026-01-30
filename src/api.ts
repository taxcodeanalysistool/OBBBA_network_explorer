// src/api.ts

import type {
  Stats,
  Relationship,
  Actor,
  TagCluster,
  GraphData,
  GraphNode,
  GraphLink,
  Document,
} from './types';

let cachedGraph: GraphData | null = null;
let cachedTitle: number | null = null;

type ManifestItem =
  | { id: string; kind: 'single'; file: string; label?: string }
  | { id: string; kind: 'split'; meta: string; label?: string };

type TitlesManifest = { version: number; titles: ManifestItem[] };

type RawGraph = { nodes: any[]; links: any[] };

async function fetchJson<T>(relPath: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}${relPath}`);
  if (!res.ok) throw new Error(`Failed to fetch: ${relPath} (${res.status})`);
  return (await res.json()) as T;
}

async function loadRawGraphForTitle(title: number): Promise<RawGraph> {
  const manifest = await fetchJson<TitlesManifest>('titles-manifest.json');
  const item = manifest.titles.find((t) => Number(t.id) === title);
  if (!item) throw new Error(`Title ${title} not found in titles-manifest.json`);

  if (item.kind === 'single') {
    return fetchJson<RawGraph>(item.file);
  }

  const meta = await fetchJson<{ parts: { file: string }[] }>(item.meta);
  const parts = await Promise.all(meta.parts.map((p) => fetchJson<RawGraph>(p.file)));

  // Merge (de-dupe nodes by id)
  const nodes: any[] = [];
  const links: any[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    for (const n of part.nodes ?? []) {
      const id = String(n.id);
      if (!seen.has(id)) {
        seen.add(id);
        nodes.push(n);
      }
    }
    links.push(...(part.links ?? []));
  }

  return { nodes, links };
}

function ensureGraphLoadedOrThrow() {
  if (!cachedGraph) {
    throw new Error('Graph not loaded yet. Call loadGraph(title) first.');
  }
}

export async function fetchStats(): Promise<Stats> {
  return {
    totalDocuments: { count: 9718 },
    totalTriples: { count: 44967 },
    totalActors: { count: 9292 },
    categories: [
      { category: 'definition', count: 478 },
      { category: 'reference', count: 34772 },
      { category: 'hierarchy', count: 9717 },
    ],
  };
}

export async function fetchTagClusters(): Promise<TagCluster[]> {
  return [];
}

export async function loadGraph(title: number): Promise<GraphData> {
  // If you want to avoid reloading the same title repeatedly:
  if (cachedGraph && cachedTitle === title) return cachedGraph;

  const raw = await loadRawGraphForTitle(title);

  const degreeMap = new Map<string, number>();
  raw.links.forEach((link) => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;
    degreeMap.set(sourceId, (degreeMap.get(sourceId) || 0) + 1);
    degreeMap.set(targetId, (degreeMap.get(targetId) || 0) + 1);
  });

  const nodes: GraphNode[] = raw.nodes.map((n) => {
    const degree = degreeMap.get(n.id) || 0;

    let baseColor: string;
    if (n.node_type === 'section' || n.node_type === 'index') {
      baseColor = '#41378F';
    } else if (n.node_type === 'entity' || n.node_type === 'concept') {
      baseColor = '#F0A734';
    } else {
      baseColor = '#AFBBE8';
    }

    return {
      id: n.id,
      name: n.name,
      node_type: n.node_type,
      time: n.time,
      source_title: n.source_title,
      val: degree,
      totalVal: degree,
      display_label: n.display_label,
      properties: n.properties,
      title: n.title,
      subtitle: n.subtitle,
      part: n.part,
      chapter: n.chapter,
      subchapter: n.subchapter,
      section: n.section,
      subsection: n.subsection,
      full_name: n.full_name,
      text: n.text,
      term_type: n.term_type,
      section_text: n.text,
      color: baseColor,
      baseColor,
    };
  });

  const links: GraphLink[] = raw.links.map((l) => {
    const edgeType = l.edge_type ?? 'reference';
    return {
      source: l.source,
      target: l.target,
      action: l.action || edgeType,
      edge_type: edgeType,
      time: l.time,
      source_title: l.source_title,
      weight: l.weight ?? 1,
      definition: l.definition,
    };
  });

  cachedGraph = { nodes, links };
  cachedTitle = title;
  return cachedGraph;
}

export async function fetchRelationships(
  limit: number,
  clusterIds: number[],
  categories: string[],
  yearRange: [number, number],
  includeUndated: boolean,
  keywords: string,
  maxHops: number | null,
  timeScope: 'pre-OBBBA' | 'post-OBBBA'
): Promise<{ relationships: Relationship[]; totalBeforeLimit: number }> {
  // Assumes App.tsx already called loadGraph(selectedTitle) first
  ensureGraphLoadedOrThrow();

  let filteredLinks = cachedGraph!.links;
  filteredLinks = filteredLinks.filter((l) => l.time === timeScope);

  if (categories.length > 0) {
    filteredLinks = filteredLinks.filter((link) => categories.includes(link.edge_type));
  }

  const nodeMap = new Map(cachedGraph!.nodes.map((n) => [n.id, n]));

  const relationships: Relationship[] = filteredLinks.slice(0, limit).map((link, idx) => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;
    const sourceNode = nodeMap.get(sourceId);
    const targetNode = nodeMap.get(targetId);

    return {
      id: idx,
      doc_id: sourceId,
      timestamp: (link as any).timestamp || null,
      actor: sourceNode?.name || sourceId,
      action: link.action,
      target: targetNode?.name || targetId,
      location: (link as any).location || null,
      tags: [],
      actor_type: sourceNode?.node_type,
      target_type: targetNode?.node_type,
      actor_id: sourceId,
      target_id: targetId,
      definition: link.definition,
      actor_display_label: sourceNode?.display_label,
      target_display_label: targetNode?.display_label,
    };
  });

  return {
    relationships,
    totalBeforeLimit: filteredLinks.length,
  };
}

export async function fetchActorRelationships(
  actorId: string,
  clusterIds: number[],
  categories: string[],
  yearRange: [number, number],
  includeUndated: boolean,
  keywords: string,
  maxHops: number | null,
  timeScope: 'pre-OBBBA' | 'post-OBBBA'
): Promise<{ relationships: Relationship[]; totalBeforeFilter: number }> {
  ensureGraphLoadedOrThrow();

  const nodeMap = new Map(cachedGraph!.nodes.map((n) => [n.id, n]));
  const actorNode = nodeMap.get(actorId);

  if (!actorNode) {
    return { relationships: [], totalBeforeFilter: 0 };
  }

  let relatedLinks = cachedGraph!.links.filter((link) => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;
    return sourceId === actorNode.id || targetId === actorNode.id;
  });

  relatedLinks = relatedLinks.filter((l) => l.time === timeScope);

  if (categories.length > 0) {
    relatedLinks = relatedLinks.filter((link) => categories.includes(link.edge_type));
  }

  const relationships: Relationship[] = relatedLinks.map((link, idx) => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;
    const sourceNode = nodeMap.get(sourceId);
    const targetNode = nodeMap.get(targetId);

    return {
      id: idx,
      doc_id: sourceId,
      timestamp: (link as any).timestamp || null,
      actor: sourceNode?.name || sourceId,
      action: link.action,
      target: targetNode?.name || targetId,
      location: (link as any).location || null,
      tags: [],
      actor_type: sourceNode?.node_type,
      target_type: targetNode?.node_type,
      actor_id: sourceId,
      target_id: targetId,
      definition: link.definition,
    };
  });

  return {
    relationships,
    totalBeforeFilter: relatedLinks.length,
  };
}

export async function fetchActorCounts(
  limit: number,
  actorIds?: string[],
  timeScope?: 'pre-OBBBA' | 'post-OBBBA'
): Promise<Record<string, number>> {
  ensureGraphLoadedOrThrow();

  const nodes = timeScope ? cachedGraph!.nodes.filter((n) => n.time === timeScope) : cachedGraph!.nodes;

  const counts: Record<string, number> = {};

  if (actorIds && actorIds.length > 0) {
    actorIds.forEach((id) => {
      const node = nodes.find((n) => n.id === id);
      if (node) counts[id] = node.val || 0;
    });
  } else {
    nodes.forEach((node) => {
      counts[node.id] = node.val || 0;
    });
  }

  return counts;
}

export async function searchActors(query: string): Promise<Actor[]> {
  ensureGraphLoadedOrThrow();

  const lowerQuery = query.toLowerCase();
  const matches = cachedGraph!.nodes
    .filter((node) => node.name.toLowerCase().includes(lowerQuery))
    .map((node) => ({
      id: node.id,
      name: node.name,
      connection_count: node.val || 0,
    }))
    .sort((a, b) => b.connection_count - a.connection_count)
    .slice(0, 20);

  return matches;
}

export async function fetchDocument(docId: string): Promise<Document> {
  ensureGraphLoadedOrThrow();

  const node = cachedGraph!.nodes.find((n) => n.id === docId);

  return {
    doc_id: docId,
    file_path: '',
    one_sentence_summary: `US Code node ${docId}`,
    paragraph_summary: 'Details for this node are derived from the US Code network data.',
    category: 'US Code',
    date_range_earliest: null,
    date_range_latest: null,
    full_name: node?.full_name,
    text: node?.text,
    title: node?.title,
    part: node?.part,
    chapter: node?.chapter,
    subchapter: node?.subchapter,
    section: node?.section,
  };
}

export async function fetchDocumentText(docId: string): Promise<{ text: string }> {
  ensureGraphLoadedOrThrow();

  const node = cachedGraph!.nodes.find((n) => n.id === docId);

  const text =
    (node as any)?.properties?.text ||
    node?.text ||
    (node as any)?.section_text ||
    (node as any)?.properties?.full_name ||
    (node as any)?.full_name ||
    'No text available for this node.';

  return { text };
}

export async function fetchNodeDetails(nodeId: string): Promise<any> {
  ensureGraphLoadedOrThrow();

  let node = cachedGraph!.nodes.find((n) => n.id === nodeId);

  if (!node) {
    node = cachedGraph!.nodes.find((n) => n.name === nodeId);
  }

  if (!node) return null;

  return {
    ...node,
    ...(node as any).properties,
  };
}
