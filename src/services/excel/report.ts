import type { Strings } from '../../i18n/strings';
import { ColumnLimit, ExtraColumns, LowUsage, type Analysis, type Field } from '../../models/types';
import { groupBy, isLookup, prefixOf, weightOf, type Insights } from '../insights';
import { buildFindings, Severities } from '../recommendations';
import { Palette, writeDashboard } from './dashboardSheet';
import { buildWorkbook, columnName, range, Sheet, sheetName, type Cell, type Style, type TableColumn } from './xlsx';

/**
 * Excel report (port of ExportManager.cs and AnalysisSheets.cs): metadata, dashboard, summary, recommendations,
 * data usage, by type, by publisher, lookups and timeline.
 */

const Count = '#,##0';
const Percent = '0.0%';
const DateFormat = 'yyyy-mm-dd';
const MetadataHeader = 12;
const Header = 4;

/** Excel serial of a yyyy-mm-dd day. */
export const serial = (day: string | null): number | null => (day ? Date.parse(day) / 864e5 + 25569 : null);
const localSerial = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()) / 864e5 + 25569;

export function reportFileName(logicalName: string, now: Date): string {
    const two = (n: number) => String(n).padStart(2, '0');
    return `${logicalName}_EntityKPIsExport_${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}.xlsx`;
}

function usageBand(percent: number): number {
    if (percent <= 0) return 0;
    if (percent < LowUsage) return 1;
    if (percent < 50) return 2;
    return percent < 90 ? 3 : 4;
}

