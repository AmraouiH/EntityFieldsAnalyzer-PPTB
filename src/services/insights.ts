import { ColumnLimit, LowUsage, type Analysis, type Field } from '../models/types';

/** A value of a chart, with the filter applied to the Fields tab when it is clicked. */
export interface Point {
    key: string;
    value: number;
    secondary?: number;
    test?: (field: Field) => boolean;
}

export type Insights = ReturnType<typeof buildInsights>;

export function weightOf(type: string): 1 | 2 | 3 {
    if (type === 'Lookup' || type === 'Owner') return 3;
    if (type === 'Status' || type === 'Boolean' || type === 'Picklist' || type === 'Money') return 2;
    return 1;
}

export const prefixOf = (name: string): string => (name.indexOf('_') > 0 ? name.substring(0, name.indexOf('_') + 1) : '');
export const isLookup = (f: Field) => f.type === 'Lookup' || f.type === 'Owner' || f.type === 'Customer';
export const isRequired = (f: Field) => f.requiredLevel === 'ApplicationRequired' || f.requiredLevel === 'SystemRequired';

export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const item of items) {
        const k = key(item);
        const list = map.get(k);
        if (list) list.push(item);
        else map.set(k, [item]);
    }
    return map;
}

const descending = (a: Point, b: Point) => b.value - a.value;

function buildTimeline(fields: Field[]): { timeline: Point[]; byMonth: boolean } {
    const dated = fields.filter((f) => f.createdOn && f.createdOn > '2000-01-01');
    if (!dated.length) return { timeline: [], byMonth: false };
    const days = dated.map((f) => f.createdOn!).sort();
    const first = new Date(days[0]);
    const last = new Date(days[days.length - 1]);
    const byMonth = (last.getTime() - first.getTime()) / 864e5 <= 730;
    const length = byMonth ? 7 : 4;
    const buckets = groupBy(dated, (f) => f.createdOn!.substring(0, length));
    const timeline: Point[] = [];
    const cursor = new Date(Date.UTC(first.getUTCFullYear(), byMonth ? first.getUTCMonth() : 0, 1));
    while (cursor <= last) {
        const key = cursor.toISOString().substring(0, length);
        const list = buckets.get(key) ?? [];
        const custom = list.filter((f) => f.custom).length;
        timeline.push({ key, value: custom, secondary: list.length - custom, test: (f) => !!f.createdOn?.startsWith(key) });
        if (byMonth) cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        else cursor.setUTCFullYear(cursor.getUTCFullYear() + 1);
    }
    return { timeline, byMonth };
}

/** Everything the charts and the export need (port of FieldInsights.cs). No UI, no service call. */
export function buildInsights(analysis: Analysis) {
    const { fields } = analysis;
    const total = fields.length;
    const hasUsage = analysis.mode === 'usage';
    const count = (test: (f: Field) => boolean) => fields.filter(test).length;
    const point = (key: string, test: (f: Field) => boolean): Point => ({ key, value: count(test), test });
    const share = (key: string, test: (f: Field) => boolean): Point => ({ key, value: total ? (count(test) * 100) / total : 0, test });

    const byType = [...groupBy(fields, (f) => f.type)];
    const weights = { 1: 0, 2: 0, 3: 0 };
    for (const [type, list] of byType) weights[weightOf(type)] += list.length * weightOf(type);
    const used = weights[1] + weights[2] + weights[3];

    const prefixes = [...groupBy(fields.filter((f) => f.custom && !!prefixOf(f.name)), (f) => prefixOf(f.name))]
        .map(([key, list]): Point => ({ key, value: list.length, test: (f) => f.custom && prefixOf(f.name) === key }))
        .sort(descending);
    const publishers = prefixes.slice(0, 7);
    if (prefixes.length > publishers.length) {
        const others = new Set(prefixes.slice(7).map((p) => p.key));
        publishers.push(point('others', (f) => f.custom && others.has(prefixOf(f.name))));
    }

    const band = (key: string, from: number, to: number) => point(key, (f) => f.usage > from && f.usage <= to);

    return {
        total,
        hasUsage,
        customCount: count((f) => f.custom),
        unmanagedCount: count((f) => !f.managed),
        types: byType.map(([key, list]): Point => ({ key, value: list.length, test: (f) => f.type === key })).sort(descending),
        origin: [
            point('standard', (f) => !f.custom && f.managed),
            point('customManaged', (f) => f.custom && f.managed),
            point('customUnmanaged', (f) => f.custom && !f.managed),
            point('standardUnmanaged', (f) => !f.custom && !f.managed),
        ].filter((p, i) => i < 3 || p.value > 0),
        settings: [
            share('audit', (f) => f.auditable),
            share('find', (f) => f.searchable),
            share('required', (f) => f.requiredLevel !== 'None'),
            share('secured', (f) => f.secured),
        ],
        publishers,
        ...buildTimeline(fields),
        weights,
        used,
        available: Math.max(0, ColumnLimit - used),
        cost: byType.map(([key, list]): Point => ({ key, value: list.length * weightOf(key), test: (f) => f.type === key })).sort(descending),
        unused: hasUsage ? count((f) => f.usage <= 0) : 0,
        low: hasUsage ? count((f) => f.usage > 0 && f.usage < LowUsage) : 0,
        average: hasUsage && total ? fields.reduce((sum, f) => sum + f.usage, 0) / total : 0,
        distribution: hasUsage
            ? [point('0%', (f) => f.usage <= 0), band('< 1%', 0, 1), band('1–10%', 1, 10), band('10–50%', 10, 50), band('50–90%', 50, 90), band('> 90%', 90, Infinity)]
            : [],
        fillByType: hasUsage
            ? byType.map(([key, list]): Point => ({ key, value: list.reduce((sum, f) => sum + f.usage, 0) / list.length, test: (f) => f.type === key })).sort(descending)
            : [],
        leastUsed: hasUsage
            ? fields
                  .filter((f) => f.custom && !f.key)
                  .sort((a, b) => a.usage - b.usage || a.name.localeCompare(b.name, 'en'))
                  .slice(0, 12)
                  .map((field): Point => ({ key: field.name, value: field.usage, test: (f) => f.name === field.name }))
            : [],
    };
}

/** Calculator of the Capacity tab. Exactly the number of columns left still fits. */
export function plan(used: number, lookups: number, options: number, others: number) {
    const needed = lookups * 3 + options * 2 + others;
    const available = ColumnLimit - used;
    return { needed, available, fits: needed <= available };
}
