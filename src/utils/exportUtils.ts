/**
 * Export utilities for network graph data
 * Designed to be extensible for future network metrics integration
 */

import type { GraphNode, GraphLink, TimeScope, SelectedNode } from '../types';

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

interface ExportMetadata {
  year?: TimeScope | null;
  title?: string | null;
  filterTypes?: string[] | null;
  searchTerm?: string | null;
}

interface ExportOptions extends ExportMetadata {
  format?: 'separate' | 'edgelist';
}

interface FilenameOptions {
  type?: 'nodes' | 'links' | 'edgelist';
  year?: string;
  title?: string;
  filter?: string;
  timestamp?: boolean;
}

interface PNGExportOptions {
  backgroundColor?: string;
  scale?: number;
  includeLabels?: boolean;
}

interface ImageMetadata {
  title?: string;
  timeScope?: TimeScope;
  buildMode?: 'topDown' | 'bottomUp';
  nodeCount?: number;
  selectedNode?: SelectedNode;
}

/**
 * Escapes special characters in CSV fields
 */
export function escapeCSVField(field: any): string {
  if (field === null || field === undefined) return '';
  const stringField = String(field);
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
    return `"${stringField.replace(/"/g, '""')}"`;
  }
  return stringField;
}

/**
 * Converts nodes array to CSV string
 * @param nodes - Array of node objects
 * @param metadata - Optional metadata (year, title, filters, etc.)
 * @returns CSV formatted string
 */
export function nodesToCSV(nodes: GraphNode[], metadata: ExportMetadata = {}): string {
  if (!nodes || nodes.length === 0) {
    return 'No nodes to export';
  }

  // Build metadata header as comments
  let csv = '';
  if (metadata.year) csv += `# Year: ${metadata.year}\n`;
  if (metadata.title) csv += `# Title: ${metadata.title}\n`;
  if (metadata.filterTypes) csv += `# Filtered Types: ${metadata.filterTypes.join(', ')}\n`;
  if (metadata.searchTerm) csv += `# Search Term: ${metadata.searchTerm}\n`;
  csv += `# Export Date: ${new Date().toISOString()}\n`;
  csv += `# Total Nodes: ${nodes.length}\n`;
  csv += '\n';

  // Get all unique keys from nodes (for extensibility with future metrics)
  const allKeys = new Set<string>();
  nodes.forEach(node => {
    Object.keys(node).forEach(key => allKeys.add(key));
  });
  
  // Reserve space for future metric columns (will be empty now)
  const metricColumns = [
    'degree',
    'betweenness_centrality',
    'closeness_centrality',
    'eigenvector_centrality',
    'pagerank',
    'clustering_coefficient'
  ];
  
  const headers = [...Array.from(allKeys), ...metricColumns];
  csv += headers.map(escapeCSVField).join(',') + '\n';

  // Add rows
  nodes.forEach(node => {
    const row = headers.map(header => {
      // Return node value or empty string for future metric columns
      return escapeCSVField((node as any)[header] || '');
    });
    csv += row.join(',') + '\n';
  });

  return csv;
}

/**
 * Converts links array to CSV string
 * @param links - Array of link objects
 * @param metadata - Optional metadata
 * @returns CSV formatted string
 */
export function linksToCSV(links: GraphLink[], metadata: ExportMetadata = {}): string {
  if (!links || links.length === 0) {
    return 'No links to export';
  }

  // Build metadata header
  let csv = '';
  if (metadata.year) csv += `# Year: ${metadata.year}\n`;
  if (metadata.title) csv += `# Title: ${metadata.title}\n`;
  csv += `# Export Date: ${new Date().toISOString()}\n`;
  csv += `# Total Links: ${links.length}\n`;
  csv += '\n';

  // Get all unique keys from links
  const allKeys = new Set<string>();
  links.forEach(link => {
    Object.keys(link).forEach(key => allKeys.add(key));
  });

  // Ensure source and target are first columns
  const headers = ['source', 'target', ...Array.from(allKeys).filter(k => k !== 'source' && k !== 'target')];
  csv += headers.map(escapeCSVField).join(',') + '\n';

  // Add rows
  links.forEach(link => {
    const row = headers.map(header => {
      let value = (link as any)[header];
      // Handle D3 object references (source/target might be objects)
      if (typeof value === 'object' && value !== null) {
        value = value.id || value.toString();
      }
      return escapeCSVField(value || '');
    });
    csv += row.join(',') + '\n';
  });

  return csv;
}

