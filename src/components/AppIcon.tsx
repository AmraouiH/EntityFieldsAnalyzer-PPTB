import { useId } from 'react';

/** Icon of the tool: the columns of a table under a magnifier. Same drawing as public/icon/entity-fields-analyzer.svg. */
export function AppIcon(props: { className?: string }) {
    // One gradient id per instance: the header and the busy popup can show the icon at the same time.
    const gradient = `efa-tile-${useId().replace(/:/g, '')}`;
    return (
        <svg className={props.className} viewBox="0 0 48 48" aria-hidden="true">
            <defs>
                <linearGradient id={gradient} x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0" stopColor="#0078D4" />
                    <stop offset=".5" stopColor="#3B6FE0" />
                    <stop offset="1" stopColor="#8A4FD8" />
                </linearGradient>
            </defs>
            <rect x="2" y="2" width="44" height="44" rx="11" fill={`url(#${gradient})`} />
            <g fill="#ffffff">
                <rect x="9" y="9" width="30" height="5.5" rx="2" />
                <rect x="9" y="17.5" width="7" height="21" rx="2" fillOpacity={0.9} />
                <rect x="19" y="17.5" width="7" height="7" rx="2" fillOpacity={0.65} />
                <rect x="29" y="17.5" width="7" height="4" rx="2" fillOpacity={0.45} />
            </g>
            <g fill="none" stroke="#ffffff" strokeLinecap="round">
                <circle cx="29.5" cy="30.5" r="6.8" strokeWidth={3} />
                <path d="m34.7 35.7 4.8 4.8" strokeWidth={3.6} />
            </g>
        </svg>
    );
}
