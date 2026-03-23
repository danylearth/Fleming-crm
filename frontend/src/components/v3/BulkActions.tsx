import React from 'react';
import { Trash2 } from 'lucide-react';

interface BulkActionsProps {
  selectedIds: number[];
  onClearSelection: () => void;
  onBulkDelete: () => void;
  entityName: string;
  isDeleting?: boolean;
}

export default function BulkActions({
  selectedIds,
  onClearSelection,
  onBulkDelete,
  entityName,
  isDeleting = false,
}: BulkActionsProps) {
  if (selectedIds.length === 0) return null;

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--accent-orange)]/30 rounded-xl p-4 mb-6 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-4">
        <span className="text-[var(--text-primary)] font-medium">
          {selectedIds.length} {entityName}{selectedIds.length !== 1 ? 's' : ''} selected
        </span>
        <button
          onClick={onClearSelection}
          className="text-[var(--accent-orange)] hover:text-[var(--accent-orange)]/80 text-sm underline"
        >
          Clear selection
        </button>
      </div>

      <button
        onClick={onBulkDelete}
        disabled={isDeleting}
        className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-500 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
      >
        <Trash2 className="w-4 h-4" />
        {isDeleting ? 'Deleting...' : 'Delete Selected'}
      </button>
    </div>
  );
}