/**
 * Converts nodes and links to combined edge list CSV
 * Useful for importing into network analysis tools
 * @param nodes - Array of node objects
 * @param links - Array of link objects
 * @param metadata - Optional metadata
 * @returns CSV formatted string
 */
export function toEdgeListCSV(nodes: GraphNode[], links: GraphLink[], metadata: ExportMetadata = {}): string {
  if (!links || links.length === 0) {
    return 'No links to export';
  }

  // Create node lookup for attributes
  const nodeMap = new Map<string, GraphNode>();
  nodes.forEach(node => {
    nodeMap.set(node.id, node);
  });

  // Build metadata header
  let csv = '';
  if (metadata.year) csv += `# Year: ${metadata.year}\n`;
  if (metadata.title) csv += `# Title: ${metadata.title}\n`;
  csv += `# Export Date: ${new Date().toISOString()}\n`;
  csv += `# Format: Edge List with Node Attributes\n`;
  csv += '\n';

  // Headers: source info, target info
  const headers = [
    'source_id',
    'source_type',
    'source_label',
    'target_id',
    'target_type',
    'target_label'
  ];
  csv += headers.join(',') + '\n';

  // Add rows
  links.forEach(link => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;
    
    const sourceNode = nodeMap.get(sourceId) || {} as GraphNode;
    const targetNode = nodeMap.get(targetId) || {} as GraphNode;

    const row = [
      escapeCSVField(sourceId),
      escapeCSVField(sourceNode.node_type || ''),
      escapeCSVField(sourceNode.name || ''),
      escapeCSVField(targetId),
      escapeCSVField(targetNode.node_type || ''),
      escapeCSVField(targetNode.name || '')
    ];
    csv += row.join(',') + '\n';
  });

  return csv;
}

/**
 * Triggers browser download of CSV content
 * @param csvContent - CSV formatted string
 * @param filename - Name for downloaded file
 */
export function downloadCSV(csvContent: string, filename: string): void {
  const BOM = '\uFEFF';
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    // Create URL and trigger download
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up URL object
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }
}

/**
 * Generates filename with timestamp and metadata
 * @param options - Filename components
 * @returns Formatted filename
 */
export function generateFilename(options: FilenameOptions = {}): string {
  const {
    type = 'nodes', // 'nodes', 'links', 'edgelist'
    year = '',
    title = '',
    filter = '',
    timestamp = true
  } = options;

  let filename = 'taxcode';
  if (title) filename += `_${title}`;
  if (year) filename += `_${year}`;
  if (filter) filename += `_${filter}`;
  filename += `_${type}`;
  if (timestamp) {
    const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    filename += `_${date}`;
  }
  filename += '.csv';

  return filename;
}

/**
 * Main export function - orchestrates the export process
 * @param graphData - Object containing nodes and links
 * @param options - Export configuration
 */
export function exportGraphData(graphData: GraphData, options: ExportOptions = {}): void {
  const {
    format = 'separate', // 'separate' (2 files), 'edgelist' (1 file)
    year = null,
    title = null,
    filterTypes = null,
    searchTerm = null
  } = options;

  const metadata: ExportMetadata = {
    year,
    title,
    filterTypes,
    searchTerm
  };

  if (format === 'edgelist') {
    // Single combined file
    const csv = toEdgeListCSV(graphData.nodes, graphData.links, metadata);
    const filename = generateFilename({
      type: 'edgelist',
      year: year || '',
      title: title || '',
      filter: filterTypes ? filterTypes.join('-') : 'all'
    });
    downloadCSV(csv, filename);
  } else {
    // Separate files for nodes and links
    const nodesCSV = nodesToCSV(graphData.nodes, metadata);
    const linksCSV = linksToCSV(graphData.links, metadata);
    
    const nodesFilename = generateFilename({
      type: 'nodes',
      year: year || '',
      title: title || '',
      filter: filterTypes ? filterTypes.join('-') : 'all'
    });
    const linksFilename = generateFilename({
      type: 'links',
      year: year || '',
      title: title || '',
      filter: filterTypes ? filterTypes.join('-') : 'all'
    });

    downloadCSV(nodesCSV, nodesFilename);
    // Slight delay to avoid browser blocking multiple downloads
    setTimeout(() => downloadCSV(linksCSV, linksFilename), 100);
  }
}

