import { useMemo, useState } from 'react';
import { Checkbox, Input, Select } from '@fluentui/react-components';
import { DismissRegular, SearchRegular } from '@fluentui/react-icons';
import { useStrings } from '../i18n/I18nContext';
import type { Strings } from '../i18n/strings';
import { ExtraColumns, type Field, type Value } from '../models/types';
import { EmptyState } from './Common';

export type Chip = 'all' | 'custom' | 'unmanaged' | 'required' | 'never';
export type DrillKind = 'type' | 'origin' | 'setting' | 'prefix' | 'created' | 'fill' | 'field' | 'rarely';

export interface Drill {
    kind: DrillKind;
    key: string;
    test: (field: Field) => boolean;
}

export interface FieldFilters {
    chip: Chip;
    drill?: Drill;
    type: string;
    search: string;
}

export const noFilters: FieldFilters = { chip: 'all', type: '', search: '' };

const chipTests: Record<Chip, (field: Field) => boolean> = {
    all: () => true,
    custom: (f) => f.custom,
    unmanaged: (f) => !f.managed,
    required: (f) => f.requiredLevel !== 'None',
    never: (f) => f.usage <= 0,
};

/** Text of the active drill-down chip, in the current language. */
function drillText({ kind, key }: Drill, s: Strings): string {
    if (kind === 'setting') return s.label(key);
    if (kind === 'rarely') return s.rarelyUsed;
    if (kind === 'created') return `${s.drill.created}: ${s.period(key)}`;
    return `${s.drill[kind]}: ${s.label(key)}`;
}

interface Column {
    id: string;
    header: string;
    get: (field: Field) => Value;
    show?: (field: Field) => string;
}

function gridColumns(s: Strings, withUsage: boolean, allColumns: boolean): Column[] {
    const c = s.columns;
    const yesNo = (value: boolean) => (value ? s.yes : s.no);
    const columns: Column[] = [
        { id: 'displayName', header: c.displayName, get: (f) => f.displayName || 'N/A' },
        { id: 'name', header: c.schemaName, get: (f) => f.name },
    ];
    if (withUsage) columns.push({ id: 'usage', header: c.percent, get: (f) => f.usage, show: (f) => s.P(f.usage, 2) });
    columns.push(
        { id: 'type', header: c.type, get: (f) => f.type },
        { id: 'description', header: c.description, get: (f) => f.description },
        { id: 'target', header: c.target, get: (f) => f.target },
        { id: 'managed', header: c.managed, get: (f) => s.managedValue(f.managed) },
        { id: 'custom', header: c.custom, get: (f) => f.custom, show: (f) => yesNo(f.custom) },
        { id: 'auditable', header: c.auditable, get: (f) => f.auditable, show: (f) => yesNo(f.auditable) },
        { id: 'searchable', header: c.searchable, get: (f) => f.searchable, show: (f) => yesNo(f.searchable) },
        { id: 'required', header: c.required, get: (f) => f.requiredLevel },
        { id: 'version', header: c.version, get: (f) => f.introducedVersion },
        { id: 'created', header: c.created, get: (f) => f.createdOn },
        { id: 'modified', header: c.modified, get: (f) => f.modifiedOn },
    );
    if (allColumns) {
        for (const key of ExtraColumns) {
            const show = (f: Field) => {
                const value = f.extra[key];
                return typeof value === 'boolean' ? yesNo(value) : String(value ?? '');
            };
            columns.push({ id: key, header: key, get: (f) => f.extra[key], show });
        }
    }
    return columns;
}

function compare(a: Value, b: Value): number {
    if (a === b) return 0;
    if (a === null) return -1;
    if (b === null) return 1;
    return typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b) : Number(a) - Number(b);
}

interface FieldsPageProps {
    fields: Field[];
    /** False without data usage, or when no record was read. */
    withUsage: boolean;
    filters: FieldFilters;
    allColumns: boolean;
    onFilters: (filters: FieldFilters) => void;
    onAllColumns: (all: boolean) => void;
}

export function FieldsPage(props: FieldsPageProps) {
    const s = useStrings();
    const { fields, withUsage, filters, allColumns, onFilters } = props;
    const [sort, setSort] = useState({ id: 'name', descending: false });

    const columns = useMemo(() => gridColumns(s, withUsage, allColumns), [s, withUsage, allColumns]);
    const types = useMemo(() => [...new Set(fields.map((f) => f.type))].sort(), [fields]);
    const rows = useMemo(() => {
        const text = filters.search.trim().toLowerCase();
        const shown = fields.filter(
            (f) =>
                chipTests[filters.chip](f) &&
                (!filters.drill || filters.drill.test(f)) &&
                (!filters.type || f.type === filters.type) &&
                (!text || f.name.includes(text) || f.displayName.toLowerCase().includes(text)),
        );
        const column = columns.find((c) => c.id === sort.id);
        if (column) shown.sort((a, b) => compare(column.get(a), column.get(b)) * (sort.descending ? -1 : 1));
        return shown;
    }, [fields, filters, columns, sort]);

    const chips: [Chip, string][] = [
        ['all', s.all],
        ['custom', s.customFields],
        ['unmanaged', s.unmanaged],
        ['required', s.required],
    ];
    if (withUsage) chips.push(['never', s.neverUsed]);

    return (
        <section className="efa-card efa-fields">
            <div className="efa-chips">
                {chips.map(([chip, caption]) => (
                    <button type="button" key={chip} className="efa-chip" aria-pressed={filters.chip === chip} onClick={() => onFilters({ ...filters, chip })}>
                        {caption}
                    </button>
                ))}
                {filters.drill && (
                    <span className="efa-drill">
                        {drillText(filters.drill, s)}
                        <button type="button" aria-label={s.removeFilter} title={s.removeFilter} onClick={() => onFilters({ ...filters, drill: undefined })}>
                            <DismissRegular />
                        </button>
                    </span>
                )}
            </div>
            <div className="efa-toolbar">
                <Select aria-label={s.fieldType} value={filters.type} onChange={(_e, data) => onFilters({ ...filters, type: data.value })}>
                    <option value="">{s.allTypes}</option>
                    {types.map((type) => (
                        <option key={type} value={type}>
                            {type}
                        </option>
                    ))}
                </Select>
                <Input aria-label={s.searchField} placeholder={s.searchField} contentBefore={<SearchRegular />} value={filters.search} onChange={(_e, data) => onFilters({ ...filters, search: data.value })} />
                <Checkbox label={s.allColumns} checked={allColumns} onChange={(_e, data) => props.onAllColumns(data.checked === true)} />
                <span className="efa-result">{s.fieldsCount(rows.length, fields.length)}</span>
            </div>
            {rows.length ? (
                <div className="efa-grid-wrapper">
                    <table className="efa-grid">
                        <thead>
                            <tr>
                                {columns.map((column) => {
                                    const active = sort.id === column.id;
                                    return (
                                        <th key={column.id} aria-sort={active ? (sort.descending ? 'descending' : 'ascending') : undefined}>
                                            <button type="button" onClick={() => setSort({ id: column.id, descending: active && !sort.descending })}>
                                                {column.header}
                                                {active && (sort.descending ? ' ↓' : ' ↑')}
                                            </button>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((field) => (
                                <tr key={field.name} className={withUsage && field.usage <= 0 ? 'efa-unused' : undefined}>
                                    {columns.map((column) => {
                                        const value = column.show ? column.show(field) : String(column.get(field) ?? '');
                                        return (
                                            <td key={column.id} title={value}>
                                                {value}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <EmptyState text={s.fieldsNone} />
            )}
        </section>
    );
}
