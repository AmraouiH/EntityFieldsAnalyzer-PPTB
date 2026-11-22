import { useMemo, useState } from 'react';
import { Button, Input, Radio, RadioGroup, Select } from '@fluentui/react-components';
import { PlayFilled, SearchRegular } from '@fluentui/react-icons';
import { useStrings } from '../i18n/I18nContext';
import type { EntityFilter, EntitySummary, Mode } from '../models/types';
import { matchesFilter } from '../services/metadataService';
import { Card, EmptyState } from './Common';

interface EntityPanelProps {
    entities: EntitySummary[] | null;
    selected: EntitySummary | null;
    filter: EntityFilter;
    mode: Mode;
    busy: boolean;
    onFilter: (filter: EntityFilter) => void;
    onMode: (mode: Mode) => void;
    onSelect: (entity: EntitySummary) => void;
    onAnalyse: (entity: EntitySummary) => void;
}

/** Entities on the left: filter, search, single selection, then the mode and Analyse for the selected one. */
export function EntityPanel(props: EntityPanelProps) {
    const s = useStrings();
    const { entities, selected, filter } = props;
    const [search, setSearch] = useState('');

    const shown = useMemo(() => {
        const text = search.trim().toLowerCase();
        return (entities ?? []).filter((e) => matchesFilter(e, filter) && (!text || e.logicalName.includes(text) || e.displayName.toLowerCase().includes(text)));
    }, [entities, filter, search]);

    return (
        <Card className="efa-entities" title={s.entities} subtitle={entities ? `${s.N(shown.length)} · ${s.entitiesHint}` : undefined}>
            <Select aria-label={s.entityFilter} value={filter} onChange={(_e, data) => props.onFilter(data.value as EntityFilter)}>
                {(Object.keys(s.filters) as EntityFilter[]).map((key) => (
                    <option key={key} value={key}>
                        {s.filters[key]}
                    </option>
                ))}
            </Select>
            <Input aria-label={s.searchEntity} placeholder={s.searchEntity} contentBefore={<SearchRegular />} value={search} disabled={!entities} onChange={(_e, data) => setSearch(data.value)} />

            <div className="efa-entity-list" role="listbox" aria-label={s.entities}>
                {shown.map((entity) => {
                    const active = selected?.logicalName === entity.logicalName;
                    return (
                        <button
                            type="button"
                            key={entity.logicalName}
                            role="option"
                            aria-selected={active}
                            className={active ? 'efa-entity efa-entity-selected' : 'efa-entity'}
                            onClick={() => props.onSelect(entity)}
                            onDoubleClick={() => props.onAnalyse(entity)}
                        >
                            <span className="efa-radio" />
                            <span className="efa-entity-text">
                                <span className="efa-entity-name">{entity.displayName || entity.logicalName}</span>
                                <span className="efa-entity-schema">{entity.logicalName}</span>
                            </span>
                        </button>
                    );
                })}
                {!shown.length && <EmptyState text={entities ? s.entitiesNone : s.entitiesEmpty} />}
            </div>

            {selected && (
                <div className="efa-run">
                    <RadioGroup aria-label={s.analysisMode} value={props.mode} onChange={(_e, data) => props.onMode(data.value as Mode)}>
                        <Radio value="metadata" label={s.modes.metadata} />
                        <Radio value="usage" label={s.modes.usage} />
                    </RadioGroup>
                    {props.mode === 'usage' && <p className="efa-run-warning">{s.usageWarning}</p>}
                    <Button appearance="primary" className="efa-analyse" icon={<PlayFilled />} disabled={props.busy} onClick={() => props.onAnalyse(selected)}>
                        {s.analyse(selected.displayName || selected.logicalName)}
                    </Button>
                </div>
            )}
        </Card>
    );
}