/**
 * Exports the current graph view as PNG
 * @param svgElement - The SVG element containing the graph
 * @param filename - Name for the downloaded file
 * @param options - Export options
 */
export function exportGraphToPNG(svgElement: SVGSVGElement, filename: string, options: PNGExportOptions = {}): void {
  const {
    backgroundColor = '#111827', // gray-900 from your CSS
    scale = 2, // Higher quality (2x resolution)
  } = options;

  try {
    // Get the current SVG dimensions
    const bbox = svgElement.getBoundingClientRect();
    const width = bbox.width;
    const height = bbox.height;

    // Clone the SVG to avoid modifying the original
    const clonedSvg = svgElement.cloneNode(true) as SVGSVGElement;
    clonedSvg.setAttribute('width', String(width));
    clonedSvg.setAttribute('height', String(height));

    // Get the current transform from the <g> element (zoom/pan state)
    const gElement = svgElement.querySelector('g');
    let transform = '';
    if (gElement) {
      transform = gElement.getAttribute('transform') || '';
    }

    // Apply transform to cloned SVG
    const clonedG = clonedSvg.querySelector('g');
    if (clonedG && transform) {
      clonedG.setAttribute('transform', transform);
    }

    // Remove UI overlays (time scope label, instructions) from clone
    const overlays = clonedSvg.querySelectorAll('foreignObject, .overlay');
    overlays.forEach(el => el.remove());

    // Serialize SVG to string
    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(clonedSvg);

    // Add XML declaration and make it standalone
    svgString = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
${svgString}`;

    // Create a Blob from the SVG string
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    // Create an Image element to load the SVG
    const img = new Image();
    
    img.onload = () => {
      // Create canvas with scaled dimensions for higher quality
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('Failed to get canvas context');
        URL.revokeObjectURL(url);
        return;
      }

      // Scale context for higher resolution
      ctx.scale(scale, scale);

      // Fill background
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);

      // Draw SVG onto canvas
      ctx.drawImage(img, 0, 0, width, height);

      // Convert canvas to blob and trigger download
      canvas.toBlob((blob) => {
        if (!blob) {
          console.error('Failed to create PNG blob');
          URL.revokeObjectURL(url);
          return;
        }

        const link = document.createElement('a');
        link.download = filename;
        link.href = URL.createObjectURL(blob);
        link.click();

        // Cleanup
        URL.revokeObjectURL(url);
        URL.revokeObjectURL(link.href);
      }, 'image/png');
    };

    img.onerror = (error) => {
      console.error('Error loading SVG into image:', error);
      URL.revokeObjectURL(url);
    };

    img.src = url;
  } catch (error) {
    console.error('Error exporting graph to PNG:', error);
    throw error;
  }
}

/**
 * Main export orchestrator for PNG
 * @param svgElement - The SVG element
 * @param metadata - Graph metadata for filename
 */
export function exportGraphImage(svgElement: SVGSVGElement, metadata: ImageMetadata = {}): void {
  const {
    title = '26',
    timeScope = '2025',
    buildMode = 'topDown',
    nodeCount = 0,
    selectedNode = null,
  } = metadata;

  let filename = `taxcode_title${title}_${timeScope}_${buildMode}`;
  
  if (selectedNode) {
    filename += `_node-${selectedNode.id.replace(/[^a-zA-Z0-9]/g, '-')}`;
  }
  
  filename += `_${nodeCount}nodes`;
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  filename += `_${timestamp}.png`;

  exportGraphToPNG(svgElement, filename, {
    backgroundColor: '#111827',
    scale: 2,
  });
}
