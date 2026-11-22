import type { EntitySummary, Field } from '../models/types';
import { escapeXml, getJson, isTooLarge, pagingCookie, stoppable, type DvRecord } from './dataverse';

const MaxPageSize = 5000;
const ProbeSize = 20;
/** Aimed size of a page: well under the 16 MB limit of the ToolBox, as rows are not all alike. */
const TargetPageBytes = 5 * 1024 * 1024;

export function pageSizeFor(bytes: number, rows: number): number {
    if (rows <= 0) return MaxPageSize;
    return Math.max(1, Math.min(MaxPageSize, Math.floor(TargetPageBytes / Math.max(1, bytes / rows))));
}

function pagePath(entity: EntitySummary, count: number, page: number, cookie?: string): string {
    const paging = cookie ? ` paging-cookie="${escapeXml(cookie)}"` : '';
    const order = entity.primaryId ? `<order attribute="${escapeXml(entity.primaryId)}"/>` : '';
    const xml = `<fetch no-lock="true" count="${count}" page="${page}"${paging}><entity name="${escapeXml(entity.logicalName)}"><all-attributes/>${order}</entity></fetch>`;
    return `${entity.entitySetName}?fetchXml=${encodeURIComponent(xml)}`;
}

/**
 * Reads every record and counts the filled fields. Records are never kept, only the counters.
 * A probe sizes the pages; when one is still too large the scan starts again with smaller pages
 * (a paging cookie is only valid for the page size it was created with).
 */
export async function scanUsage(
    entity: EntitySummary,
    fields: Field[],
    signal: AbortSignal,
    onProgress: (records: number) => void,
): Promise<{ records: number; filled: number[] }> {
    if (!entity.entitySetName) throw new Error(`${entity.logicalName}: this table can't be read through the Web API.`);
    const read = (path: string) => stoppable(getJson<DvRecord>(path), signal);

    let size: number;
    try {
        const probe = await read(pagePath(entity, ProbeSize, 1));
        const rows: DvRecord[] = probe.value ?? [];
        size = pageSizeFor(new Blob([JSON.stringify(rows)]).size, rows.length);
    } catch (error) {
        if (!isTooLarge(error)) throw error;
        size = 5;
    }

    // Lookups are returned as _name_value by the Web API.
    const keys = fields.map((f) => [f.name, `_${f.name}_value`]);
    for (;;) {
        const filled = new Array<number>(fields.length).fill(0);
        let records = 0;
        let cookie: string | undefined;
        try {
            for (let page = 1; ; page++) {
                const response = await read(pagePath(entity, size, page, cookie));
                const rows: DvRecord[] = response.value ?? [];
                for (const row of rows) {
                    for (let i = 0; i < keys.length; i++) {
                        // false, 0 and "" are values: only null and absent are empty.
                        if ((row[keys[i][0]] ?? row[keys[i][1]] ?? null) !== null) filled[i]++;
                    }
                }
                records += rows.length;
                onProgress(records);
                const annotation: string | undefined = response['@Microsoft.Dynamics.CRM.fetchxmlpagingcookie'];
                const more = response['@Microsoft.Dynamics.CRM.morerecords'] ?? !!annotation;
                if (String(more) !== 'true') return { records, filled };
                // An empty page followed by "more" would loop for ever: never report partial figures as complete.
                if (rows.length === 0) throw new Error('Dataverse returned an empty page before the end of the table.');
                cookie = pagingCookie(annotation);
            }
        } catch (error) {
            if (!isTooLarge(error) || size === 1) throw error;
            size = Math.max(1, Math.floor(size / 3));
        }
    }
}
