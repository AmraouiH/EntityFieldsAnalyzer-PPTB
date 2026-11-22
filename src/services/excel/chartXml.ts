import { columnName, xml } from './xlsx';

/** DrawingML of the native charts of the Dashboard and Timeline sheets. The source values are in cells. */

export interface ChartSeries {
    name: string;
    /** Column of the values. */
    column: number;
    values: number[];
    color: string;
    /** One color per point. */
    colors?: string[];
}

export interface ChartSpec {
    kind: 'bar' | 'column' | 'stackedColumn' | 'budget' | 'doughnut';
    title: string;
    subtitle?: string;
    at: { row: number; column: number; rows: number; columns: number };
    /** Cells of the source: header row and column of the categories. */
    source: { row: number; column: number };
    categories: string[];
    series: ChartSeries[];
    format: string;
    max?: number;
}

const text = (size: number, color = '616161') =>
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${size * 100}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;
const solid = (color: string) => `<c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></c:spPr>`;
const noLine = '<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>';

function title(main: string, subtitle?: string): string {
    const paragraph = (value: string, size: number, bold: boolean, color: string) =>
        `<a:p><a:pPr><a:defRPr/></a:pPr><a:r><a:rPr lang="en-US" sz="${size}" b="${bold ? 1 : 0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr><a:t>${xml(value)}</a:t></a:r></a:p>`;
    return (
        `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/>${paragraph(main, 1200, true, '242424')}${subtitle ? paragraph(subtitle, 900, false, '616161') : ''}</c:rich></c:tx>` +
        '<c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>'
    );
}

function labels(chart: ChartSpec, series: ChartSeries): string {
    const doughnut = chart.kind === 'doughnut';
    if (chart.kind === 'stackedColumn') return '';
    // A segment of the budget is labelled only when it is wide enough.
    if (chart.kind === 'budget' && series.values[0] < (chart.max ?? 0) * 0.04) return '';
    return (
        // A number format would also apply to the percentage of the doughnut ("61; 1" instead of "61; 60%").
        `<c:dLbls>${doughnut ? '' : `<c:numFmt formatCode="${xml(chart.format)}" sourceLinked="0"/>`}${text(9, chart.kind === 'budget' || doughnut ? '000000' : '616161')}` +
        `<c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${doughnut ? 1 : 0}"/><c:showBubbleSize val="0"/></c:dLbls>`
    );
}

function seriesXml(chart: ChartSpec, sheet: string, series: ChartSeries, index: number): string {
    const doughnut = chart.kind === 'doughnut';
    const { row, column } = chart.source;
    const quoted = `'${xml(sheet)}'!`;
    const cells = (col: number) => `${quoted}$${columnName(col)}$${row + 1}:$${columnName(col)}$${row + chart.categories.length}`;
    const points = (series.colors ?? []).map(
        (color, i) => `<c:dPt><c:idx val="${i}"/>${doughnut ? '' : '<c:invertIfNegative val="0"/>'}<c:bubble3D val="0"/>${solid(color)}</c:dPt>`,
    );
    const cache = (values: (string | number)[]) => `<c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${xml(String(v))}</c:v></c:pt>`).join('')}`;
    return (
        `<c:ser><c:idx val="${index}"/><c:order val="${index}"/>` +
        `<c:tx><c:strRef><c:f>${quoted}$${columnName(series.column)}$${row}</c:f><c:strCache>${cache([series.name])}</c:strCache></c:strRef></c:tx>` +
        solid(series.color) +
        (doughnut ? '' : '<c:invertIfNegative val="0"/>') +
        points.join('') +
        labels(chart, series) +
        `<c:cat><c:strRef><c:f>${cells(column)}</c:f><c:strCache>${cache(chart.categories)}</c:strCache></c:strRef></c:cat>` +
        `<c:val><c:numRef><c:f>${cells(series.column)}</c:f><c:numCache><c:formatCode>General</c:formatCode>${cache(series.values)}</c:numCache></c:numRef></c:val></c:ser>`
    );
}

function plot(chart: ChartSpec, series: string): string {
    if (chart.kind === 'doughnut') {
        return `<c:doughnutChart><c:varyColors val="1"/>${series}<c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>`;
    }
    const horizontal = chart.kind === 'bar' || chart.kind === 'budget';
    const stacked = chart.kind === 'stackedColumn' || chart.kind === 'budget';
    // Largest value at the top, like the tool.
    const categoryAxis =
        `<c:catAx><c:axId val="1"/><c:scaling><c:orientation val="${chart.kind === 'bar' ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="${chart.kind === 'budget' ? 1 : 0}"/>` +
        `<c:axPos val="${horizontal ? 'l' : 'b'}"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${text(9)}` +
        '<c:crossAx val="2"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>';
    const valueAxis =
        `<c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/>${chart.max === undefined ? '' : `<c:max val="${chart.max}"/>`}<c:min val="0"/></c:scaling>` +
        `<c:delete val="${stacked ? 0 : 1}"/><c:axPos val="${horizontal ? 'b' : 'l'}"/><c:numFmt formatCode="General" sourceLinked="0"/>` +
        `<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${noLine}${text(9)}<c:crossAx val="1"/><c:crosses val="autoZero"/>` +
        `<c:crossBetween val="between"/>${chart.kind === 'budget' ? '<c:majorUnit val="128"/>' : ''}</c:valAx>`;
    return (
        `<c:barChart><c:barDir val="${horizontal ? 'bar' : 'col'}"/><c:grouping val="${stacked ? 'stacked' : 'clustered'}"/><c:varyColors val="0"/>${series}` +
        `<c:gapWidth val="${stacked ? 40 : 50}"/>${stacked ? '<c:overlap val="100"/>' : ''}<c:axId val="1"/><c:axId val="2"/></c:barChart>${categoryAxis}${valueAxis}`
    );
}

export function chartXml(chart: ChartSpec, sheet: string): string {
    const position = chart.kind === 'doughnut' ? 'r' : chart.kind === 'budget' ? 'b' : chart.kind === 'stackedColumn' ? 't' : null;
    const series = chart.series.map((s, i) => seriesXml(chart, sheet, s, i)).join('');
    return (
        '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
        `<c:roundedCorners val="0"/><c:chart>${title(chart.title, chart.subtitle)}<c:plotArea><c:layout/>${plot(chart, series)}</c:plotArea>` +
        (position ? `<c:legend><c:legendPos val="${position}"/><c:overlay val="0"/>${text(9)}</c:legend>` : '') +
        '<c:plotVisOnly val="1"/></c:chart>' +
        '<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="E0E0E0"/></a:solidFill></a:ln></c:spPr></c:chartSpace>'
    );
}
