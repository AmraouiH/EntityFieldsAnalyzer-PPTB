/*
 * End-to-end tests of Entity Fields Analyzer: the production bundle, opened from file:// with the CSP of the
 * ToolBox, against an in-memory Dataverse and ToolBox (tests/e2e/mockHost.js).
 * Usage: npm run test:e2e
 * EFA_SHOTS=folder saves screenshots of the screens, EFA_XLSX=folder the exported workbooks.
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { execSync } = require('child_process');
const { chromium } = require('playwright-core');
const { strFromU8, unzipSync } = require('fflate');

const root = path.resolve(__dirname, '..', '..');
const shots = process.env.EFA_SHOTS;
const workbooks = process.env.EFA_XLSX;
const Csp = "default-src 'self'; script-src 'self' 'unsafe-inline' file:; style-src 'self' 'unsafe-inline' file:; img-src 'self' data: file:; font-src 'self' data:; connect-src 'self'";

function findBrowser() {
    const found = [
        process.env.PW_BROWSER,
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
    ].find((p) => p && fs.existsSync(p));
    if (!found) throw new Error('No Chromium-based browser found. Set PW_BROWSER to its executable path.');
    return found;
}

const tests = [];
const test = (name, body, options = {}) => tests.push({ name, body, options });
function expect(ok, message) {
    if (!ok) throw new Error(message);
}

const button = (p, name) => p.getByRole('button', { name, exact: true });
const tab = (p, name) => p.getByRole('tab', { name: new RegExp(`^${name}`) });
const option = (p, name) => p.locator('.efa-entity').filter({ has: p.locator('.efa-entity-schema', { hasText: new RegExp(`^${name}$`) }) });
const card = (p, title) => p.locator('.efa-card').filter({ has: p.locator('h2', { hasText: new RegExp(`^${title}$`) }) });
const rows = (p) => p.locator('.efa-grid tbody tr');
const mock = (p, change) => p.evaluate((c) => Object.assign(window.__mock, c), change);
const calls = (p) => p.evaluate(() => window.__mock.calls);
const idle = (p) => p.locator('.efa-busy').waitFor({ state: 'detached', timeout: 60000 });

async function load(p) {
    await button(p, 'Get Entities').click();
    await p.locator('.efa-entity').first().waitFor();
    await idle(p);
}
async function analyse(p, usage = false, name = 'account') {
    await load(p);
    await option(p, name).click();
    if (usage) await p.getByRole('radio', { name: 'Metadata + Data usage' }).check();
    await p.locator('.efa-analyse').click();
    await p.locator('.efa-tiles').waitFor({ timeout: 60000 });
    await idle(p);
}
async function dialog(p, text) {
    await p.getByRole('dialog').getByText(text).first().waitFor({ timeout: 5000 });
}
async function shot(p, name) {
    if (!shots) return;
    await p.mouse.move(1, 939);
    await p.waitForTimeout(350);
    await p.screenshot({ path: path.join(shots, `${name}.png`) });
}
async function savedWorkbook(p, name) {
    await button(p, 'Export to Excel').click();
    await dialog(p, 'Export completed');
    const file = await p.evaluate(() => window.__mock.files.at(-1));
    const data = Uint8Array.from(file.data);
    if (workbooks) fs.writeFileSync(path.join(workbooks, `${name}.xlsx`), data);
    const zip = unzipSync(data);
    return { file, zip, names: [...strFromU8(zip['xl/workbook.xml']).matchAll(/<sheet name="([^"]*)"/g)].map((m) => m[1]) };
}

// #region Start

test('nothing is read before the click', async (p) => {
    await p.waitForTimeout(400);
    expect((await calls(p)).length === 0, 'Dataverse was called on load');
    expect(await button(p, 'Export to Excel').count() === 0, 'Export shown without analysis');
    expect(await p.locator('.efa-analyse').count() === 0, 'Analyse shown without selection');
    expect(await tab(p, 'Overview').first().isDisabled(), 'tabs enabled without analysis');
});

test('get entities, guide follows', async (p) => {
    await load(p);
    expect(await p.locator('.efa-entity').count() === 18, 'entity count');
    expect((await p.locator('.efa-step-current h3').innerText()) === 'Choose an entity', 'step 2 expected');
    await option(p, 'account').click();
    expect((await p.locator('.efa-step-current h3').innerText()) === 'Run the analysis', 'step 3 expected');
    await shot(p, 'guide');
});

test('entity without label', async (p) => {
    await load(p);
    expect((await option(p, 'nolabel').locator('.efa-entity-name').innerText()) === 'nolabel', 'fallback label');
});

for (const [filter, count] of [['all', 18], ['custom', 3], ['standard', 15], ['system', 16]]) {
    test(`entity filter: ${filter}`, async (p) => {
        await load(p);
        await p.getByLabel('Entity filter').selectOption(filter);
        expect(await p.locator('.efa-entity').count() === count, `expected ${count}`);
    });
}

test('entity search, quotes and brackets included', async (p) => {
    await load(p);
    const search = p.getByPlaceholder('Search by display or schema name');
    await search.fill('case');
    expect(await p.locator('.efa-entity').count() === 1, 'display name search');
    await search.fill('CONTOSO_');
    expect(await p.locator('.efa-entity').count() === 3, 'schema name search');
    await search.fill("o'[%]*");
    await p.getByText('No entity matches your search.').waitFor();
});

test('no connection', async (p) => {
    await mock(p, { noConnection: true });
    await button(p, 'Get Entities').click();
    await dialog(p, 'Connect the tool to a Dataverse environment first.');
    await button(p, 'OK').click();
});

test('error while listing entities', async (p) => {
    await mock(p, { fail: 'EntityDefinitions' });
    await button(p, 'Get Entities').click();
    await dialog(p, 'Principal user is missing the Read privilege');
    await button(p, 'OK').click();
    await mock(p, { fail: null });
    await load(p);
}, { errors: true });

// #endregion

// #region Analysis

test('analyse: metadata only reads no record', async (p) => {
    await analyse(p);
    expect((await p.locator('.efa-stat-value').first().innerText()) === '102', 'field count');
    expect(!(await calls(p)).some((c) => c.includes('fetchXml')), 'records were read');
    await button(p, 'Export to Excel').waitFor();
});

test('double-click analyses', async (p) => {
    await load(p);
    await option(p, 'contact').dblclick();
    await p.locator('.efa-tiles').waitFor();
    expect((await p.locator('.efa-context h1').innerText()) === 'Contact', 'title');
});

test('usage: every page is read once', async (p) => {
    await analyse(p, true);
    expect((await p.locator('.efa-context').innerText()).includes('12,480 records'), 'record badge');
    expect((await calls(p)).some((c) => c.includes('paging-cookie=')), 'no paging');
    await shot(p, 'overview');
    await tab(p, 'Data usage').first().click();
    await shot(p, 'data-usage');
});

test('usage: too large pages are read smaller', async (p) => {
    await mock(p, { maxCount: 1000 });
    await analyse(p, true);
    expect((await p.locator('.efa-context').innerText()).includes('12,480 records'), 'record badge');
});

test('usage: too large probe', async (p) => {
    await mock(p, { maxCount: 10, delay: 0 });
    await load(p);
    await option(p, 'contoso_empty').click();
    await p.getByRole('radio', { name: 'Metadata + Data usage' }).check();
    await p.locator('.efa-analyse').click();
    await p.locator('.efa-tiles').waitFor();
});

test('usage: empty table is not "all unused"', async (p) => {
    await analyse(p, true, 'contoso_empty');
    await tab(p, 'Data usage').first().click();
    await p.getByText("No record could be read: fill rates can't be computed.").waitFor();
    await tab(p, 'Fields').first().click();
    expect(await p.locator('.efa-unused').count() === 0, 'rows highlighted');
    expect(await button(p, 'Never used').count() === 0, 'Never used chip');
});

test('warning of the usage mode, without popup', async (p) => {
    await load(p);
    await option(p, 'account').click();
    await p.getByRole('radio', { name: 'Metadata + Data usage' }).check();
    await p.getByText('Reads every record: it can take a while on large tables.').waitFor();
    expect(await p.getByRole('dialog').count() === 0, 'popup shown');
});

test('run again with data usage', async (p) => {
    await analyse(p);
    await tab(p, 'Data usage').first().click();
    await button(p, 'Analyse with data usage').click();
    await p.locator('.efa-context').getByText('12,480 records').waitFor({ timeout: 60000 });
    expect(await p.getByRole('radio', { name: 'Metadata + Data usage' }).isChecked(), 'mode not updated');
});

test('published metadata fallback is said', async (p) => {
    await mock(p, { refuseFunction: true });
    await analyse(p);
    await p.getByText('Only published metadata could be read', { exact: false }).waitFor();
});

test('error while reading the metadata', async (p) => {
    await mock(p, { refuseFunction: true, fail: '/Attributes' });
    await load(p);
    await option(p, 'account').dblclick();
    await dialog(p, 'Principal user is missing the Read privilege');
}, { errors: true });

test('error while reading the records', async (p) => {
    await mock(p, { fail: 'fetchXml' });
    await load(p);
    await option(p, 'account').click();
    await p.getByRole('radio', { name: 'Metadata + Data usage' }).check();
    await p.locator('.efa-analyse').click();
    await dialog(p, 'Principal user is missing the Read privilege');
    expect(await button(p, 'Export to Excel').count() === 0, 'partial result kept');
}, { errors: true });

for (const how of ['button', 'Escape']) {
    test(`stop with ${how}`, async (p) => {
        await load(p);
        await mock(p, { delay: 1500 });
        await option(p, 'account').dblclick();
        await p.locator('.efa-busy').waitFor();
        await p.waitForTimeout(250);
        if (how === 'button') {
            await shot(p, 'loading');
            await button(p, 'Stop').click();
        } else await p.keyboard.press('Escape');
        await p.getByText('Stopped. No partial result was kept.').waitFor({ timeout: 700 });
        await p.waitForTimeout(1700);
        expect(await p.locator('.efa-tiles').count() === 0, 'late result applied');
    });
}

test('stop while listing entities', async (p) => {
    await mock(p, { delay: 1500 });
    await button(p, 'Get Entities').click();
    await button(p, 'Stop').click();
    await p.waitForTimeout(1700);
    expect(await p.locator('.efa-entity').count() === 0, 'late list applied');
});

test('switch hint', async (p) => {
    await analyse(p);
    await option(p, 'lead').click();
    await p.getByText('Lead selected · click Analyse to switch').waitFor();
    await p.locator('.efa-analyse').click();
    await idle(p);
    expect((await p.locator('.efa-context h1').innerText()) === 'Lead', 'not switched');
});

test('connection change clears the data, no automatic load', async (p) => {
    await analyse(p);
    const before = (await calls(p)).length;
    await p.evaluate(() => window.__mock.switchConnection('fabrikam'));
    await p.getByText('Connected to fabrikam').waitFor();
    expect(await p.locator('.efa-entity').count() === 0, 'old entities kept');
    expect(await button(p, 'Export to Excel').count() === 0, 'old analysis kept');
    expect((await calls(p)).length === before, 'loaded automatically');
});

test('connection change during a scan', async (p) => {
    await load(p);
    await mock(p, { delay: 1200 });
    await option(p, 'account').dblclick();
    await p.locator('.efa-busy').waitFor();
    await p.evaluate(() => window.__mock.switchConnection('fabrikam'));
    await p.waitForTimeout(1500);
    expect(await p.locator('.efa-tiles').count() === 0, 'result of the previous environment shown');
});

test('same connection updated keeps the analysis', async (p) => {
    await analyse(p);
    await p.evaluate(() => window.__mock.touchConnection());
    await p.waitForTimeout(200);
    expect(await p.locator('.efa-tiles').count() === 1, 'analysis lost');
});

// #endregion

// #region Drill-down

for (const [n, chip, count] of [[0, 'All', 102], [1, 'Custom fields', null], [2, 'Unmanaged', null]]) {
    test(`tile ${chip}`, async (p) => {
        await analyse(p);
        const value = Number(await p.locator('.efa-stat-value').nth(n).innerText());
        await p.locator('.efa-stat').nth(n).click();
        expect(await button(p, chip).getAttribute('aria-pressed') === 'true', 'chip');
        expect(await rows(p).count() === (count ?? value), 'row count');
    });
}

test('tile capacity', async (p) => {
    await analyse(p);
    await p.locator('.efa-stat').nth(3).click();
    await card(p, 'Column budget').waitFor();
});

for (const title of ['Field types', 'Field settings', 'Publishers']) {
    test(`every bar of ${title}`, async (p) => {
        await analyse(p);
        const bars = card(p, title).locator('.efa-bar');
        const count = await bars.count();
        expect(count > 0, 'no bar');
        for (let n = 0; n < count; n++) {
            const shown = await bars.nth(n).locator('.efa-bar-value').innerText();
            await bars.nth(n).click();
            const listed = await rows(p).count();
            if (shown.endsWith('%')) expect(Math.round((listed * 100) / 102) === Number.parseFloat(shown), `bar ${n}`);
            else expect(listed === Number(shown), `bar ${n}`);
            await p.locator('.efa-drill').waitFor();
            await tab(p, 'Overview').first().click();
        }
    });
}

test('every origin of the legend', async (p) => {
    await analyse(p);
    const items = p.locator('.efa-doughnut-legend button');
    for (let n = 0, count = await items.count(); n < count; n++) {
        const shown = Number(await items.nth(n).locator('b').innerText());
        await items.nth(n).click();
        expect(await rows(p).count() === shown, `origin ${n}`);
        await tab(p, 'Overview').first().click();
    }
});

test('slice of the doughnut', async (p) => {
    await analyse(p);
    await p.locator('.efa-slice').first().dispatchEvent('click');
    await p.locator('.efa-drill').filter({ hasText: 'Origin: Standard' }).waitFor();
});

test('every column of the timeline', async (p) => {
    await analyse(p);
    const columns = card(p, 'Fields created over time').locator('.efa-column');
    let total = 0;
    for (let n = 0, count = await columns.count(); n < count; n++) {
        await columns.nth(n).click();
        total += await rows(p).count();
        await tab(p, 'Overview').first().click();
    }
    expect(total === 102, 'timeline total');
});

test('every band of the distribution', async (p) => {
    await analyse(p, true);
    await tab(p, 'Data usage').first().click();
    const columns = card(p, 'Fill rate distribution').locator('.efa-column');
    let total = 0;
    for (let n = 0; n < 6; n++) {
        await columns.nth(n).click();
        total += await rows(p).count();
        await tab(p, 'Data usage').first().click();
    }
    expect(total === 102, 'band total');
});

for (const [title, expected] of [['Fill rate by type', null], ['Least used custom fields', 1]]) {
    test(`every bar of ${title}`, async (p) => {
        await analyse(p, true);
        await tab(p, 'Data usage').first().click();
        const bars = card(p, title).locator('.efa-bar');
        for (let n = 0, count = await bars.count(); n < count; n++) {
            await bars.nth(n).click();
            const listed = await rows(p).count();
            expect(expected === null ? listed > 0 : listed === expected, `bar ${n}`);
            await tab(p, 'Data usage').first().click();
        }
    });
}

for (const [n, name] of [[1, 'never used'], [2, 'rarely used']]) {
    test(`tile ${name}`, async (p) => {
        await analyse(p, true);
        await tab(p, 'Data usage').first().click();
        const value = Number(await p.locator('.efa-stat-value').nth(n).innerText());
        await p.locator('.efa-stat').nth(n).click();
        expect(await rows(p).count() === value, 'row count');
        if (n === 1) {
            expect(await p.locator('.efa-unused').count() === value, 'highlight');
            await button(p, 'All').click();
            await shot(p, 'fields');
        }
    });
}

test('what consumes the budget', async (p) => {
    await analyse(p);
    await tab(p, 'Capacity').first().click();
    await card(p, 'What consumes the budget').locator('.efa-bar').first().click();
    await p.locator('.efa-drill').filter({ hasText: 'Type: Lookup' }).waitFor();
});

test('tooltip on hover', async (p) => {
    await analyse(p);
    await card(p, 'Field types').locator('.efa-bar').first().hover();
    await p.getByRole('tooltip').filter({ hasText: ':' }).first().waitFor();
});

// #endregion

// #region Fields and capacity

test('chips, type and search', async (p) => {
    await analyse(p, true);
    await tab(p, 'Fields').first().click();
    for (const chip of ['Custom fields', 'Unmanaged', 'Required', 'Never used']) {
        await button(p, chip).click();
        const count = await rows(p).count();
        expect(count > 0 && count < 102, chip);
    }
    await button(p, 'All').click();
    await p.getByLabel('Field type', { exact: true }).selectOption('Money');
    expect(await rows(p).count() === 9, 'type');
    await p.getByLabel('Field type', { exact: true }).selectOption('');
    await p.getByPlaceholder('Search a field').fill('contoso_');
    expect(await rows(p).count() > 0, 'search');
    await p.getByPlaceholder('Search a field').fill("'[*]%");
    await p.getByText('No field matches these filters', { exact: false }).waitFor();
});

test('drill chip removed in one click', async (p) => {
    await analyse(p);
    await card(p, 'Field types').locator('.efa-bar').first().click();
    await button(p, 'Remove this filter').click();
    expect(await rows(p).count() === 102, 'filter kept');
});

test('all metadata columns, remembered', async (p) => {
    await analyse(p);
    await tab(p, 'Fields').first().click();
    const before = await p.locator('.efa-grid th').count();
    await p.getByRole('checkbox', { name: 'All metadata columns' }).check();
    expect(await p.locator('.efa-grid th').count() === before + 32, 'columns');
    expect(await p.evaluate(() => window.__mock.settings.settings.allColumns === true), 'not saved');
});

test('sort both ways, numbers as numbers', async (p) => {
    await analyse(p, true);
    await tab(p, 'Fields').first().click();
    const header = p.locator('.efa-grid th button', { hasText: 'Percentage Of Use' });
    const values = async () => (await rows(p).locator('td:nth-child(3)').allInnerTexts()).map(Number.parseFloat);
    await header.click();
    let list = await values();
    expect(list.every((v, i) => !i || v >= list[i - 1]), 'ascending');
    await header.click();
    list = await values();
    expect(list.every((v, i) => !i || v <= list[i - 1]), 'descending');
});

test('calculator', async (p) => {
    await analyse(p);
    await tab(p, 'Capacity').first().click();
    const inputs = p.locator('.efa-plan input');
    await p.getByText('Enter the number of fields you plan to create.').waitFor();
    await inputs.nth(0).fill('500');
    await p.getByText("It doesn't fit", { exact: false }).waitFor();
    await inputs.nth(0).fill('8');
    await inputs.nth(1).fill('15');
    await inputs.nth(2).fill('20');
    await p.getByText('It fits: 74 columns needed', { exact: false }).waitFor();
    await shot(p, 'capacity');
});

// #endregion

// #region Export, popups, language, theme

test('export with data usage', async (p) => {
    await analyse(p, true);
    const { file, zip, names } = await savedWorkbook(p, 'usage');
    expect(/^account_EntityKPIsExport_\d{4}-\d\d-\d\d\.xlsx$/.test(file.name), 'file name');
    expect(names.join() === 'account_MetaData,Dashboard,Summary,Recommendations,Data Usage,By Type,By Publisher,Lookups,Timeline', names.join());
    expect(Object.keys(zip).filter((k) => /charts\/chart\d+\.xml$/.test(k)).length === 11, 'charts');
    await button(p, 'OK').click();
});

test('export metadata only', async (p) => {
    await analyse(p);
    expect(!(await savedWorkbook(p, 'metadata')).names.includes('Data Usage'), 'usage sheet');
});

test('export of an empty table', async (p) => {
    await analyse(p, true, 'contoso_empty');
    await savedWorkbook(p, 'empty');
});

test('export in French', async (p) => {
    await analyse(p, true);
    await button(p, 'Export to Excel').waitFor();
    await button(p, 'English').click();
    await p.getByRole('menuitemradio', { name: 'Français' }).click();
    await button(p, 'Exporter vers Excel').click();
    await dialog(p, 'Export terminé');
    const data = await p.evaluate(() => window.__mock.files.at(-1).data);
    if (workbooks) fs.writeFileSync(path.join(workbooks, 'french.xlsx'), Uint8Array.from(data));
});

test('export cancelled', async (p) => {
    await analyse(p);
    await mock(p, { cancelSave: true });
    await button(p, 'Export to Excel').click();
    await idle(p);
    await p.waitForTimeout(300);
    expect(await p.getByRole('dialog').count() === 0, 'popup after cancel');
});

test('export: file locked', async (p) => {
    await analyse(p);
    await mock(p, { saveFails: true });
    await button(p, 'Export to Excel').click();
    await dialog(p, 'EBUSY: the file is open in Excel');
});

test('help, with no link', async (p) => {
    await button(p, 'Help').click();
    await dialog(p, 'read-only');
    expect(await p.getByRole('dialog').locator('a').count() === 0, 'link in help');
    await button(p, 'Close').click();
});

test('one external link only: the author', async (p) => {
    await button(p, 'Hamza AMRAOUI').click();
    expect((await p.evaluate(() => window.__mock.opened)).includes('linkedin.com/in/hamza-amraoui'), 'author link');
    expect(await p.locator('a[href]').count() === 0, 'other link');
    expect(await p.getByText(/Donate|PayPal/).count() === 0, 'donation in the tool');
});

test('French everywhere, saved', async (p) => {
    await analyse(p, true);
    await button(p, 'English').click();
    await p.getByRole('menuitemradio', { name: 'Français' }).click();
    await p.getByText('Champs créés dans le temps').waitFor();
    expect(await p.evaluate(() => window.__mock.settings.settings.language === 'fr'), 'not saved');
    await shot(p, 'overview-fr');
});

test('saved settings are restored', async (p) => {
    await p.getByRole('button', { name: 'Charger les entités' }).waitFor();
}, { init: { settings: { settings: { language: 'fr' } } } });

test('dark theme at start', async (p) => {
    await analyse(p, true);
    expect(await p.evaluate(() => document.documentElement.dataset.efaTheme === 'dark'), 'theme');
    await shot(p, 'overview-dark');
    await tab(p, 'Data usage').first().click();
    await shot(p, 'data-usage-dark');
    await tab(p, 'Capacity').first().click();
    await shot(p, 'capacity-dark');
}, { init: { theme: 'dark' } });

test('theme change', async (p) => {
    await p.evaluate(() => window.__mock.setTheme('dark'));
    await p.waitForFunction(() => document.documentElement.dataset.efaTheme === 'dark');
});

for (const width of [1920, 1440, 1280, 1024, 800, 600]) {
    for (const language of ['en', 'fr']) {
        test(`no button off the edge: ${width} ${language}`, async (p) => {
            const load = language === 'fr' ? 'Charger les entités' : 'Get Entities';
            await button(p, load).click();
            await option(p, 'account').dblclick();
            await p.locator('.efa-tiles').waitFor();
            const pages = await p.getByRole('tab').count();
            for (let n = 0; n < pages; n++) {
                await p.getByRole('tab').nth(n).click();
                const off = await p.evaluate(() => {
                    const bad = [];
                    for (const e of document.querySelectorAll('button, input, select, .efa-card')) {
                        if (e.closest('.efa-grid-wrapper')) continue;
                        const box = e.getBoundingClientRect();
                        if (box.width && (box.right > document.documentElement.clientWidth - 3 || box.left < 0)) bad.push(e.className || e.tagName);
                    }
                    const run = document.querySelector('.efa-analyse').getBoundingClientRect();
                    const panel = document.querySelector('.efa-entities').getBoundingClientRect();
                    if (run.bottom > panel.bottom - 5) bad.push('Analyse cut');
                    return bad;
                });
                expect(!off.length, `tab ${n}: ${off.slice(0, 5).join(', ')}`);
                if (n === 0 && language === 'fr') await shot(p, `width-${width}`);
            }
        }, { width, init: { settings: { settings: { language } } } });
    }
}

// #endregion

(async () => {
    execSync('npm run build', { cwd: root, stdio: 'pipe' });
    for (const folder of [shots, workbooks]) if (folder) fs.mkdirSync(folder, { recursive: true });
    const browser = await chromium.launch({ executablePath: findBrowser(), headless: true, args: ['--allow-file-access-from-files'] });
    let failed = 0;
    for (const { name, body, options } of tests) {
        const context = await browser.newContext({ viewport: { width: options.width ?? 1440, height: 940 }, locale: 'en-US' });
        context.setDefaultTimeout(15000);
        const page = await context.newPage();
        const problems = [];
        page.on('pageerror', (error) => problems.push(error.message));
        page.on('console', (message) => message.type() === 'error' && problems.push(message.text()));
        await page.addInitScript((init) => (window.__mockInit = init), options.init ?? {});
        await page.addInitScript({ path: path.join(__dirname, 'mockHost.js') });
        await page.addInitScript((csp) => {
            document.addEventListener('securitypolicyviolation', (e) => window.__mock.violations.push(`CSP ${e.violatedDirective}`));
            new MutationObserver((_records, observer) => {
                if (!document.head) return;
                const meta = document.createElement('meta');
                meta.httpEquiv = 'Content-Security-Policy';
                meta.content = csp;
                document.head.prepend(meta);
                observer.disconnect();
            }).observe(document, { childList: true, subtree: true });
        }, Csp);
        try {
            await page.goto(pathToFileURL(path.join(root, 'dist', 'index.html')).href);
            await page.locator('.efa-header').waitFor();
            await body(page);
            const violations = await page.evaluate(() => window.__mock.violations);
            expect(!violations.length, `violation: ${violations[0]}`);
            // Tests of an error path expect the error to be logged.
            expect(options.errors || !problems.length, `console: ${problems[0]}`);
            console.log(`PASS ${name}`);
        } catch (error) {
            failed++;
            console.log(`FAIL ${name}: ${String(error.message).split('\n').slice(0, 6).join(' | ')}`);
        }
        await context.close();
    }
    await browser.close();
    console.log(`${tests.length - failed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
