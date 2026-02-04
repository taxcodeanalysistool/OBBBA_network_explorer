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
  TimeScope,
} from './types';

let cachedGraph: GraphData | null = null;
let cachedTitle: number | null = null;

type ManifestItem =
  | { id: string; kind: 'single'; file: string; label?: string }
  | { id: string; kind: 'split'; meta: string; label?: string };

type TitlesManifest = { version: number; titles: ManifestItem[] };

type RawGraph = { nodes: any[]; links: any[] };

const scopedKey = (time: TimeScope, id: string) => `${time}::${id}`;

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

  // Merge (de-dupe nodes by time + id)
  const nodes: any[] = [];
  const links: any[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    for (const n of part.nodes ?? []) {
      const key = `${String(n.time)}::${String(n.id)}`;
      if (!seen.has(key)) {
        seen.add(key);
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
  // TODO: replace with computed stats from cachedGraph if desired
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
      text: n.text ?? n.properties?.text,
      term_type: n.term_type,
      section_text: n.text ?? n.properties?.text,
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
      location: l.location,
      timestamp: l.timestamp,
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
  timeScope: TimeScope
): Promise<{ relationships: Relationship[]; totalBeforeLimit: number }> {
  ensureGraphLoadedOrThrow();

  let filteredLinks = cachedGraph!.links.filter((l) => l.time === timeScope);

  if (categories.length > 0) {
    filteredLinks = filteredLinks.filter((link) => categories.includes(link.edge_type));
  }

  const nodeMap = new Map(
    cachedGraph!.nodes.map((n) => [scopedKey(n.time as TimeScope, String(n.id)), n] as const)
  );

  const relationships: Relationship[] = filteredLinks.slice(0, limit).map((link, idx) => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;

    const sourceNode = nodeMap.get(scopedKey(timeScope, String(sourceId)));
    const targetNode = nodeMap.get(scopedKey(timeScope, String(targetId)));

    return {
      id: idx,
      doc_id: String(sourceId),
      timestamp: (link as any).timestamp || null,
      actor: sourceNode?.name || String(sourceId),
      action: link.action,
      target: targetNode?.name || String(targetId),
      location: (link as any).location || null,
      tags: [],
      actor_type: sourceNode?.node_type,
      target_type: targetNode?.node_type,
      actor_id: String(sourceId),
      target_id: String(targetId),
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

// Back-compat: keep old name for now
export async function fetchActorRelationships(
  actorId: string,
  clusterIds: number[],
  categories: string[],
  yearRange: [number, number],
  includeUndated: boolean,
  keywords: string,
  maxHops: number | null,
  timeScope: TimeScope
): Promise<{ relationships: Relationship[]; totalBeforeFilter: number }> {
  ensureGraphLoadedOrThrow();

  const actorNode = cachedGraph!.nodes.find((n) => n.id === actorId && n.time === timeScope);
  if (!actorNode) return { relationships: [], totalBeforeFilter: 0 };

  const nodeMap = new Map(
    cachedGraph!.nodes.map((n) => [scopedKey(n.time as TimeScope, String(n.id)), n] as const)
  );

  const relatedLinks = cachedGraph!.links.filter((link) => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;
    return link.time === timeScope && (sourceId === actorNode.id || targetId === actorNode.id);
  });

  const relationships: Relationship[] = relatedLinks.map((link, idx) => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;

    const sourceNode = nodeMap.get(scopedKey(timeScope, String(sourceId)));
    const targetNode = nodeMap.get(scopedKey(timeScope, String(targetId)));

    return {
      id: idx,
      doc_id: String(sourceId),
      timestamp: (link as any).timestamp || null,
      actor: sourceNode?.name || String(sourceId),
      action: link.action,
      target: targetNode?.name || String(targetId),
      location: (link as any).location || null,
      tags: [],
      actor_type: sourceNode?.node_type,
      target_type: targetNode?.node_type,
      actor_id: String(sourceId),
      target_id: String(targetId),
      definition: link.definition,
      actor_display_label: sourceNode?.display_label,
      target_display_label: targetNode?.display_label,
    };
  });

  return {
    relationships,
    totalBeforeFilter: relatedLinks.length,
  };
}

// Preferred new name (callers can migrate to this)
export async function fetchNodeRelationships(
  nodeId: string,
  clusterIds: number[],
  categories: string[],
  yearRange: [number, number],
  includeUndated: boolean,
  keywords: string,
  maxHops: number | null,
  timeScope: TimeScope
): Promise<{ relationships: Relationship[]; totalBeforeFilter: number }> {
  return fetchActorRelationships(
    nodeId,
    clusterIds,
    categories,
    yearRange,
    includeUndated,
    keywords,
    maxHops,
    timeScope
  );
}

// Back-compat: keep old name for now
export async function fetchActorCounts(
  limit: number,
  actorIds?: string[],
  timeScope?: TimeScope
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

// Preferred new name
export async function fetchNodeCounts(
  limit: number,
  nodeIds?: string[],
  timeScope?: TimeScope
): Promise<Record<string, number>> {
  return fetchActorCounts(limit, nodeIds, timeScope);
}

// Search only within the current timeScope
export async function searchActors(query: string, timeScope: TimeScope): Promise<Actor[]> {
  ensureGraphLoadedOrThrow();

  const lowerQuery = query.toLowerCase();
  
  // Filter to only nodes in the current timeScope
  const pool = cachedGraph!.nodes.filter((n) => n.time === timeScope);

  const matches = pool
    .filter((node) => {
      const nameMatch = (node.name ?? '').toLowerCase().includes(lowerQuery);
      const labelMatch = (node.display_label ?? '').toLowerCase().includes(lowerQuery);
      return nameMatch || labelMatch;
    })
    .map((node) => ({
      id: node.id,
      name: node.display_label || node.name, // Use display_label if available
      connection_count: node.val || 0,
      time: node.time,
    }))
    .sort((a, b) => a.name.localeCompare(b.name)) // Sort alphabetically by name
    .slice(0, 20);

  return matches;
}

export async function fetchDocument(docId: string, timeScope: TimeScope): Promise<Document> {
  ensureGraphLoadedOrThrow();
  const node = cachedGraph!.nodes.find((n) => n.id === docId && n.time === timeScope);

  return {
    doc_id: docId,
    file_path: '',
    one_sentence_summary: `US Code node ${docId}`,
    paragraph_summary: 'Details for this node are derived from the US Code network data.',
    category: 'US Code',
    date_range_earliest: null,
    date_range_latest: null,
    full_name: node?.full_name,
    text: (node as any)?.properties?.text ?? node?.text,
    title: node?.title,
    part: node?.part,
    chapter: node?.chapter,
    subchapter: node?.subchapter,
    section: node?.section,
    subsection: node?.subsection,
    subtitle: node?.subtitle,
  };
}

export async function fetchDocumentText(
  docId: string,
  timeScope: TimeScope
): Promise<{ text: string }> {
  ensureGraphLoadedOrThrow();

  const node = cachedGraph!.nodes.find((n) => n.id === docId && n.time === timeScope);

  const text =
    (node as any)?.properties?.text ||
    node?.text ||
    (node as any)?.section_text ||
    (node as any)?.properties?.full_name ||
    (node as any)?.full_name ||
    'No text available for this node.';

  return { text };
}

export async function fetchNodeDetails(nodeId: string, timeScope: TimeScope): Promise<any> {
  ensureGraphLoadedOrThrow();

  let node = cachedGraph!.nodes.find((n) => n.id === nodeId && n.time === timeScope);
  if (!node) node = cachedGraph!.nodes.find((n) => n.name === nodeId && n.time === timeScope);
  if (!node) return null;

  return { ...node, ...(node as any).properties };
}
