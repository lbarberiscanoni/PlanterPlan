import React from 'react';

/**
 * ResourceCreateModal
 * Temporary scaffold modal surfaced from the MasterLibraryPicker when users
 * choose to create a new resource. This will be expanded in a future phase.
 */
const ResourceCreateModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Create Resource</h2>
          <p className="mt-2 text-sm text-gray-600">TODO: build create resource flow.</p>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResourceCreateModal;
