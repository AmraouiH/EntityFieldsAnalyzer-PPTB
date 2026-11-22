import type { Strings } from '../../i18n/strings';
import { ColumnLimit, type Analysis } from '../../models/types';
import type { Insights, Point } from '../insights';
import type { ChartSpec } from './chartXml';
import { Sheet } from './xlsx';

/**
 * "Dashboard" sheet (port of DashboardSheet.cs): the KPIs and charts of the tool laid out as cards.
 * The source of the charts is written on the right of the sheet, from column W.
 */

export const Palette = {
    brand: '0F6CBD',
    brandDark: '0C3B5E',
    subtle: 'EBF3FC',
    green: '1A9E6C',
    violet: '8455C4',
    orange: 'CA5010',
    neutral: 'C4CCD6',
    available: 'E1E1E1',
    warning: 'BC4B09',
    danger: 'C50F1F',
    success: '107C10',
    muted: '616161',
};

const Width = 20;
const Half = 10;
const ChartRows = 18;
const DataColumn = 23;

type Series = { name: string; color: string; values: number[]; colors?: string[] };

export function writeDashboard(name: string, analysis: Analysis, i: Insights, s: Strings, subtitle: string): Sheet {
    const p = Palette;
    const sheet = new Sheet(name);
    sheet.gridLines = false;
    sheet.set(1, 1, `${name} - ${analysis.entity.displayName || analysis.entity.logicalName}`, { bold: true, size: 16 });
    sheet.set(2, 1, subtitle, { italic: true, color: p.muted });
    sheet.set(1, DataColumn, s.xl.chartData, { bold: true });
    for (let c = 1; c <= Width; c++) sheet.widths.set(c, 9.5);
    sheet.widths.set(DataColumn, 32);
    for (let c = 1; c <= 4; c++) sheet.widths.set(DataColumn + c, 18);

    let row = 4;
    let dataRow = 4;

    const section = (title: string, newPage: boolean) => {
        if (newPage && row > 4) sheet.breaks.push(row);
        sheet.set(row, 1, title);
        sheet.fill(row, 1, Width, { bold: true, size: 13, color: 'FFFFFF', fill: p.brand, left: true });
        sheet.heights.set(row, 22);
    };

    const tiles = (items: [title: string, value: number, format: string, caption: string, color?: string][]) => {
        items.forEach(([title, value, format, caption, color], index) => {
            const column = 1 + index * 5;
            sheet.set(row + 1, column, title);
            sheet.fill(row + 1, column, column + 3, { size: 9, color: p.muted, fill: p.subtle, left: true });
            sheet.set(row + 2, column, value);
            sheet.fill(row + 2, column, column + 3, { size: 20, bold: true, color: color ?? p.brand, fill: p.subtle, format, left: true });
            sheet.set(row + 3, column, caption);
            sheet.fill(row + 3, column, column + 3, { size: 9, color: p.muted, fill: p.subtle, left: true });
            for (let r = row + 1; r <= row + 3; r++) sheet.merge(r, column, column + 3);
        });
        sheet.heights.set(row + 2, 28);
        row += 5;
    };

    /** Writes the source cells of a chart, then the chart, or a note when there is no data. */
    const chart = (
        kind: ChartSpec['kind'],
        title: string,
        hint: string,
        column: number,
        columns: number,
        categories: string[],
        series: Series[],
        format: string,
        empty: string,
        max?: number,
    ) => {
        sheet.set(dataRow, DataColumn, title, { bold: true });
        if (!categories.length) {
            sheet.set(row, column, title, { bold: true });
            sheet.set(row + 1, column, empty, { italic: true, color: p.muted });
            dataRow += 2;
            return;
        }
        const header = dataRow + 1;
        series.forEach((one, n) => sheet.set(header, DataColumn + 1 + n, one.name, { bold: true }));
        categories.forEach((category, r) => {
            sheet.set(header + 1 + r, DataColumn, category);
            series.forEach((one, n) => sheet.set(header + 1 + r, DataColumn + 1 + n, one.values[r], { format }));
        });
        sheet.charts.push({
            kind,
            title,
            subtitle: hint,
            format,
            max,
            categories,
            at: { row, column, rows: ChartRows - 1, columns },
            source: { row: header, column: DataColumn },
            series: series.map((one, n) => ({ ...one, column: DataColumn + 1 + n })),
        });
        dataRow = header + categories.length + 2;
    };

    const keys = (points: Point[]) => points.map((point) => s.label(point.key));
    const values = (points: Point[], divide = 1) => points.map((point) => point.value / divide);
    const ratio = i.used / ColumnLimit;
    const capacityColor = ratio >= 0.9 ? p.danger : ratio >= 0.75 ? p.warning : p.brand;
    const share = (n: number) => s.ofFields(i.total ? (n * 100) / i.total : 0);

    section(s.overview, false);
    tiles([
        [s.fields, i.total, '#,##0', ''],
        [s.customFields, i.customCount, '#,##0', share(i.customCount)],
        [s.unmanagedFields, i.unmanagedCount, '#,##0', s.managedCount(i.total - i.unmanagedCount)],
        [s.capacityUsed, ratio, '0%', s.columnsLeft(i.available), capacityColor],
    ]);

    chart('bar', s.fieldTypes, '', 1, Half, keys(i.types), [{ name: s.fields, color: p.brand, values: values(i.types) }], '#,##0', s.noField);
    const origin = i.origin.filter((point) => point.value > 0);
    const originColors: Record<string, string> = { standard: p.neutral, customManaged: p.brand, customUnmanaged: p.orange, standardUnmanaged: p.violet };
    chart('doughnut', s.origin, s.originHint, 1 + Half, Half, keys(origin), [{ name: s.fields, color: p.brand, values: values(origin), colors: origin.map((o) => originColors[o.key]) }], '#,##0', s.noField);
    row += ChartRows;

    chart('bar', s.fieldSettings, s.settingsHint, 1, Half, keys(i.settings), [{ name: s.settingsHint, color: p.violet, values: values(i.settings, 100) }], '0%', s.noField, 1.15);
    chart('bar', s.publishers, s.publishersHint, 1 + Half, Half, keys(i.publishers), [{ name: s.customFields, color: p.green, values: values(i.publishers) }], '#,##0', s.noCustom);
    row += ChartRows;

    chart(
        'stackedColumn',
        s.timeline,
        s.granularity(i.byMonth),
        1,
        Width,
        i.timeline.map((point) => s.period(point.key)),
        [
            { name: s.custom, color: p.brand, values: values(i.timeline) },
            { name: s.standard, color: p.neutral, values: i.timeline.map((point) => point.secondary ?? 0) },
        ],
        '#,##0',
        s.noDate,
    );
    row += ChartRows + 1;

    section(s.usage, i.hasUsage);
    if (!i.hasUsage) {
        sheet.set(row + 1, 1, s.xl.notAnalysed, { italic: true, color: p.muted });
        row += 3;
    } else {
        tiles([
            [s.recordsAnalysed, analysis.records, '#,##0', s.recordsRead],
            [s.neverUsedFields, i.unused, '#,##0', share(i.unused), i.unused ? p.danger : p.success],
            [s.rarelyUsed, i.low, '#,##0', s.rarelyCaption, p.warning],
            [s.averageFill, i.average / 100, '0%', s.perField],
        ]);
        const ramp = [p.danger, p.warning, 'EAA33C', '78AADC', p.brand, p.brandDark];
        chart('column', s.distribution, s.distributionHint, 1, Half, keys(i.distribution), [{ name: s.fields, color: p.brand, values: values(i.distribution), colors: ramp }], '#,##0', s.noField);
        chart('bar', s.fillByType, s.fillByTypeHint, 1 + Half, Half, keys(i.fillByType), [{ name: s.averageFill, color: p.green, values: values(i.fillByType, 100) }], '0.0%', s.noField, 1.15);
        row += ChartRows;
        const least = i.leastUsed;
        const colors = least.map((point) => (point.value <= 0 ? p.danger : p.warning));
        chart('bar', s.leastUsed, s.leastUsedHint, 1, Width, keys(least), [{ name: s.xl.fillRate, color: p.warning, values: values(least, 100), colors }], '0.00%', s.noCustom);
        row += ChartRows + 1;
    }

    section(s.capacity, true);
    sheet.set(row + 1, 1, s.budgetHeadline(i.used, i.available), { bold: true, size: 12 });
    sheet.set(row + 2, 1, s.rule, { size: 9, color: p.muted });
    row += 4;
    const budget: Series[] = [
        { name: s.weightNames[3], color: p.brand, values: [i.weights[3]] },
        { name: s.weightNames[2], color: p.green, values: [i.weights[2]] },
        { name: s.weightNames[1], color: p.violet, values: [i.weights[1]] },
        { name: s.availableLabel, color: p.available, values: [i.available] },
    ];
    chart('budget', s.budget, s.budgetHint, 1, Half, [s.capacity], budget, '#,##0', s.noField, Math.max(ColumnLimit, i.used));
    chart('bar', s.cost, s.costHint, 1 + Half, Half, keys(i.cost), [{ name: s.xl.columns, color: p.brand, values: values(i.cost) }], '#,##0', s.noField);
    row += ChartRows;

    sheet.printArea = { rows: row, columns: Width };
    return sheet;
}
