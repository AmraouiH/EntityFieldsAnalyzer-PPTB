import { useState } from 'react';
import { Button, Field, Input } from '@fluentui/react-components';
import { ArchiveRegular, CheckmarkCircleRegular, DataUsageRegular, DatabaseRegular, EditRegular, LockOpenRegular, TextBulletListRegular, WarningRegular } from '@fluentui/react-icons';
import { useStrings } from '../i18n/I18nContext';
import { ColumnLimit, LowUsage, type Analysis, type Field as EntityField } from '../models/types';
import { plan, type Insights, type Point } from '../services/insights';
import { BarChart, BudgetBar, ColumnChart, Doughnut, type Segment } from './Charts';
import { Card, EmptyState, StatTile } from './Common';
import type { Chip, Drill, DrillKind } from './FieldsPage';

interface PageProps {
    insights: Insights;
    openFields: (chip: Chip, drill?: Drill) => void;
}

function useDrill(openFields: PageProps['openFields']) {
    return (kind: DrillKind) => (point: Point) => openFields('all', { kind, key: point.key, test: point.test! });
}

const capacityColor = (ratio: number) => (ratio >= 0.9 ? 'var(--efa-danger)' : ratio >= 0.75 ? 'var(--efa-warning)' : 'var(--efa-accent)');

export function OverviewPage({ insights: i, openFields, openCapacity }: PageProps & { openCapacity: () => void }) {
    const s = useStrings();
    const drill = useDrill(openFields);
    const label = (point: Point) => s.label(point.key);
    const ratio = i.used / ColumnLimit;
    return (
        <div className="efa-page">
            <div className="efa-tiles">
                <StatTile title={s.fields} value={s.N(i.total)} caption={s.openList} icon={<TextBulletListRegular />} onClick={() => openFields('all')} />
                <StatTile title={s.customFields} value={s.N(i.customCount)} caption={s.ofFields(i.total ? (i.customCount * 100) / i.total : 0)} icon={<EditRegular />} onClick={() => openFields('custom')} />
                <StatTile title={s.unmanagedFields} value={s.N(i.unmanagedCount)} caption={s.managedCount(i.total - i.unmanagedCount)} icon={<LockOpenRegular />} onClick={() => openFields('unmanaged')} />
                <StatTile title={s.capacityUsed} value={s.P(ratio * 100)} caption={s.columnsLeft(i.available)} icon={<ArchiveRegular />} tint={capacityColor(ratio)} progress={ratio} onClick={openCapacity} />
            </div>
            <div className="efa-overview">
                <Card title={s.fieldTypes} subtitle={s.typesHint(i.types.length)}>
                    <BarChart points={i.types} label={label} format={s.N} empty={s.noField} onSelect={drill('type')} />
                </Card>
                <Card title={s.origin} subtitle={s.originHint}>
                    <Doughnut
                        points={i.origin}
                        label={label}
                        format={s.N}
                        caption={s.fields.toLowerCase()}
                        empty={s.noField}
                        colors={{ standard: 'var(--efa-neutral)', customManaged: 'var(--efa-blue)', customUnmanaged: 'var(--efa-orange)', standardUnmanaged: 'var(--efa-violet)' }}
                        onSelect={drill('origin')}
                    />
                </Card>
                <Card title={s.fieldSettings} subtitle={s.settingsHint}>
                    <BarChart points={i.settings} label={label} format={(v) => s.P(v)} max={100} color="var(--efa-violet)" empty={s.noField} onSelect={drill('setting')} />
                </Card>
                <Card title={s.publishers} subtitle={s.publishersHint}>
                    <BarChart points={i.publishers} label={label} format={s.N} color="var(--efa-green)" empty={s.noCustom} onSelect={drill('prefix')} />
                </Card>
                <Card className="efa-span-2" title={s.timeline} subtitle={i.timeline.length ? `${s.granularity(i.byMonth)} · ${s.timelineHint}` : undefined}>
                    <ColumnChart
                        points={i.timeline}
                        label={(point) => s.period(point.key)}
                        format={s.N}
                        empty={s.noDate}
                        series={[
                            { name: s.standard, color: 'var(--efa-neutral)', value: (point) => point.secondary ?? 0 },
                            { name: s.custom, color: 'var(--efa-blue)', value: (point) => point.value },
                        ]}
                        onSelect={drill('created')}
                    />
                </Card>
            </div>
        </div>
    );
}

const rarelyUsed = (field: EntityField) => field.usage > 0 && field.usage < LowUsage;
const FillRamp = ['var(--efa-danger)', 'var(--efa-orange)', 'var(--efa-amber)', 'var(--efa-sky)', 'var(--efa-blue)', 'var(--efa-deep)'];

