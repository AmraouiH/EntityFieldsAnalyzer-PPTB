import { strToU8, zipSync } from 'fflate';
import { chartXml, type ChartSpec } from './chartXml';

/**
 * Small .xlsx writer: styles, tables with totals, data bars, highlighted rows, frozen panes and native charts.
 * The workbook is written by hand, like in ServiceBus Explorer: no Excel library is needed.
 */

export type Cell = string | number | boolean | null | undefined;

export interface Style {
    bold?: boolean;
    italic?: boolean;
    size?: number;
    /** RRGGBB */
    color?: string;
    fill?: string;
    format?: string;
    wrap?: boolean;
    left?: boolean;
}

export interface TableColumn {
    header: string;
    format?: string;
    width?: number;
    wrap?: boolean;
    sum?: boolean;
}

const Main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const Relations = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const Package = 'http://schemas.openxmlformats.org/package/2006/relationships';
const Declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const MaxCellLength = 32767;

/** Escapes a text and drops what XML 1.0 does not accept (control characters, lone surrogates). */
export function xml(value: string): string {
    return value
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function columnName(column: number): string {
    let name = '';
    for (let n = column; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
    return name;
}

export const address = (row: number, column: number) => `${columnName(column)}${row}`;
export const range = (row1: number, col1: number, row2: number, col2: number) => `${address(row1, col1)}:${address(row2, col2)}`;

/** 31 characters at most, without : \ / ? * [ ] */
export function sheetName(name: string, suffix = ''): string {
    return name.replace(/[:\\/?*[\]']/g, '').substring(0, 31 - suffix.length) + suffix;
}

interface StoredCell {
    value: Cell;
    style: Style;
    formula?: string;
}

interface Table {
    name: string;
    row: number;
    last: number;
    columns: TableColumn[];
    totals: boolean;
}

export class Sheet {
    readonly cells = new Map<number, Map<number, StoredCell>>();
    readonly widths = new Map<number, number>();
    readonly heights = new Map<number, number>();
    readonly merges: string[] = [];
    readonly tables: Table[] = [];
    readonly charts: ChartSpec[] = [];
    readonly bars: { ref: string; color: string; max?: number }[] = [];
    readonly highlights: { ref: string; formula: string }[] = [];
    readonly breaks: number[] = [];
    freeze?: { row: number; column: number };
    gridLines = true;
    /** Printed on one page wide. */
    printArea?: { rows: number; columns: number };

    constructor(readonly name: string) {}

    set(row: number, column: number, value: Cell, style: Style = {}, formula?: string) {
        let cells = this.cells.get(row);
        if (!cells) this.cells.set(row, (cells = new Map()));
        cells.set(column, { value, style, formula });
    }

    fill(row: number, from: number, to: number, style: Style) {
        for (let column = from; column <= to; column++) this.set(row, column, this.cells.get(row)?.get(column)?.value, style);
    }

    merge(row: number, from: number, to: number) {
        this.merges.push(range(row, from, row, to));
    }

    /** Writes an Excel table. Returns false, with a note instead, when there is no row. */
    table(name: string, row: number, columns: TableColumn[], rows: Cell[][], nothing: string, totalLabel?: string): boolean {
        if (!rows.length) {
            this.set(row, 1, nothing, { italic: true });
            return false;
        }
        const last = row + rows.length;
        columns.forEach((column, c) => {
            this.set(row, c + 1, column.header, { bold: true });
            const style: Style = { format: column.format, wrap: column.wrap };
            let widest = column.header.length + 3;
            rows.forEach((values, r) => {
                const value = values[c];
                this.set(row + 1 + r, c + 1, value, style);
                if (typeof value === 'string') widest = Math.max(widest, value.length + 2);
            });
            const width = column.width ?? Math.min(60, Math.max(11, widest));
            this.widths.set(c + 1, Math.max(this.widths.get(c + 1) ?? 0, width));

            if (totalLabel === undefined) return;
            if (c === 0) this.set(last + 1, 1, totalLabel, { bold: true });
            else if (column.sum) {
                const sum = rows.reduce((all, values) => all + (Number(values[c]) || 0), 0);
                this.set(last + 1, c + 1, sum, { bold: true, format: column.format }, `SUBTOTAL(109,${range(row + 1, c + 1, last, c + 1)})`);
            }
        });
        this.tables.push({ name, row, last, columns, totals: totalLabel !== undefined });
        return true;
    }
}

class Styles {
    private readonly ids = new Map<string, number>();
    private readonly fonts = ['<font><sz val="11"/><name val="Calibri"/></font>'];
    private readonly fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    private readonly formats: string[] = [];
    private readonly xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>'];

    private static index(list: string[], item: string): number {
        const found = list.indexOf(item);
        return found >= 0 ? found : list.push(item) - 1;
    }

    id(style: Style): number {
        const key = JSON.stringify(style);
        const known = this.ids.get(key);
        if (known !== undefined) return known;
        const { bold, italic, size, color, fill, format, wrap, left } = style;
        const font = `<font>${bold ? '<b/>' : ''}${italic ? '<i/>' : ''}<sz val="${size ?? 11}"/>${color ? `<color rgb="FF${color}"/>` : ''}<name val="Calibri"/></font>`;
        const fontId = Styles.index(this.fonts, font);
        const fillId = fill ? Styles.index(this.fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
        const formatId = format ? 164 + Styles.index(this.formats, format) : 0;
        const alignment = wrap || left ? `<alignment${left ? ' horizontal="left"' : ''} vertical="${wrap ? 'top' : 'center'}"${wrap ? ' wrapText="1"' : ''}/>` : '';
        const id = Styles.index(
            this.xfs,
            `<xf numFmtId="${formatId}" fontId="${fontId}" fillId="${fillId}" borderId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1">${alignment}</xf>`,
        );
        this.ids.set(key, id);
        return id;
    }

    toXml(): string {
        const list = (tag: string, items: string[]) => `<${tag} count="${items.length}">${items.join('')}</${tag}>`;
        const formats = this.formats.map((code, i) => `<numFmt numFmtId="${164 + i}" formatCode="${xml(code)}"/>`);
        return (
            `${Declaration}<styleSheet xmlns="${Main}">` +
            (formats.length ? list('numFmts', formats) : '') +
            list('fonts', this.fonts) +
            list('fills', this.fills) +
            '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
            list('cellXfs', this.xfs) +
            '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
            // Never filled fields of the metadata sheet.
            '<dxfs count="1"><dxf><font><color rgb="FF808080"/></font><fill><patternFill><bgColor rgb="FFF2F2F2"/></patternFill></fill></dxf></dxfs>' +
            '</styleSheet>'
        );
    }
}

function cellXml(row: number, column: number, cell: StoredCell, styles: Styles): string {
    const { value, formula } = cell;
    const style = styles.id(cell.style);
    const head = `<c r="${address(row, column)}"${style ? ` s="${style}"` : ''}`;
    if (formula) return `${head}><f>${xml(formula)}</f><v>${Number(value) || 0}</v></c>`;
    if (value === null || value === undefined || value === '') return `${head}/>`;
    if (typeof value === 'number') return Number.isFinite(value) ? `${head}><v>${value}</v></c>` : `${head}/>`;
    if (typeof value === 'boolean') return `${head} t="b"><v>${value ? 1 : 0}</v></c>`;
    // Always inline text: a value that looks like a formula or a date stays a text.
    return `${head} t="inlineStr"><is><t xml:space="preserve">${xml(value.substring(0, MaxCellLength))}</t></is></c>`;
}

function sheetXml(sheet: Sheet, styles: Styles, active: boolean): string {
    let pane = '';
    if (sheet.freeze) {
        const { row, column } = sheet.freeze;
        pane = `<pane xSplit="${column}" ySplit="${row}" topLeftCell="${address(row + 1, column + 1)}" activePane="bottomRight" state="frozen"/>`;
    }
    const cols = [...sheet.widths].sort((a, b) => a[0] - b[0]).map(([c, width]) => `<col min="${c}" max="${c}" width="${width}" customWidth="1"/>`);
    const rowNumbers = [...new Set([...sheet.cells.keys(), ...sheet.heights.keys()])].sort((a, b) => a - b);
    const rows = rowNumbers.map((r) => {
        const height = sheet.heights.get(r);
        const cells = [...(sheet.cells.get(r) ?? [])].sort((a, b) => a[0] - b[0]).map(([c, cell]) => cellXml(r, c, cell, styles));
        return `<row r="${r}"${height ? ` ht="${height}" customHeight="1"` : ''}>${cells.join('')}</row>`;
    });

    let priority = 1;
    const rules = [
        ...sheet.bars.map(
            (bar) =>
                `<conditionalFormatting sqref="${bar.ref}"><cfRule type="dataBar" priority="${priority++}"><dataBar><cfvo type="num" val="0"/>` +
                `${bar.max === undefined ? '<cfvo type="max"/>' : `<cfvo type="num" val="${bar.max}"/>`}<color rgb="FF${bar.color}"/></dataBar></cfRule></conditionalFormatting>`,
        ),
        ...sheet.highlights.map(
            (h) => `<conditionalFormatting sqref="${h.ref}"><cfRule type="expression" dxfId="0" priority="${priority++}"><formula>${xml(h.formula)}</formula></cfRule></conditionalFormatting>`,
        ),
    ];

    return (
        `${Declaration}<worksheet xmlns="${Main}" xmlns:r="${Relations}">` +
        (sheet.printArea ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : '') +
        `<sheetViews><sheetView workbookViewId="0"${active ? ' tabSelected="1"' : ''}${sheet.gridLines ? '' : ' showGridLines="0"'}>${pane}</sheetView></sheetViews>` +
        '<sheetFormatPr defaultRowHeight="15"/>' +
        (cols.length ? `<cols>${cols.join('')}</cols>` : '') +
        `<sheetData>${rows.join('')}</sheetData>` +
        (sheet.merges.length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>` : '') +
        rules.join('') +
        '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
        (sheet.printArea ? '<pageSetup orientation="portrait" fitToHeight="0"/>' : '') +
        (sheet.breaks.length
            ? `<rowBreaks count="${sheet.breaks.length}" manualBreakCount="${sheet.breaks.length}">${sheet.breaks.map((r) => `<brk id="${r - 1}" max="16383" man="1"/>`).join('')}</rowBreaks>`
            : '') +
        (sheet.charts.length ? '<drawing r:id="drawing"/>' : '') +
        (sheet.tables.length ? `<tableParts count="${sheet.tables.length}">${sheet.tables.map((_t, i) => `<tablePart r:id="table${i}"/>`).join('')}</tableParts>` : '') +
        '</worksheet>'
    );
}

function tableXml(table: Table, id: number): string {
    const { row, last, columns, totals } = table;
    const definitions = columns.map((column, c) => {
        const total = !totals ? '' : c === 0 ? ' totalsRowLabel="Total"' : column.sum ? ' totalsRowFunction="sum"' : '';
        return `<tableColumn id="${c + 1}" name="${xml(column.header)}"${total}/>`;
    });
    return (
        `${Declaration}<table xmlns="${Main}" id="${id}" name="${table.name}" displayName="${table.name}" ref="${range(row, 1, last + (totals ? 1 : 0), columns.length)}"` +
        `${totals ? ' totalsRowCount="1"' : ' totalsRowShown="0"'}><autoFilter ref="${range(row, 1, last, columns.length)}"/>` +
        `<tableColumns count="${columns.length}">${definitions.join('')}</tableColumns>` +
        '<tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>'
    );
}

function anchorXml(chart: ChartSpec, index: number): string {
    const point = (column: number, row: number) => `<xdr:col>${column - 1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row - 1}</xdr:row><xdr:rowOff>0</xdr:rowOff>`;
    const { row, column, rows, columns } = chart.at;
    return (
        `<xdr:twoCellAnchor><xdr:from>${point(column, row)}</xdr:from><xdr:to>${point(column + columns, row + rows)}</xdr:to><xdr:graphicFrame macro="">` +
        `<xdr:nvGraphicFramePr><xdr:cNvPr id="${index + 2}" name="Chart ${index + 1}" descr="${xml(chart.title)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
        '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">' +
        `<c:chart r:id="chart${index}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`
    );
}

export function buildWorkbook(sheets: Sheet[]): Uint8Array {
    const styles = new Styles();
    const files: Record<string, Uint8Array> = {};
    const types: string[] = [];
    const add = (path: string, content: string, type?: string) => {
        files[path] = strToU8(content);
        if (type) types.push(`<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.${type}+xml"/>`);
    };
    const relations = (items: [id: string, type: string, target: string][]) =>
        `${Declaration}<Relationships xmlns="${Package}">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="${Relations}/${type}" Target="${target}"/>`).join('')}</Relationships>`;

    let tableId = 0;
    let chartId = 0;
    sheets.forEach((sheet, index) => {
        const n = index + 1;
        const links: [string, string, string][] = [];
        sheet.tables.forEach((table, i) => {
            const id = ++tableId;
            add(`xl/tables/table${id}.xml`, tableXml(table, id), 'spreadsheetml.table');
            links.push([`table${i}`, 'table', `../tables/table${id}.xml`]);
        });
        if (sheet.charts.length) {
            const chartLinks: [string, string, string][] = [];
            sheet.charts.forEach((chart, i) => {
                const id = ++chartId;
                add(`xl/charts/chart${id}.xml`, Declaration + chartXml(chart, sheet.name), 'drawingml.chart');
                chartLinks.push([`chart${i}`, 'chart', `../charts/chart${id}.xml`]);
            });
            add(
                `xl/drawings/drawing${n}.xml`,
                `${Declaration}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"` +
                    ` xmlns:r="${Relations}" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">${sheet.charts.map(anchorXml).join('')}</xdr:wsDr>`,
                'drawing',
            );
            add(`xl/drawings/_rels/drawing${n}.xml.rels`, relations(chartLinks));
            links.push(['drawing', 'drawing', `../drawings/drawing${n}.xml`]);
        }
        add(`xl/worksheets/sheet${n}.xml`, sheetXml(sheet, styles, index === 0), 'spreadsheetml.worksheet');
        if (links.length) add(`xl/worksheets/_rels/sheet${n}.xml.rels`, relations(links));
    });

    const printAreas = sheets.flatMap((sheet, i) =>
        sheet.printArea
            ? [`<definedName name="_xlnm.Print_Area" localSheetId="${i}">'${xml(sheet.name)}'!$A$1:$${columnName(sheet.printArea.columns)}$${sheet.printArea.rows}</definedName>`]
            : [],
    );
    add(
        'xl/workbook.xml',
        `${Declaration}<workbook xmlns="${Main}" xmlns:r="${Relations}"><bookViews><workbookView/></bookViews><sheets>` +
            sheets.map((sheet, i) => `<sheet name="${xml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
            `</sheets>${printAreas.length ? `<definedNames>${printAreas.join('')}</definedNames>` : ''}</workbook>`,
        'spreadsheetml.sheet.main',
    );
    add('xl/styles.xml', styles.toXml(), 'spreadsheetml.styles');
    add('xl/_rels/workbook.xml.rels', relations([...sheets.map((_s, i): [string, string, string] => [`rId${i + 1}`, 'worksheet', `worksheets/sheet${i + 1}.xml`]), ['styles', 'styles', 'styles.xml']]));
    add('_rels/.rels', relations([['rId1', 'officeDocument', 'xl/workbook.xml']]));
    add(
        '[Content_Types].xml',
        `${Declaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
            `<Default Extension="xml" ContentType="application/xml"/>${types.join('')}</Types>`,
    );
    return zipSync(files, { level: 6 });
}
