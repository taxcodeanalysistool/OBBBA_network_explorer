// src/types.ts

export type NodeType = 'section' | 'entity' | 'concept' | 'index';

export interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  node_type: NodeType;

  // New: dataset scope fields
  time?: 'pre-OBBBA' | 'post-OBBBA';
  source_title?: string;

  
  // Runtime computed properties
  val?: number;
  totalVal?: number;
  color?: string;
  baseColor?: string;

  // Hierarchy fields (parsed from node name)
  title?: string | null;
  subtitle?: string | null;
  part?: string | null;
  chapter?: string | null;
  subchapter?: string | null;
  section?: string | null;
  subsection?: string | null;
  display_label?: string | null;

  // Properties from CSV data
  properties?: {
    full_name?: string;
    text?: string;
    definition?: string;
    [key: string]: any;
  };

  // Legacy compatibility (mapped from properties or hierarchy)
  full_name?: string;
  text?: string;
  section_text?: string | null;
  term_type?: string;
  index_heading?: string;

  // D3 simulation properties (inherited from d3.SimulationNodeDatum)
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  edge_type: 'definition' | 'reference' | 'hierarchy';
  action: string;

  // New: dataset scope fields
  time?: 'pre-OBBBA' | 'post-OBBBA';
  source_title?: string;

  
  definition?: string;
  location?: string;
  timestamp?: string;
  weight?: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface Relationship {
  id: number;
  doc_id: string;
  timestamp: string | null;
  actor: string;
  action: string;
  target: string;
  location: string | null;
  tags: string[];

  actor_type?: NodeType;
  target_type?: NodeType;
  actor_id?: string;
  target_id?: string;
  definition?: string;
  actor_display_label?: string; 
  target_display_label?: string;
}

export interface Actor {
  id: string;
  name: string;
  connection_count: number;
}


export interface Stats {
  totalDocuments: { count: number };
  totalTriples: { count: number };
  totalActors: { count: number };
  categories: { category: string; count: number }[];
}

export interface Document {
  doc_id: string;
  file_path: string;
  one_sentence_summary: string;
  paragraph_summary: string;
  category: string;
  date_range_earliest: string | null;
  date_range_latest: string | null;
  
  full_name?: string;
  text?: string;
  title?: string | null;
  subtitle?: string | null;
  part?: string | null;
  chapter?: string | null;
  subchapter?: string | null;
  section?: string | null;
  subsection?: string | null;
}

export interface TagCluster {
  id: number;
  name: string;
  exemplars: string[];
  tagCount: number;
}

export interface NetworkBuilderState {
  searchTerms: string[];
  searchFields: ('text' | 'full_name' | 'display_label' | 'definition' | 'entity' | 'concept' | 'properties')[];
  allowedNodeTypes: ('section' | 'entity' | 'concept' | 'index')[];
  allowedEdgeTypes: ('definition' | 'reference' | 'hierarchy')[];
  allowedTitles: number[];
  allowedSections: string[];
  seedNodeIds: string[];
  expansionDepth: number;
  maxNodesPerExpansion: number;
  maxTotalNodes: number;
}

export interface FilteredGraph {
  nodes: GraphNode[];
  links: GraphLink[];
  truncated: boolean;
  matchedCount: number;
}
