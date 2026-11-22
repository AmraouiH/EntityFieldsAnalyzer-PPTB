import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, FluentProvider, Tab, TabList } from '@fluentui/react-components';
import { AppIcon } from './components/AppIcon';
import { HelpDialog, MessageDialog, type MessageState } from './components/Dialogs';
import { EntityPanel } from './components/EntityPanel';
import { FieldsPage, noFilters, type Chip, type Drill, type FieldFilters } from './components/FieldsPage';
import { Header } from './components/Header';
import { CapacityPage, OverviewPage, UsagePage } from './components/Pages';
import { Welcome } from './components/Welcome';
import { useConnection, useSettings, useToolboxEvents, useToolboxTheme } from './hooks/useToolbox';
import { useTask } from './hooks/useTask';
import { I18nContext } from './i18n/I18nContext';
import { AppTitle, getStrings } from './i18n/strings';
import { ColumnLimit, type Analysis, type EntitySummary, type Mode } from './models/types';
import { errorMessage } from './services/dataverse';
import { buildReport, reportFileName } from './services/excel/report';
import { buildInsights } from './services/insights';
import { loadEntities, loadFields } from './services/metadataService';
import { scanUsage } from './services/usageService';
import { darkTheme, lightTheme } from './theme';

type Page = 'overview' | 'fields' | 'usage' | 'capacity';

const identity = (connection: ToolBoxAPI.Connection | null) => (connection ? `${connection.id}|${connection.url}` : '');

