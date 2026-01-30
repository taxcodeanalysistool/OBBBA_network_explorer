import React from 'react';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WelcomeModal({ isOpen, onClose }: WelcomeModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-700">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-4 text-white">
            Welcome to the Title 26 Network Explorer
          </h2>

          <div className="space-y-4 text-gray-300">
            <p>
              This tool lets you explore relationships between sections of the U.S. Code
              (Title 26), the entities mentioned in them, and content tags derived from
              the text. [web:455]
            </p>

            <p>
              The network is built from preprocessed Title 26 section data and
              extracted entities/tags; it is a derived representation and may omit
              details present in the full statutory text. [web:455]
            </p>

            <p>
              Click on nodes in the graph to see their relationships in the right
              panel, then expand individual relationships to inspect section or
              entity properties, and open the full section text when needed. [web:471]
            </p>

            <div className="bg-gray-900 border border-gray-600 rounded-lg p-4 mt-6">
              <h3 className="font-semibold text-blue-400 mb-2">How to use:</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-300">
                <li>Search for nodes (sections, entities, tags) using the left sidebar or bottom search.</li>
                <li>Click graph nodes to highlight their relationships and open the right panel.</li>
                <li>Use filters to focus on specific relationship types or tag clusters.</li>
                <li>
                  Expand a relationship in the right panel to see section or entity
                  details, and open full section text in a modal when available.
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Get Started
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