export function UsagePage({ insights: i, analysis, openFields, rerun }: PageProps & { analysis: Analysis; rerun: () => void }) {
    const s = useStrings();
    const drill = useDrill(openFields);
    if (!i.hasUsage) {
        return (
            <EmptyState title={s.usageEmpty} text={s.usageEmptyText}>
                <Button appearance="primary" onClick={rerun}>
                    {s.rerun}
                </Button>
            </EmptyState>
        );
    }
    if (!analysis.records) return <EmptyState title={s.usage} text={s.noRecords} />;
    const label = (point: Point) => point.key;
    return (
        <div className="efa-page">
            <div className="efa-tiles">
                <StatTile title={s.recordsAnalysed} value={s.N(analysis.records)} caption={s.recordsRead} icon={<DatabaseRegular />} />
                <StatTile
                    title={s.neverUsedFields}
                    value={s.N(i.unused)}
                    caption={s.ofFields(i.total ? (i.unused * 100) / i.total : 0)}
                    icon={<WarningRegular />}
                    tint={i.unused ? 'var(--efa-danger)' : 'var(--efa-success)'}
                    onClick={() => openFields('never')}
                />
                <StatTile
                    title={s.rarelyUsed}
                    value={s.N(i.low)}
                    caption={s.rarelyCaption}
                    icon={<DataUsageRegular />}
                    tint="var(--efa-warning)"
                    onClick={() => openFields('all', { kind: 'rarely', key: '', test: rarelyUsed })}
                />
                <StatTile title={s.averageFill} value={s.P(i.average)} caption={s.perField} icon={<CheckmarkCircleRegular />} progress={i.average / 100} />
            </div>
            <p className="efa-note">{s.visibility}</p>
            <div className="efa-usage">
                <Card title={s.distribution} subtitle={s.distributionHint}>
                    <ColumnChart
                        points={i.distribution}
                        label={label}
                        format={s.N}
                        empty={s.noField}
                        colors={FillRamp}
                        series={[{ name: s.fields, color: 'var(--efa-blue)', value: (point) => point.value }]}
                        onSelect={drill('fill')}
                    />
                </Card>
                <Card title={s.fillByType} subtitle={s.fillByTypeHint}>
                    <BarChart points={i.fillByType} label={label} format={(v) => s.P(v, 1)} max={100} color="var(--efa-green)" empty={s.noField} onSelect={drill('type')} />
                </Card>
                <Card className="efa-span-2 efa-wide-labels" title={s.leastUsed} subtitle={s.leastUsedHint}>
                    <BarChart
                        points={i.leastUsed}
                        label={label}
                        format={(v) => s.P(v, 2)}
                        colorOf={(point) => (point.value <= 0 ? 'var(--efa-danger)' : 'var(--efa-orange)')}
                        empty={s.noCustom}
                        onSelect={drill('field')}
                    />
                </Card>
            </div>
        </div>
    );
}

const count = (text: string) => Math.max(0, Number.parseInt(text, 10) || 0);

export function CapacityPage({ insights: i, openFields }: PageProps) {
    const s = useStrings();
    const drill = useDrill(openFields);
    const [inputs, setInputs] = useState(['0', '0', '0']);
    const result = plan(i.used, count(inputs[0]), count(inputs[1]), count(inputs[2]));
    const segments: Segment[] = [
        { key: '3', name: s.weightNames[3], value: i.weights[3], color: 'var(--efa-blue)' },
        { key: '2', name: s.weightNames[2], value: i.weights[2], color: 'var(--efa-green)' },
        { key: '1', name: s.weightNames[1], value: i.weights[1], color: 'var(--efa-violet)' },
        { key: 'planned', name: s.planned, value: result.needed, color: result.fits ? 'var(--efa-blue)' : 'var(--efa-danger)', planned: true },
        { key: 'available', name: s.availableLabel, value: Math.max(0, result.available - result.needed), color: 'var(--efa-track)' },
    ];
    const verdict = !result.needed ? '' : result.fits ? 'efa-plan-ok' : 'efa-plan-bad';
    return (
        <div className="efa-page efa-capacity">
            <Card title={s.budget} subtitle={s.budgetHint}>
                <p className="efa-headline">{s.budgetHeadline(i.used, result.available)}</p>
                <BudgetBar segments={segments} limit={ColumnLimit} format={s.N} />
            </Card>
            <Card title={s.planTitle} subtitle={s.planHint}>
                <p className="efa-rule">{s.rule}</p>
                <div className="efa-plan">
                    {s.planInputs.map((caption, n) => (
                        <Field key={n} label={caption}>
                            <Input type="number" min={0} value={inputs[n]} onChange={(_e, data) => setInputs((all) => all.map((value, m) => (m === n ? data.value : value)))} />
                        </Field>
                    ))}
                </div>
                <p className={`efa-plan-result ${verdict}`} role="status">
                    {!result.needed ? s.planEmpty : result.fits ? `✓  ${s.planFits(result.needed, result.available - result.needed)}` : `✕  ${s.planTooBig(result.needed, result.available)}`}
                </p>
            </Card>
            <Card title={s.cost} subtitle={s.costHint}>
                <BarChart points={i.cost} label={(point) => point.key} format={s.N} empty={s.noField} onSelect={drill('type')} />
            </Card>
        </div>
    );
}
