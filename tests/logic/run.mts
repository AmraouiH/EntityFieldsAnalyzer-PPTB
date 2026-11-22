/* Logic tests: npm run test:logic */
import { strFromU8, unzipSync } from 'fflate';
import { getStrings } from '../../src/i18n/strings';
import type { Analysis, EntitySummary, Field } from '../../src/models/types';
import { pagingCookie, StoppedError } from '../../src/services/dataverse';
import { buildReport, reportFileName, serial } from '../../src/services/excel/report';
import { columnName, sheetName, xml } from '../../src/services/excel/xlsx';
import { buildInsights, plan, weightOf } from '../../src/services/insights';
import { isAnalysed, loadFields, matchesFilter, toField } from '../../src/services/metadataService';
import { buildFindings } from '../../src/services/recommendations';
import { pageSizeFor, scanUsage } from '../../src/services/usageService';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean) {
    if (ok) passed++;
    else {
        failed++;
        console.error(`FAIL ${name}`);
    }
}

const g = globalThis as any;
const host = (queryData: (path: string) => Promise<any>) => (g.window = { dataverseAPI: { queryData } });
const attribute = (name: string, more: object = {}) => ({ LogicalName: name, AttributeType: 'String', IsValidForRead: true, AttributeOf: null, ...more });
const field = (name: string, more: Partial<Field> = {}): Field => ({ ...toField(attribute(name)), ...more });
const entity: EntitySummary = { logicalName: 'account', displayName: 'Account', entitySetName: 'accounts', primaryId: 'accountid', createdOn: '2020-01-01', isCustom: false, isManaged: true };
const analysis = (fields: Field[], mode: Analysis['mode'] = 'usage', records = 10): Analysis => ({ entity, fields, mode, records, analysedAt: new Date(), includesUnpublished: true });
const signal = () => new AbortController().signal;

// Metadata
check('keeps a readable field', isAnalysed(attribute('name')));
check('skips AttributeOf', !isAnalysed(attribute('owneridname', { AttributeOf: 'ownerid' })));
check('skips virtual', !isAnalysed(attribute('x', { AttributeType: 'Virtual' })));
check('skips party list', !isAnalysed(attribute('x', { AttributeType: 'PartyList' })));
check('skips unreadable', !isAnalysed(attribute('x', { IsValidForRead: false })));
check('skips composite', !isAnalysed(attribute('address1_composite')));
check('skips a missing type', !isAnalysed(attribute('x', { AttributeType: null })));
const mapped = toField(
    attribute('new_parent', {
        Targets: ['account', 'contact'],
        IsCustomizable: { Value: false },
        IsAuditEnabled: { Value: true },
        RequiredLevel: { Value: 'ApplicationRequired' },
        DisplayName: { UserLocalizedLabel: null },
        CreatedOn: '0001-01-01T00:00:00Z',
    }),
);
check('all targets', mapped.target === 'account, contact');
check('managed property', mapped.extra.IsCustomizable === false && mapped.auditable);
check('required level', mapped.requiredLevel === 'ApplicationRequired');
check('no label, no crash', mapped.displayName === '' && mapped.createdOn === null);
check('filter custom', !matchesFilter(entity, 'custom'));
check('filter standard', matchesFilter(entity, 'standard'));
check('filter system', matchesFilter(entity, 'system'));
check('filter all', matchesFilter(entity, 'all'));

let paths: string[] = [];
host(async (path) => {
    paths.push(path);
    return { EntityMetadata: { Attributes: [attribute('b'), attribute('a')] } };
});
let read = await loadFields('account', signal());
check('RetrieveEntity as if published', paths[0].includes('@p4=true') && read.includesUnpublished);
check('sorted by name', read.fields.map((f) => f.name).join() === 'a,b');
host(async (path) => {
    if (path.startsWith('RetrieveEntity')) throw new Error('refused');
    return { value: [attribute('a')] };
});
const warn = console.warn;
console.warn = () => undefined;
read = await loadFields('account', signal());
console.warn = warn;
check('falls back on published metadata', !read.includesUnpublished && read.fields.length === 1);

// Capacity
check('weight 3', weightOf('Lookup') === 3 && weightOf('Owner') === 3);
check('weight 2', ['Status', 'Boolean', 'Picklist', 'Money'].every((t) => weightOf(t) === 2));
check('weight 1', ['Customer', 'String', 'State'].every((t) => weightOf(t) === 1));
check('exact fit', plan(1014, 2, 2, 0).fits);
check('one too many', !plan(1014, 2, 2, 1).fits);
check('over the limit', plan(1100, 0, 0, 1).available === -76);

// Insights
const many = Array.from({ length: 10 }, (_v, n) => field(`p${n}_f`, { custom: true }));
const others = buildInsights(analysis(many)).publishers[7];
check('other prefixes', others.value === 3);
check('other prefixes drill-down', many.filter(others.test!).length === 3);
check('empty table', buildInsights(analysis([], 'metadata')).used === 0);

