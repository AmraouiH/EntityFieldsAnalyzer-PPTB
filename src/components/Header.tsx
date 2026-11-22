import { Button, Menu, MenuItemRadio, MenuList, MenuPopover, MenuTrigger, Tooltip } from '@fluentui/react-components';
import { ArrowDownloadRegular, GlobeRegular, PersonRegular, QuestionCircleRegular, TableSearchRegular } from '@fluentui/react-icons';
import { useStrings } from '../i18n/I18nContext';
import { AppTitle, AuthorName, type Language } from '../i18n/strings';
import { AppIcon } from './AppIcon';

/** The only external link of the tool (marketplace policy: one unobtrusive link). */
const LinkedInUrl = 'https://www.linkedin.com/in/hamza-amraoui/';

/** Opens an external page (falls back to the connection browser when the host blocks window.open). */
async function openUrl(url: string) {
    try {
        const opened = window.open(url, '_blank', 'noopener');
        if (!opened) await window.toolboxAPI.utils.openInConnectionBrowser(url);
    } catch (error) {
        console.error(`Entity Fields Analyzer: unable to open ${url}`, error);
    }
}

interface HeaderProps {
    connectionName?: string | null;
    language: Language;
    busy: boolean;
    /** Export only makes sense once an entity is analysed. */
    canExport: boolean;
    onLoad: () => void;
    onExport: () => void;
    onHelp: () => void;
    onLanguage: (language: Language) => void;
}

/** Gradient header: logo, title, connection, toolbar (same header as ServiceBus Explorer). */
export function Header(props: HeaderProps) {
    const s = useStrings();

    return (
        <header className="efa-header">
            <div className="efa-brand">
                <AppIcon className="efa-logo" />
                <div>
                    <div className="efa-title">{AppTitle}</div>
                    <div className="efa-subtitle">{s.appSubtitle}</div>
                </div>
            </div>

            <div className="efa-header-tools">
                <span className={props.connectionName ? 'efa-connection efa-connection-on' : 'efa-connection'}>
                    {props.connectionName ? `● ${s.connectedTo(props.connectionName)}` : `○ ${s.notConnected}`}
                </span>

                <Tooltip content={s.getEntitiesTip} relationship="description">
                    <Button appearance="primary" className="efa-load" icon={<TableSearchRegular />} onClick={props.onLoad} disabled={props.busy}>
                        {s.getEntities}
                    </Button>
                </Tooltip>
                {props.canExport && (
                    <Button appearance="transparent" className="efa-header-button" icon={<ArrowDownloadRegular />} onClick={props.onExport} disabled={props.busy}>
                        {s.exportExcel}
                    </Button>
                )}

                <Menu checkedValues={{ language: [props.language] }} onCheckedValueChange={(_e, data) => props.onLanguage(data.checkedItems[0] as Language)}>
                    <MenuTrigger disableButtonEnhancement>
                        <Button appearance="transparent" className="efa-header-button" icon={<GlobeRegular />} title={s.languageMenu}>
                            {props.language === 'fr' ? 'Français' : 'English'}
                        </Button>
                    </MenuTrigger>
                    <MenuPopover>
                        <MenuList>
                            <MenuItemRadio name="language" value="en">
                                English
                            </MenuItemRadio>
                            <MenuItemRadio name="language" value="fr">
                                Français
                            </MenuItemRadio>
                        </MenuList>
                    </MenuPopover>
                </Menu>

                <Button appearance="transparent" className="efa-header-button" icon={<QuestionCircleRegular />} onClick={props.onHelp}>
                    {s.help}
                </Button>
                <Button appearance="transparent" className="efa-header-button" icon={<PersonRegular />} title={s.authorTip} onClick={() => openUrl(LinkedInUrl)}>
                    {AuthorName}
                </Button>
            </div>
        </header>
    );
}