export default function App() {
    const { settings, loaded, updateSettings } = useSettings();
    const { theme, refreshTheme } = useToolboxTheme();
    const { connection, refreshConnection } = useConnection();
    const s = getStrings(settings.language);

    const [entities, setEntities] = useState<EntitySummary[] | null>(null);
    const [selected, setSelected] = useState<EntitySummary | null>(null);
    const [mode, setMode] = useState<Mode>('metadata');
    const [analysis, setAnalysis] = useState<Analysis | null>(null);
    const [page, setPage] = useState<Page>('overview');
    const [filters, setFilters] = useState<FieldFilters>(noFilters);
    const [message, setMessage] = useState<MessageState | null>(null);
    const [stopped, setStopped] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    /** Environment the data on screen was read from. */
    const source = useRef('');

    const { busy, run, stop, cancel } = useTask(
        (error) => setMessage({ title: s.errorTitle, text: errorMessage(error), intent: 'error' }),
        () => setStopped(true),
    );
    const insights = useMemo(() => analysis && buildInsights(analysis), [analysis]);

    const reset = () => {
        cancel();
        setEntities(null);
        setSelected(null);
        setAnalysis(null);
        setFilters(noFilters);
        setPage('overview');
        setStopped(false);
        setMessage(null);
        source.current = '';
    };

    // Colors of the tool are defined on <html> so popups and dialogs (portals) follow the theme too.
    useEffect(() => {
        document.documentElement.dataset.efaTheme = theme;
    }, [theme]);

    // Connection changed: what was read from the previous environment is dropped (no automatic load).
    useToolboxEvents(async (event) => {
        if (event === 'settings:updated') {
            refreshTheme();
        } else if (event.startsWith('connection:')) {
            const current = identity(await refreshConnection());
            if (source.current && current !== source.current) reset();
        }
    });

    async function getEntities() {
        setStopped(false);
        const active = await refreshConnection();
        if (!active) {
            setMessage({ title: s.noConnectionTitle, text: s.noConnection, intent: 'warning' });
            return;
        }
        if (source.current && source.current !== identity(active)) reset();
        source.current = identity(active);
        const list = await run(s.loadingEntities, (signal) => loadEntities(signal));
        if (!list) return;
        setEntities(list);
        setSelected((current) => list.find((e) => e.logicalName === current?.logicalName) ?? null);
    }

    async function analyse(entity: EntitySummary, as: Mode) {
        setStopped(false);
        setSelected(entity);
        const result = await run(s.analysing(entity.displayName || entity.logicalName), async (signal, progress): Promise<Analysis> => {
            progress(s.readingMetadata);
            const { fields, includesUnpublished } = await loadFields(entity.logicalName, signal);
            let records = 0;
            if (as === 'usage') {
                progress(s.readingRecords(0));
                const scan = await scanUsage(entity, fields, signal, (read) => progress(s.readingRecords(read)));
                records = scan.records;
                fields.forEach((field, n) => {
                    field.filled = scan.filled[n];
                    field.usage = records ? (scan.filled[n] * 100) / records : 0;
                });
            }
            return { entity, mode: as, fields, records, includesUnpublished, analysedAt: new Date() };
        });
        if (!result) return;
        setAnalysis(result);
        setFilters(noFilters);
        setPage('overview');
    }

    async function exportReport() {
        if (!analysis || !insights) return;
        setStopped(false);
        const now = new Date();
        const environment = connection ? `${connection.name} (${connection.url})` : '';
        const bytes = await run(s.exporting, async () => {
            // Lets the popup appear before the workbook is built.
            await new Promise((resolve) => setTimeout(resolve, 30));
            return buildReport(analysis, insights, s, environment, now);
        });
        if (!bytes) return;
        try {
            // Outside the loading popup: the save dialog belongs to the ToolBox.
            const name = reportFileName(analysis.entity.logicalName, now);
            const path = await window.toolboxAPI.fileSystem.saveFile(name, bytes, [{ name: 'Excel', extensions: ['xlsx'] }]);
            if (path) setMessage({ title: s.exportedTitle, text: s.exported(path), intent: 'success' });
        } catch (error) {
            setMessage({ title: s.errorTitle, text: errorMessage(error), intent: 'error' });
        }
    }

    const openFields = (chip: Chip, drill?: Drill) => {
        setFilters({ ...noFilters, chip, drill });
        setPage('fields');
    };

    const rerunWithUsage = () => {
        if (!analysis) return;
        setMode('usage');
        analyse(analysis.entity, 'usage');
    };

    const switching = analysis && selected && selected.logicalName !== analysis.entity.logicalName;

    return (
        <FluentProvider theme={theme === 'dark' ? darkTheme : lightTheme}>
            <I18nContext.Provider value={s}>
                <div className="efa-root">
                    {/* While a task runs, Tab cannot reach what is under the popup. */}
                    <div className="efa-shell" {...(busy ? ({ inert: '' } as object) : {})}>
                        <Header
                            connectionName={connection?.name}
                            language={settings.language}
                            busy={!!busy || !loaded}
                            canExport={!!analysis?.fields.length}
                            onLoad={getEntities}
                            onExport={exportReport}
                            onHelp={() => setHelpOpen(true)}
                            onLanguage={(language) => updateSettings({ language })}
                        />
                        <main className="efa-main">
                            <EntityPanel
                                entities={entities}
                                selected={selected}
                                filter={settings.filter}
                                mode={mode}
                                busy={!!busy}
                                onFilter={(filter) => updateSettings({ filter })}
                                onMode={setMode}
                                onSelect={setSelected}
                                onAnalyse={(entity) => analyse(entity, mode)}
                            />
                            <div className="efa-content">
                                <div className="efa-context">
                                    <h1>{analysis ? analysis.entity.displayName || analysis.entity.logicalName : AppTitle}</h1>
                                    {analysis && (
                                        <>
                                            <span className="efa-badge">{s.modes[analysis.mode]}</span>
                                            {analysis.mode === 'usage' && <span className="efa-badge">{s.recordsBadge(analysis.records)}</span>}
                                            <span className="efa-context-sub">
                                                {analysis.entity.logicalName} · {s.analysedAt(analysis.analysedAt)}
                                            </span>
                                        </>
                                    )}
                                    {switching && <span className="efa-context-hint">{s.switchHint(selected.displayName || selected.logicalName)}</span>}
                                </div>
                                {stopped && (
                                    <p className="efa-note efa-note-warning" role="status">
                                        {s.stopped}
                                    </p>
                                )}
                                {analysis && !analysis.includesUnpublished && <p className="efa-note efa-note-warning">{s.publishedOnly}</p>}

                                <TabList className="efa-tabs" selectedValue={analysis ? page : null} disabled={!analysis} onTabSelect={(_e, data) => setPage(data.value as Page)}>
                                    <Tab value="overview">{s.overview}</Tab>
                                    <Tab value="fields">
                                        {s.fields}
                                        {insights && <span className="efa-badge">{s.N(insights.total)}</span>}
                                    </Tab>
                                    <Tab value="usage">
                                        {s.usage}
                                        {insights && analysis && (
                                            <span className="efa-badge">{insights.hasUsage ? (analysis.records ? s.unusedBadge(insights.unused) : s.recordsBadge(0)) : s.notRun}</span>
                                        )}
                                    </Tab>
                                    <Tab value="capacity">
                                        {s.capacity}
                                        {insights && <span className="efa-badge">{s.P((insights.used * 100) / ColumnLimit)}</span>}
                                    </Tab>
                                </TabList>

                                {!analysis || !insights ? (
                                    <Welcome loaded={!!entities} picked={!!selected} />
                                ) : page === 'overview' ? (
                                    <OverviewPage insights={insights} openFields={openFields} openCapacity={() => setPage('capacity')} />
                                ) : page === 'fields' ? (
                                    <FieldsPage
                                        fields={analysis.fields}
                                        withUsage={insights.hasUsage && analysis.records > 0}
                                        filters={filters}
                                        allColumns={settings.allColumns}
                                        onFilters={setFilters}
                                        onAllColumns={(allColumns) => updateSettings({ allColumns })}
                                    />
                                ) : page === 'usage' ? (
                                    <UsagePage insights={insights} analysis={analysis} openFields={openFields} rerun={rerunWithUsage} />
                                ) : (
                                    <CapacityPage key={analysis.analysedAt.getTime()} insights={insights} openFields={openFields} />
                                )}
                            </div>
                        </main>
                    </div>

                    {busy && (
                        <div className="efa-busy" role="status" aria-live="polite">
                            <div className="efa-busy-box">
                                <AppIcon className="efa-busy-logo" />
                                <div className="efa-busy-title">{busy.title}</div>
                                {busy.text && <div className="efa-busy-text">{busy.text}</div>}
                                <div className="efa-busy-elapsed">{Math.floor((Date.now() - busy.started) / 1000)} s</div>
                                <Button autoFocus onClick={stop}>
                                    {s.stop}
                                </Button>
                            </div>
                        </div>
                    )}

                    <MessageDialog message={message} onClose={() => setMessage(null)} />
                    <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
                </div>
            </I18nContext.Provider>
        </FluentProvider>
    );
}
