import { useState, type CSSProperties, type FocusEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Point } from '../services/insights';
import { EmptyState } from './Common';

/** Charts in plain HTML and SVG. Every mark is a button: hover or focus shows its value, a click drills down. */

function useTip() {
    const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
    const bind = (text: string) => ({
        'aria-label': text,
        onMouseMove: (e: MouseEvent) => setTip({ text, x: e.clientX, y: e.clientY }),
        onMouseLeave: () => setTip(null),
        onFocus: (e: FocusEvent) => {
            const box = e.currentTarget.getBoundingClientRect();
            setTip({ text, x: box.left + box.width / 2, y: box.top + box.height / 2 });
        },
        onBlur: () => setTip(null),
    });
    const node =
        tip &&
        createPortal(
            <div className="efa-tip" role="tooltip" style={{ left: Math.max(8, Math.min(tip.x + 12, window.innerWidth - 272)), top: Math.min(tip.y + 14, window.innerHeight - 48) }}>
                {tip.text}
            </div>,
            document.body,
        );
    return { bind, node };
}

interface ChartProps {
    points: Point[];
    label: (point: Point) => string;
    empty: string;
    onSelect: (point: Point) => void;
}

export function BarChart(props: ChartProps & { format: (value: number) => string; max?: number; color?: string; colorOf?: (point: Point) => string }) {
    const { points, label, format, color = 'var(--efa-blue)' } = props;
    const { bind, node } = useTip();
    if (!points.length) return <EmptyState text={props.empty} />;
    const max = props.max ?? Math.max(...points.map((p) => p.value));
    return (
        <div className="efa-bars">
            {points.map((point) => (
                <button type="button" key={point.key} className="efa-bar" onClick={() => props.onSelect(point)} {...bind(`${label(point)}: ${format(point.value)}`)}>
                    <span className="efa-bar-label">{label(point)}</span>
                    <span className="efa-bar-track">
                        <span className="efa-bar-fill" style={{ width: `${max > 0 ? (point.value / max) * 100 : 0}%`, background: props.colorOf?.(point) ?? color }} />
                        <span className="efa-bar-value">{format(point.value)}</span>
                    </span>
                </button>
            ))}
            {node}
        </div>
    );
}

export interface Series {
    name: string;
    color: string;
    value: (point: Point) => number;
}

export function ColumnChart(props: ChartProps & { format: (value: number) => string; series: Series[]; colors?: string[] }) {
    const { points, series, label, format } = props;
    const { bind, node } = useTip();
    if (!points.length) return <EmptyState text={props.empty} />;
    const totals = points.map((point) => series.reduce((sum, one) => sum + one.value(point), 0));
    const max = Math.max(1, ...totals);
    const every = Math.ceil(points.length / 14);
    return (
        <div className="efa-columns-chart">
            {series.length > 1 && (
                <div className="efa-legend efa-legend-top">
                    {series.map((one) => (
                        <span key={one.name}>
                            <i style={{ background: one.color }} />
                            {one.name}
                        </span>
                    ))}
                </div>
            )}
            <div className="efa-columns">
                {points.map((point, n) => {
                    const detail = series.length > 1 ? series.map((one) => `${one.name} ${format(one.value(point))}`).join(' · ') : format(totals[n]);
                    return (
                        <button type="button" key={point.key} className="efa-column" onClick={() => props.onSelect(point)} {...bind(`${label(point)}: ${detail}`)}>
                            <span className="efa-column-plot">
                                <span className="efa-column-value">{points.length <= 14 && totals[n] > 0 ? format(totals[n]) : ''}</span>
                                <span className="efa-column-stack" style={{ height: `${(totals[n] / max) * 85}%` }}>
                                    {series.map(
                                        (one) => one.value(point) > 0 && <span key={one.name} style={{ flexGrow: one.value(point), background: props.colors?.[n] ?? one.color }} />,
                                    )}
                                </span>
                            </span>
                            <span className="efa-column-label">{n % every === 0 ? label(point) : ''}</span>
                        </button>
                    );
                })}
            </div>
            {node}
        </div>
    );
}

export function Doughnut(props: ChartProps & { colors: Record<string, string>; caption: string; format: (value: number) => string }) {
    const { label, format } = props;
    const { bind, node } = useTip();
    const points = props.points.filter((point) => point.value > 0);
    if (!points.length) return <EmptyState text={props.empty} />;
    const total = points.reduce((sum, point) => sum + point.value, 0);
    let start = 0;
    const slices = points.map((point) => {
        const share = (point.value / total) * 100;
        const slice = { point, share, start };
        start += share;
        return slice;
    });
    return (
        <div className="efa-doughnut">
            <svg viewBox="0 0 42 42" aria-hidden="true">
                {slices.map(({ point, share, start: from }) => (
                    <circle
                        key={point.key}
                        className="efa-slice"
                        cx="21"
                        cy="21"
                        r="15.9155"
                        pathLength={100}
                        stroke={props.colors[point.key]}
                        strokeDasharray={`${points.length > 1 ? Math.max(0.2, share - 0.7) : 100} 100`}
                        strokeDashoffset={-from}
                        transform="rotate(-90 21 21)"
                        onClick={() => props.onSelect(point)}
                        {...bind(`${label(point)}: ${format(point.value)}`)}
                    />
                ))}
                <text x="21" y="21.5" className="efa-doughnut-total">
                    {format(total)}
                </text>
                <text x="21" y="26" className="efa-doughnut-caption">
                    {props.caption}
                </text>
            </svg>
            <div className="efa-doughnut-legend">
                {points.map((point) => (
                    <button type="button" key={point.key} onClick={() => props.onSelect(point)} {...bind(`${label(point)}: ${format(point.value)}`)}>
                        <i style={{ background: props.colors[point.key] }} />
                        <span>{label(point)}</span>
                        <b>{format(point.value)}</b>
                    </button>
                ))}
            </div>
            {node}
        </div>
    );
}

export interface Segment {
    key: string;
    name: string;
    value: number;
    color: string;
    planned?: boolean;
}

export function BudgetBar(props: { segments: Segment[]; limit: number; format: (value: number) => string }) {
    const { segments, limit, format } = props;
    const { bind, node } = useTip();
    const total = Math.max(limit, segments.reduce((sum, segment) => sum + segment.value, 0));
    return (
        <div className="efa-budget">
            <div className="efa-budget-bar">
                {segments.map(
                    (segment) =>
                        segment.value > 0 && (
                            <span
                                key={segment.key}
                                tabIndex={0}
                                role="img"
                                className={segment.planned ? 'efa-budget-planned' : undefined}
                                style={{ width: `${(segment.value / total) * 100}%`, '--segment': segment.color } as CSSProperties}
                                {...bind(`${segment.name}: ${format(segment.value)}`)}
                            />
                        ),
                )}
                {total > limit && <em className="efa-budget-limit" style={{ left: `${(limit / total) * 100}%` }} />}
            </div>
            <div className="efa-budget-scale">
                <span>0</span>
                <span>{format(total)}</span>
            </div>
            <div className="efa-legend">
                {segments.map(
                    (segment) =>
                        (!segment.planned || segment.value > 0) && (
                            <span key={segment.key}>
                                <i className={segment.planned ? 'efa-budget-planned' : undefined} style={{ background: segment.color, '--segment': segment.color } as CSSProperties} />
                                {segment.name} <b>{format(segment.value)}</b>
                            </span>
                        ),
                )}
            </div>
            {node}
        </div>
    );
}
