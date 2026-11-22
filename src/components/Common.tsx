import type { CSSProperties, ReactNode } from 'react';

/** Small shared visual pieces: card, key figure, empty state. */

export function Card(props: { title: ReactNode; subtitle?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <section className={`efa-card ${props.className ?? ''}`}>
            <header className="efa-card-header">
                <h2>{props.title}</h2>
                {props.subtitle && <p>{props.subtitle}</p>}
            </header>
            <div className="efa-card-body">{props.children}</div>
        </section>
    );
}

interface StatTileProps {
    title: string;
    value: string;
    caption?: string;
    icon: ReactNode;
    tint?: string;
    /** 0 to 1. */
    progress?: number;
    onClick?: () => void;
}

export function StatTile(props: StatTileProps) {
    const style = { '--tint': props.tint ?? 'var(--efa-accent)' } as CSSProperties;
    const content = (
        <>
            <span className="efa-stat-icon">{props.icon}</span>
            <span className="efa-stat-text">
                <span className="efa-stat-title">{props.title}</span>
                <span className="efa-stat-line">
                    <span className="efa-stat-value">{props.value}</span>
                    <span className="efa-stat-caption">{props.caption}</span>
                </span>
                {props.progress !== undefined && (
                    <span className="efa-progress">
                        <span style={{ width: `${Math.min(1, props.progress) * 100}%` }} />
                    </span>
                )}
            </span>
        </>
    );
    return props.onClick ? (
        <button type="button" className="efa-stat" style={style} onClick={props.onClick}>
            {content}
        </button>
    ) : (
        <div className="efa-stat" style={style}>
            {content}
        </div>
    );
}

export function EmptyState(props: { title?: string; text: string; children?: ReactNode }) {
    return (
        <div className="efa-empty">
            {props.title && <span className="efa-empty-title">{props.title}</span>}
            <span>{props.text}</span>
            {props.children}
        </div>
    );
}
