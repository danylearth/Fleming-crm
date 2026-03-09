import type { ReactNode } from 'react';

// ─── Column definition ───
export interface Column<T> {
    /** Unique key for the column */
    key: string;
    /** Header text */
    header: string;
    /** Render function for the cell content */
    render: (row: T) => ReactNode;
    /** Responsive hide class, e.g. 'hidden md:table-cell' */
    hideClass?: string;
    /** Text alignment */
    align?: 'left' | 'right' | 'center';
    /** Fixed width class */
    width?: string;
}

interface DataTableProps<T> {
    columns: Column<T>[];
    data: T[];
    /** Unique key extractor for each row */
    rowKey: (row: T) => string | number;
    /** Click handler for row — typically used for navigation */
    onRowClick?: (row: T) => void;
    /** Optional: render expanded content below a row */
    expandedRow?: (row: T) => ReactNode | null;
    /** Which row is currently expanded */
    expandedId?: string | number | null;
}

export function DataTable<T>({
    columns,
    data,
    rowKey,
    onRowClick,
    expandedRow,
    expandedId,
}: DataTableProps<T>) {
    const alignClass = (align?: string) => {
        if (align === 'right') return 'text-right';
        if (align === 'center') return 'text-center';
        return 'text-left';
    };

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-xs text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                        {columns.map(col => (
                            <th
                                key={col.key}
                                className={`${alignClass(col.align)} py-3 px-4 font-medium ${col.hideClass || ''} ${col.width || ''}`}
                            >
                                {col.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.map(row => {
                        const key = rowKey(row);
                        return (
                            <>
                                <tr
                                    key={key}
                                    onClick={() => onRowClick?.(row)}
                                    className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
                                >
                                    {columns.map(col => (
                                        <td
                                            key={col.key}
                                            className={`py-3 px-4 ${col.hideClass || ''} ${alignClass(col.align)} ${col.width || ''}`}
                                        >
                                            {col.render(row)}
                                        </td>
                                    ))}
                                </tr>
                                {expandedRow && expandedId === key && (
                                    <tr key={`${key}-expanded`}>
                                        <td colSpan={columns.length} className="p-0">
                                            {expandedRow(row)}
                                        </td>
                                    </tr>
                                )}
                            </>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
