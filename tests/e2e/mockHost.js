/*
 * In-memory Dataverse + ToolBox host of the end-to-end tests, injected before the tool loads.
 * Synthetic data only. Like the real host it rejects large responses, and it records any write or extra header.
 * window.__mock lets a test change the behavior: delay, fail, refuseFunction, maxCount, noConnection, cancelSave...
 */
(() => {
    const mock = (window.__mock = { calls: [], violations: [], files: [], delay: 5, fail: null, refuseFunction: false, maxCount: 5000, theme: 'light', noConnection: false, cancelSave: false, saveFails: false, settings: {} });
    Object.assign(mock, window.__mockInit ?? {});

    const label = (text) => ({ UserLocalizedLabel: text ? { Label: text, LanguageCode: 1033 } : null, LocalizedLabels: [] });
    const value = (Value) => ({ Value, CanBeChanged: true, ManagedPropertyLogicalName: 'x' });
    const tables = [
        ['account', 'Account'], ['appointment', 'Appointment'], ['campaign', 'Campaign'], ['competitor', 'Competitor'], ['contact', 'Contact'],
        ['contoso_project', 'Project'], ['contoso_site', 'Site'], ['contoso_empty', 'Empty table'], ['contract', 'Contract'], ['incident', 'Case'],
        ['invoice', 'Invoice'], ['lead', 'Lead'], ['opportunity', 'Opportunity'], ['product', 'Product'], ['quote', 'Quote'], ['salesorder', 'Order'],
        ['territory', 'Territory'], ['nolabel', ''],
    ];

    const mix = [
        ['String', 26, 'text'], ['Lookup', 15, 'related'], ['Picklist', 14, 'choice'], ['Boolean', 12, 'flag'], ['Money', 9, 'amount'],
        ['DateTime', 8, 'date'], ['Integer', 5, 'count'], ['Memo', 4, 'notes'], ['Decimal', 3, 'ratio'],
    ];
    const standard = {
        String: ['telephone1', 'emailaddress1', 'websiteurl', 'accountnumber', 'fax', 'tickersymbol', 'sic', 'address1_city', 'address1_country', 'address1_line1', 'address1_postalcode', 'address2_city', 'telephone2', 'stockexchange'],
        Lookup: ['primarycontactid', 'parentaccountid', 'transactioncurrencyid', 'createdby', 'modifiedby', 'preferredsystemuserid', 'defaultpricelevelid', 'territoryid', 'originatingleadid'],
        Picklist: ['industrycode', 'accountcategorycode', 'ownershipcode', 'paymenttermscode', 'shippingmethodcode', 'customertypecode', 'territorycode', 'accountratingcode'],
        Boolean: ['creditonhold', 'donotemail', 'donotphone', 'donotfax', 'donotpostalmail', 'followemail', 'merged'],
        Money: ['revenue', 'creditlimit', 'marketcap', 'openrevenue', 'aging30', 'aging60'],
        DateTime: ['createdon', 'modifiedon', 'lastusedincampaign', 'lastonholdtime', 'overriddencreatedon'],
        Integer: ['numberofemployees', 'sharesoutstanding', 'versionnumber'],
        Memo: ['description', 'address1_notes'],
        Decimal: ['exchangerate'],
    };
    const custom = ['brand', 'tier', 'channel', 'salesagency', 'legacyid', 'segment', 'region', 'score', 'onboarding', 'renewal', 'keyaccount', 'oldcrmkey'];

    function attributesOf(table) {
        const result = [];
        const add = (name, type, isCustom, more = {}) => {
            const n = result.length;
            const year = isCustom ? 2021 + ((n * 7) % 6) : 2019;
            result.push({
                LogicalName: name,
                AttributeType: type,
                DisplayName: label(name === 'contoso_tier0' ? '' : name.replace(/^(contoso|cr8a1|new)_/, '').replace(/^./, (c) => c.toUpperCase())),
                Description: label(isCustom && n % 3 ? '' : `The ${name} of the ${table}`),
                IsManaged: !isCustom || n % 5 < 3,
                IsCustomAttribute: isCustom,
                IsAuditEnabled: value(n % 5 < 3),
                IsValidForAdvancedFind: value(n % 17 !== 0),
                RequiredLevel: value(n % 9 === 0 ? 'ApplicationRequired' : 'None'),
                IsValidForRead: true,
                IsSecured: n % 23 === 7,
                IsPrimaryId: false,
                IsPrimaryName: false,
                AttributeOf: null,
                IntroducedVersion: '1.0.0.0',
                CreatedOn: `${year}-03-15T10:00:00Z`,
                ModifiedOn: '2026-09-20T10:00:00Z',
                ColumnNumber: n + 1,
                IsCustomizable: value(true),
                IsRenameable: value(true),
                EntityLogicalName: table,
                SourceType: 0,
                ...more,
            });
        };
        add(`${table}id`, 'Uniqueidentifier', false, { IsPrimaryId: true });
        add('name', 'String', false, { IsPrimaryName: true, RequiredLevel: value('ApplicationRequired') });
        add('ownerid', 'Owner', false, { Targets: ['systemuser', 'team'], RequiredLevel: value('SystemRequired') });
        add('statecode', 'State', false);
        add('statuscode', 'Status', false);
        add('customerid', 'Customer', false, { Targets: ['account', 'contact'] });
        let c = 0;
        for (const [type, count, word] of mix) {
            for (let i = 0; i < count; i++) {
                const known = standard[type][i];
                if (known) add(known, type, false, type === 'Lookup' ? { Targets: ['contact'] } : {});
                else {
                    const prefix = ['contoso_', 'contoso_', 'contoso_', 'cr8a1_', 'cr8a1_', 'new_'][c % 6];
                    const base = c < custom.length ? custom[c] + (c === 1 ? '0' : '') : `${word}${i}`;
                    add(prefix + base, type, true, type === 'Lookup' ? { Targets: ['contoso_project'] } : {});
                    c++;
                }
            }
        }
        // Left out of the analysis.
        add('owneridname', 'String', false, { AttributeOf: 'ownerid' });
        add('entityimage', 'Virtual', false);
        add('address1_composite', 'Memo', false);
        add('requiredattendees', 'PartyList', false);
        return result;
    }

    const TotalRecords = 12480;
    function record(attributes, r) {
        const row = {};
        attributes.forEach((a, n) => {
            let rate;
            if (a.IsPrimaryId || a.IsPrimaryName || ['ownerid', 'statecode', 'statuscode', 'createdon', 'modifiedon', 'versionnumber'].includes(a.LogicalName)) rate = 1000;
            else if (a.IsCustomAttribute) rate = [0, 8, 120, 430, 2, 660, 40, 0, 900, 15][n % 10];
            else rate = [350, 720, 90, 510, 250, 980, 0, 130][n % 8];
            const filled = (r * 7919 + n * 31) % 1000 < rate;
            const key = ['Lookup', 'Owner', 'Customer'].includes(a.AttributeType) ? `_${a.LogicalName}_value` : a.LogicalName;
            row[key] = !filled ? null : a.AttributeType === 'Boolean' ? false : ['Integer', 'Money', 'Decimal', 'State'].includes(a.AttributeType) ? 0 : 'v';
        });
        return row;
    }
    const cache = new Map();
    const kept = (table) => {
        if (!cache.has(table)) cache.set(table, attributesOf(table));
        return cache.get(table);
    };

    async function queryData(path, target, headers) {
        mock.calls.push(decodeURIComponent(path));
        if (target !== undefined || headers !== undefined) mock.violations.push(`extra argument: ${path}`);
        await new Promise((resolve) => setTimeout(resolve, mock.delay));
        if (mock.fail && path.includes(mock.fail)) throw new Error('0x80040220: Principal user is missing the Read privilege');

        if (path.startsWith('EntityDefinitions?')) {
            return {
                value: tables.map(([logical, display]) => ({
                    LogicalName: logical,
                    DisplayName: label(display),
                    EntitySetName: `${logical}s`,
                    PrimaryIdAttribute: `${logical}id`,
                    CreatedOn: '2019-03-15T10:00:00Z',
                    IsCustomEntity: logical.startsWith('contoso_'),
                    IsManaged: !logical.startsWith('contoso_') || logical === 'contoso_site',
                })),
            };
        }
        let match = /^RetrieveEntity\(.*@p2='([^']+)'/.exec(path);
        if (match) {
            if (mock.refuseFunction) throw new Error('0x80060888: RetrieveEntity refused');
            return { EntityMetadata: { Attributes: kept(match[1]) } };
        }
        match = /^EntityDefinitions\(LogicalName='([^']+)'\)\/Attributes$/.exec(path);
        if (match) return { value: kept(match[1]) };

        match = /^([a-z0-9_]+)s\?fetchXml=(.+)$/.exec(path);
        if (match) {
            const doc = new DOMParser().parseFromString(decodeURIComponent(match[2]), 'text/xml');
            if (doc.querySelector('parsererror')) throw new Error('Invalid FetchXML');
            const count = Number(doc.documentElement.getAttribute('count'));
            const page = Number(doc.documentElement.getAttribute('page'));
            if (count > mock.maxCount) throw new Error('Dataverse response exceeds the maximum size');
            if (page > 1 && doc.documentElement.getAttribute('paging-cookie') !== `<cookie page="${page - 1}"><id last="{${page - 1}}" /></cookie>`) throw new Error('Wrong paging cookie');
            const total = match[1] === 'contoso_empty' ? 0 : TotalRecords;
            const attributes = kept(match[1]);
            const rows = [];
            for (let r = (page - 1) * count; r < Math.min(total, page * count); r++) rows.push(record(attributes, r));
            const response = { value: rows };
            if (page * count < total) {
                const cookie = encodeURIComponent(encodeURIComponent(`<cookie page="${page}"><id last="{${page}}" /></cookie>`));
                response['@Microsoft.Dynamics.CRM.morerecords'] = true;
                response['@Microsoft.Dynamics.CRM.fetchxmlpagingcookie'] = `<cookie pagenumber="${page + 1}" pagingcookie="${cookie}" istracking="False" />`;
            }
            return response;
        }
        throw new Error(`Unexpected query: ${path}`);
    }

    // Any other Dataverse API would be a write, or an API the tool does not need.
    window.dataverseAPI = new Proxy({ queryData }, { get: (api, name) => api[name] ?? (() => mock.violations.push(`dataverseAPI.${String(name)}`)) });

    let connection = { id: 'c1', name: 'Contoso Dev', url: 'https://contoso-dev.crm.dynamics.com', environment: 'Dev' };
    let handlers = [];
    const emit = (event) => handlers.forEach((handler) => handler({}, { event, data: {} }));
    mock.switchConnection = (name) => {
        connection = { id: name, name, url: `https://${name}.crm.dynamics.com`, environment: 'Test' };
        emit('connection:updated');
    };
    mock.touchConnection = () => emit('connection:updated');
    mock.setTheme = (theme) => {
        mock.theme = theme;
        emit('settings:updated');
    };

    window.toolboxAPI = {
        settings: { get: async (key) => mock.settings[key], set: async (key, data) => void (mock.settings[key] = data) },
        utils: { getCurrentTheme: async () => mock.theme, openInConnectionBrowser: async (url) => void (mock.opened = url) },
        connections: { getActiveConnection: async () => (mock.noConnection ? null : connection) },
        events: { on: (handler) => handlers.push(handler), off: (handler) => (handlers = handlers.filter((h) => h !== handler)) },
        fileSystem: {
            saveFile: async (name, bytes) => {
                if (mock.saveFails) throw new Error('EBUSY: the file is open in Excel');
                if (mock.cancelSave) return null;
                mock.files.push({ name, data: Array.from(bytes) });
                return `C:\\Reports\\${name}`;
            },
        },
    };
    window.open = (url) => ((mock.opened = url), {});
})();