export function buildSheets(analysis: Analysis, i: Insights, s: Strings, environment: string, now: Date): Sheet[] {
    const { entity, fields, records } = analysis;
    const x = s.xl;
    const c = s.columns;
    const title = entity.displayName || entity.logicalName;
    const subtitle = `${entity.logicalName}  |  ${s.modes[analysis.mode]}  |  ${now.toLocaleString(s.locale, { dateStyle: 'short', timeStyle: 'short' })}`;
    const yesNo = (value: boolean) => (value ? s.yes : s.no);
    const name = (f: Field) => f.displayName || 'N/A';
    const byTypeThenName = (a: Field, b: Field) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name, 'en');

    const titled = (sheet: string, heading: string, hint: string): Sheet => {
        const result = new Sheet(sheet);
        result.set(1, 1, heading, { bold: true, size: 14 });
        result.set(2, 1, hint, { italic: true, color: Palette.muted });
        return result;
    };

    function metadata(): Sheet {
        const sheet = new Sheet(sheetName(entity.logicalName, x.metadata));
        const info: [string, Cell, string?][] = [
            [x.entityName, title],
            [x.entitySchema, entity.logicalName],
            [x.createdOn, serial(entity.createdOn), DateFormat],
            [x.numberFields, i.total, Count],
            [x.numberRecords, i.hasUsage ? records : x.notAnalysed, Count],
            [x.columnsUsed, i.used, `#,##0 "/ ${ColumnLimit}"`],
            [x.volume, i.used / ColumnLimit, Percent],
            [x.mode, s.modes[analysis.mode]],
            [x.exportedOn, localSerial(now), 'yyyy-mm-dd hh:mm'],
            [x.environment, environment],
        ];
        info.forEach(([label, value, format], r) => {
            sheet.set(r + 1, 1, label, { bold: true, size: 12, fill: 'F5DEB3' });
            sheet.set(r + 1, 2, value, { left: true, format });
        });
        sheet.widths.set(1, 34);
        sheet.widths.set(2, 34);

        const columns: (TableColumn & { get: (f: Field) => Cell })[] = [
            { header: c.displayName, get: name },
            { header: c.schemaName, get: (f) => f.name },
            { header: c.description, get: (f) => f.description },
            { header: c.type, get: (f) => f.type },
            { header: c.target, get: (f) => f.target },
            { header: c.managed, get: (f) => s.managedValue(f.managed) },
            { header: c.custom, get: (f) => f.custom },
            { header: c.auditable, get: (f) => f.auditable },
            { header: c.searchable, get: (f) => f.searchable },
            { header: c.required, get: (f) => f.requiredLevel },
            { header: c.version, get: (f) => f.introducedVersion },
            { header: c.created, format: DateFormat, get: (f) => serial(f.createdOn) },
            { header: c.modified, format: DateFormat, get: (f) => serial(f.modifiedOn) },
            ...ExtraColumns.map((key) => ({ header: key, get: (f: Field) => f.extra[key] })),
        ];
        if (i.hasUsage) {
            columns.push({ header: c.filled, format: Count, get: (f) => f.filled });
            // Last column: the "never used" highlight points at it.
            columns.push({ header: c.percent, format: '0.00%', get: (f) => f.usage / 100 });
        }
        const rows = [...fields].sort(byTypeThenName).map((f) => columns.map((column) => column.get(f)));
        if (!sheet.table('tblMetadata', MetadataHeader, columns, rows, x.nothing)) return sheet;
        sheet.freeze = { row: MetadataHeader, column: 2 };
        if (i.hasUsage) {
            const first = MetadataHeader + 1;
            const percentCell = `$${columnName(columns.length)}${first}`;
            sheet.highlights.push({ ref: range(first, 1, MetadataHeader + rows.length, columns.length), formula: `${percentCell}=0` });
        }
        return sheet;
    }

    const findings = buildFindings(analysis, i);

    function summary(): Sheet {
        const sheet = titled(x.summary, `${x.summaryTitle} - ${title}`, subtitle);
        const custom = fields.filter((f) => f.custom);
        let row = 4;
        const section = (heading: string, lines: [string, Cell, string?][]) => {
            const band: Style = { bold: true, size: 12, fill: 'F5DEB3' };
            sheet.set(row, 1, heading, band);
            sheet.set(row, 2, null, band);
            lines.forEach(([label, value, format], n) => {
                sheet.set(row + 1 + n, 1, label, { bold: true });
                sheet.set(row + 1 + n, 2, value, { left: true, format });
            });
            row += lines.length + 2;
        };
        section(x.table, [
            [c.displayName, title],
            [c.schemaName, entity.logicalName],
            [x.createdOn, serial(entity.createdOn), DateFormat],
            [s.recordsAnalysed, i.hasUsage ? records : x.notAnalysed, Count],
        ]);
        section(s.fields, [
            [x.total, i.total, Count],
            [x.standardFields, i.total - custom.length, Count],
            [s.customFields, custom.length, Count],
            [x.ofWhichManaged, custom.filter((f) => f.managed).length, Count],
            [x.ofWhichUnmanaged, custom.filter((f) => !f.managed).length, Count],
            [x.prefixes, new Set(custom.map((f) => prefixOf(f.name))).size, Count],
            [x.lookupCount, fields.filter(isLookup).length, Count],
        ]);
        section(s.capacity, [
            [x.columns, i.used, Count],
            [x.columnsAvailable, i.available, Count],
            [s.capacityUsed, i.used / ColumnLimit, Percent],
            [x.ruleLabel, s.rule],
        ]);
        section(`${s.fieldSettings} (${s.settingsHint})`, i.settings.map((p) => [s.label(p.key), p.value / 100, Percent]));
        if (i.hasUsage) {
            section(s.usage, [
                [s.averageFill, i.average / 100, Percent],
                [s.neverUsedFields, i.unused, Count],
                [s.rarelyUsed, i.low, Count],
            ]);
            const total = Math.max(1, i.total);
            const bands = i.distribution.map((p) => [p.key, p.value, p.value / total]);
            const columns = [{ header: x.band }, { header: s.fields, format: Count }, { header: x.share, format: Percent }];
            if (sheet.table('tblFillDistribution', row, columns, bands, x.nothing)) sheet.bars.push({ ref: range(row + 1, 3, row + bands.length, 3), color: '5B9BD5', max: 1 });
            row += bands.length + 3;
        }
        section(x.findings, Severities.map((severity) => [s.severities[severity], findings.filter((f) => f.severity === severity).length, Count]));
        sheet.widths.set(1, 52);
        sheet.widths.set(2, 30);
        sheet.widths.set(3, 22);
        return sheet;
    }

    function recommendations(): Sheet {
        const sheet = titled(x.recommendations, x.recommendations, x.recommendationsHint);
        const columns: TableColumn[] = [{ header: x.severity }, { header: x.category }, { header: c.schemaName }, { header: c.displayName }, { header: c.type }, { header: c.custom }];
        if (i.hasUsage) columns.push({ header: x.fillRate, format: Percent });
        columns.push({ header: x.issue, width: 55, wrap: true }, { header: x.recommendation, width: 70, wrap: true });
        const rows = findings.map((finding) => {
            const f = finding.field;
            const values: Cell[] = [s.severities[finding.severity], s.category(finding.rule), f?.name ?? entity.logicalName, f ? name(f) : x.tableRow, f?.type, f && yesNo(f.custom)];
            if (i.hasUsage) values.push(f ? f.usage / 100 : null);
            values.push(...s.finding(finding));
            return values;
        });
        if (sheet.table('tblRecommendations', Header, columns, rows, x.nothing)) {
            const colors = { High: ['FFC7CE', '9C0006'], Medium: ['FFEB9C', '9C5700'], Low: ['DDEBF7', '1F4E79'], Info: ['F2F2F2', '595959'] };
            findings.forEach((f, n) => sheet.set(Header + 1 + n, 1, s.severities[f.severity], { bold: true, fill: colors[f.severity][0], color: colors[f.severity][1] }));
        }
        return sheet;
    }

    function usage(): Sheet {
        const sheet = titled(x.usage, s.usage, s.visibility);
        const rows = [...fields]
            .sort((a, b) => a.usage - b.usage || a.name.localeCompare(b.name, 'en'))
            .map((f) => [f.name, name(f), f.type, yesNo(f.custom), s.managedValue(f.managed), f.requiredLevel, f.filled, records - f.filled, f.usage / 100, x.bands[usageBand(f.usage)]]);
        const columns: TableColumn[] = [
            { header: c.schemaName }, { header: c.displayName }, { header: c.type }, { header: c.custom }, { header: c.managed }, { header: c.required },
            { header: c.filled, format: Count }, { header: x.emptyRecords, format: Count }, { header: x.fillRate, format: Percent }, { header: x.usageBand },
        ];
        if (sheet.table('tblDataUsage', Header, columns, rows, x.nothing)) sheet.bars.push({ ref: range(Header + 1, 9, Header + rows.length, 9), color: '63BE7B', max: 1 });
        return sheet;
    }

    function byType(): Sheet {
        const sheet = titled(x.byType, s.fieldTypes, s.rule);
        const columns: TableColumn[] = [
            { header: c.type }, { header: s.fields, sum: true }, { header: s.custom, sum: true }, { header: s.standard, sum: true }, { header: s.unmanaged, sum: true },
            { header: x.weight }, { header: x.columns, sum: true }, { header: x.capacityShare, format: Percent, sum: true },
        ];
        if (i.hasUsage) columns.push({ header: s.averageFill, format: Percent }, { header: s.neverUsedFields, sum: true });
        const rows = [...groupBy(fields, (f) => f.type)]
            .map(([type, list]) => {
                const weight = weightOf(type);
                const custom = list.filter((f) => f.custom).length;
                const values: Cell[] = [type, list.length, custom, list.length - custom, list.filter((f) => !f.managed).length, weight, list.length * weight, (list.length * weight) / ColumnLimit];
                if (i.hasUsage) values.push(list.reduce((sum, f) => sum + f.usage, 0) / list.length / 100, list.filter((f) => f.usage <= 0).length);
                return values;
            })
            .sort((a, b) => (b[6] as number) - (a[6] as number));
        if (sheet.table('tblByType', Header, columns, rows, x.nothing, x.total)) sheet.bars.push({ ref: range(Header + 1, 8, Header + rows.length, 8), color: '5B9BD5' });
        return sheet;
    }

    function byPublisher(): Sheet {
        const sheet = titled(x.byPublisher, s.publishers, s.publishersHint);
        const columns: TableColumn[] = [
            { header: x.prefix }, { header: s.customFields, sum: true }, { header: x.managed, sum: true }, { header: s.unmanaged, sum: true },
            { header: x.columns, sum: true }, { header: x.firstCreated, format: DateFormat }, { header: x.lastCreated, format: DateFormat },
        ];
        if (i.hasUsage) columns.push({ header: s.averageFill, format: Percent }, { header: s.neverUsedFields, sum: true });
        const rows = [...groupBy(fields.filter((f) => f.custom), (f) => prefixOf(f.name) || x.noPrefix)]
            .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
            .map(([prefix, list]) => {
                const days = list.flatMap((f) => f.createdOn ?? []).sort();
                const managed = list.filter((f) => f.managed).length;
                const values: Cell[] = [prefix, list.length, managed, list.length - managed, list.reduce((sum, f) => sum + weightOf(f.type), 0), serial(days[0] ?? null), serial(days[days.length - 1] ?? null)];
                if (i.hasUsage) values.push(list.reduce((sum, f) => sum + f.usage, 0) / list.length / 100, list.filter((f) => f.usage <= 0).length);
                return values;
            });
        sheet.table('tblByPublisher', Header, columns, rows, x.nothing, x.total);
        return sheet;
    }

    function lookups(): Sheet {
        const sheet = titled(x.lookups, x.lookupCount, s.rule);
        const columns: TableColumn[] = [{ header: c.schemaName }, { header: c.displayName }, { header: c.type }, { header: c.target }, { header: c.custom }, { header: c.managed }, { header: c.required }, { header: c.searchable }];
        if (i.hasUsage) columns.push({ header: x.fillRate, format: Percent });
        const rows = fields
            .filter(isLookup)
            .sort((a, b) => a.target.localeCompare(b.target) || a.name.localeCompare(b.name))
            .map((f) => {
                const values: Cell[] = [f.name, name(f), f.type, f.target, yesNo(f.custom), s.managedValue(f.managed), f.requiredLevel, yesNo(f.searchable)];
                if (i.hasUsage) values.push(f.usage / 100);
                return values;
            });
        if (sheet.table('tblLookups', Header, columns, rows, x.nothing) && i.hasUsage) sheet.bars.push({ ref: range(Header + 1, 9, Header + rows.length, 9), color: '63BE7B', max: 1 });
        return sheet;
    }

    function timeline(): Sheet {
        const sheet = titled(x.timeline, s.timeline, i.timeline.length ? s.granularity(i.byMonth) : s.noDate);
        const columns: TableColumn[] = [{ header: x.period }, { header: s.custom, sum: true }, { header: s.standard, sum: true }, { header: x.total, sum: true }, { header: x.cumulative }];
        let cumulative = 0;
        const periods = i.timeline.map((p) => s.period(p.key));
        const standard = i.timeline.map((p) => p.secondary ?? 0);
        const rows = i.timeline.map((p, n) => [periods[n], p.value, standard[n], p.value + standard[n], (cumulative += p.value + standard[n])]);
        if (!sheet.table('tblTimeline', Header, columns, rows, x.nothing, x.total)) return sheet;
        sheet.charts.push({
            kind: 'stackedColumn',
            title: s.timeline,
            subtitle: s.granularity(i.byMonth),
            format: Count,
            categories: periods,
            at: { row: Header, column: 7, rows: 20, columns: 10 },
            source: { row: Header, column: 1 },
            series: [
                { name: s.custom, column: 2, color: Palette.brand, values: i.timeline.map((p) => p.value) },
                { name: s.standard, column: 3, color: Palette.neutral, values: standard },
            ],
        });
        return sheet;
    }

    return [metadata(), writeDashboard(x.dashboard, analysis, i, s, subtitle), summary(), recommendations(), ...(i.hasUsage ? [usage()] : []), byType(), byPublisher(), lookups(), timeline()];
}

export const buildReport = (analysis: Analysis, insights: Insights, s: Strings, environment: string, now: Date) => buildWorkbook(buildSheets(analysis, insights, s, environment, now));
