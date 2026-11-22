import { CheckmarkFilled } from '@fluentui/react-icons';
import { useStrings } from '../i18n/I18nContext';

/** Before the first analysis: the three steps, and what the analysis will show. */
export function Welcome(props: { loaded: boolean; picked: boolean }) {
    const s = useStrings();
    const current = !props.loaded ? 0 : !props.picked ? 1 : 2;
    return (
        <div className="efa-page efa-welcome">
            <h2>{s.guideTitle}</h2>
            <div className="efa-steps">
                {s.steps.map(([title, text], n) => (
                    <div key={n} className={n === current ? 'efa-step efa-step-current' : n < current ? 'efa-step efa-step-done' : 'efa-step'}>
                        <div className="efa-step-head">
                            <span className="efa-step-number">{n < current ? <CheckmarkFilled /> : n + 1}</span>
                            <span className="efa-step-state">{n < current ? s.done : n === current ? s.next : ''}</span>
                        </div>
                        <h3>{title}</h3>
                        <p>{text}</p>
                    </div>
                ))}
            </div>
            <h2>{s.featuresTitle}</h2>
            <div className="efa-features">
                {s.features.map(([title, text], n) => (
                    <div key={n} className="efa-step">
                        <h3>{title}</h3>
                        <p>{text}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