// Recommendations
const rules = (f: Field, records = 10) => buildFindings(analysis([f], 'usage', records), buildInsights(analysis([f], 'usage', records))).map((x) => x.rule);
check('unused', rules(field('new_a', { custom: true })).includes('unused'));
const secured = rules(field('new_a', { custom: true, secured: true, requiredLevel: 'SystemRequired' }));
check('secured is never proposed for deletion', !secured.includes('unused') && secured.includes('securedEmpty'));
check('secured is not a quality issue', !secured.includes('quality'));
check('low', rules(field('new_a', { custom: true, filled: 1, usage: 1 })).includes('low'));
check('quality', rules(field('a', { requiredLevel: 'SystemRequired', usage: 50 })).includes('quality'));
check('primary key kept', !rules(field('new_id', { custom: true, key: true })).includes('unused'));
const empty = rules(field('new_a', { custom: true }), 0);
check('no record, no unused', empty.includes('noRecord') && !empty.includes('unused'));

// Paging
const inner = '<cookie page="1"><accountid last="{A&B}" /></cookie>';
check('cookie decoded twice', pagingCookie(`<cookie pagenumber="2" pagingcookie="${encodeURIComponent(encodeURIComponent(inner))}" istracking="False" />`) === inner);
check('no cookie', pagingCookie(undefined) === undefined);
check('small rows', pageSizeFor(1000, 100) === 5000);
check('big rows', pageSizeFor(20 * 1024 * 1024, 20) === 5);
check('empty probe', pageSizeFor(2, 0) === 5000);

const rows = Array.from({ length: 95 }, (_v, n) => ({ accountid: `${n}`, zero: 0, no: false, blank: '', _parent_value: n % 2 ? null : 'id', nothing: null }));
const counted = ['accountid', 'zero', 'no', 'blank', 'parent', 'nothing', 'absent'].map((name) => field(name));
paths = [];
host(async (path) => {
    const fetch = decodeURIComponent(path.split('fetchXml=')[1]);
    const count = Number(/count="(\d+)"/.exec(fetch)![1]);
    const page = Number(/page="(\d+)"/.exec(fetch)![1]);
    paths.push(fetch);
    if (count > 20) throw new Error('Dataverse response exceeds the maximum size');
    const response: any = { value: rows.slice((page - 1) * count, page * count) };
    if (page * count < rows.length) {
        response['@Microsoft.Dynamics.CRM.morerecords'] = true;
        response['@Microsoft.Dynamics.CRM.fetchxmlpagingcookie'] = `<cookie pagingcookie="${encodeURIComponent(encodeURIComponent(inner))}" />`;
    }
    return response;
});
const scan = await scanUsage(entity, counted, signal(), () => undefined);
check('every record once, after smaller pages', scan.records === 95);
check('0, false and "" are values; lookups', scan.filled.join() === '95,95,95,95,48,0,0');
check('cookie escaped in the fetch', paths.some((p) => p.includes('paging-cookie="&lt;cookie page=&quot;1&quot;') && p.includes('{A&amp;B}')));

host(async () => ({ value: [], '@Microsoft.Dynamics.CRM.morerecords': true }));
check('never partial', await scanUsage(entity, counted, signal(), () => undefined).then(() => false, () => true));
host(() => new Promise(() => undefined));
const controller = new AbortController();
const pending = scanUsage(entity, counted, controller.signal, () => undefined);
controller.abort();
check('stop does not wait for the server', await pending.then(() => false, (e) => e instanceof StoppedError));

// Excel
check('columns', columnName(1) === 'A' && columnName(27) === 'AA' && columnName(703) === 'AAA');
check('sheet name', sheetName('a'.repeat(50), '_MetaData').length === 31);
check('xml cleaned', xml('a\u0001<&>"\ud800') === 'a&lt;&amp;&gt;&quot;');
check('emoji kept', xml('😀') === '😀');
check('date serial', serial('2026-11-22') === 46348);
check('file name', reportFileName('account', new Date(2026, 10, 2)) === 'account_EntityKPIsExport_2026-11-02.xlsx');
for (const language of ['en', 'fr'] as const) {
    for (const mode of ['metadata', 'usage'] as const) {
        for (const fields of [[], [field('new_a', { custom: true, description: '=HYPERLINK("x")', createdOn: '2026-01-02' })]]) {
            const data = analysis(fields, mode);
            const files = unzipSync(buildReport(data, buildInsights(data), getStrings(language), 'Test', new Date()));
            const sheets = [...strFromU8(files['xl/workbook.xml']).matchAll(/<sheet name=/g)].length;
            check(`workbook ${language} ${mode} ${fields.length}`, sheets === (mode === 'usage' ? 9 : 8));
            if (fields.length) check(`text stays text ${language} ${mode}`, !strFromU8(files['xl/worksheets/sheet1.xml']).includes('<f>HYPERLINK'));
        }
    }
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
