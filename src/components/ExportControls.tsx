// src/components/ExportControls.tsx

import { useState } from 'react';
import type { GraphNode, GraphLink, TimeScope, SelectedNode } from '../types';
import { exportGraphData, exportGraphImage } from '../utils/exportUtils';

interface ExportControlsProps {
  graphData: { nodes: GraphNode[]; links: GraphLink[] } | null;
  buildMode: 'topDown' | 'bottomUp';
  timeScope: TimeScope;
  selectedTitle: number;
  selectedNode: SelectedNode;
  filterTypes?: string[];
  searchTerm?: string;
  svgElement: SVGSVGElement | null;
  displayGraphInfo?: {
    nodeCount: number;
    linkCount: number;
    truncated: boolean;
    matchedCount: number;
  } | null;
}

export default function ExportControls({
  graphData,
  buildMode,
  timeScope,
  selectedTitle,
  selectedNode,
  filterTypes,
  searchTerm,
  svgElement,
  displayGraphInfo,
}: ExportControlsProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'separate' | 'edgelist'>('separate');

  const handleExportCSV = async () => {
    if (!graphData || graphData.nodes.length === 0) {
      alert('No graph data to export. Please load or search for data first.');
      return;
    }
    setIsExporting(true);
    try {
      exportGraphData(graphData, {
        format: exportFormat,
        year: timeScope,
        title: `Title ${selectedTitle}`,
        filterTypes: filterTypes || null,
        searchTerm: searchTerm || null,
      });
      if (displayGraphInfo?.truncated) {
        alert(
          `✅ Exported ${graphData.nodes.length} nodes and ${graphData.links.length} links.\n\n` +
          `⚠️ Note: This is a filtered subset of ${displayGraphInfo.matchedCount.toLocaleString()} total matching nodes.`
        );
      } else {
        alert(`✅ Exported ${graphData.nodes.length} nodes and ${graphData.links.length} links successfully!`);
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert('❌ Export failed. Check console for details.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPNG = async () => {
    if (!svgElement) {
      alert('Graph is not ready for export. Please wait for it to load.');
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
      setTimeout(() => {
        alert('✅ PNG export started! Check your downloads.');
      }, 100);
    } catch (error) {
      console.error('PNG export failed:', error);
      alert('❌ PNG export failed. Check console for details.');
    } finally {
      setIsExporting(false);
    }
  };

  const hasData = graphData && graphData.nodes.length > 0;
  const nodeCount = graphData?.nodes.length || 0;
  const linkCount = graphData?.links.length || 0;

  return (
    <div className="p-4 border-b border-gray-700">
      <div className="text-base font-semibold mb-3 text-white">Export</div>

      {!hasData && (
        <p className="text-xs text-gray-500 italic mb-3">
          Load graph data or perform a search to enable export.
        </p>
      )}

      {hasData && (
        <div className="text-xs text-gray-400 mb-3">
          {nodeCount.toLocaleString()} nodes · {linkCount.toLocaleString()} links
        </div>
      )}

      {/* Format selector */}
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
            ? 'Downloads two files: nodes CSV + links CSV'
            : 'Downloads one file: combined source/target edge list'}
        </p>
      </div>

      {/* Export buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleExportCSV}
          disabled={isExporting || !hasData}
          className={`flex-1 px-3 py-2 rounded text-xs font-medium transition-colors ${
            hasData && !isExporting
              ? 'bg-green-700 hover:bg-green-600 text-white'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isExporting ? '⏳ Exporting…' : '⬇ CSV'}
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
          {isExporting ? '⏳ Exporting…' : '⬇ PNG'}
        </button>
      </div>
    </div>
  );
}
