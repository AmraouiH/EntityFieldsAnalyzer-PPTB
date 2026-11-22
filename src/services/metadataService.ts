import { ExtraColumns, type EntityFilter, type EntitySummary, type Field, type Value } from '../models/types';
import { getJson, isTooLarge, stoppable, StoppedError, type DvRecord } from './dataverse';

const label = (value: any): string => value?.UserLocalizedLabel?.Label ?? '';
const day = (value: unknown): string | null => {
    const text = typeof value === 'string' ? value.substring(0, 10) : '';
    // Dataverse returns 0001-01-01 or 1900-01-01 when it has no date.
    return text > '1900-01-01' ? text : null;
};

export async function loadEntities(signal: AbortSignal): Promise<EntitySummary[]> {
    const select = 'LogicalName,DisplayName,EntitySetName,PrimaryIdAttribute,CreatedOn,IsCustomEntity,IsManaged';
    const response = await stoppable(getJson(`EntityDefinitions?$select=${select}`), signal);
    return ((response.value ?? []) as DvRecord[])
        .map((e) => ({
            logicalName: e.LogicalName,
            displayName: label(e.DisplayName),
            entitySetName: e.EntitySetName ?? '',
            primaryId: e.PrimaryIdAttribute ?? '',
            createdOn: day(e.CreatedOn),
            isCustom: e.IsCustomEntity === true,
            isManaged: e.IsManaged === true,
        }))
        .sort((a, b) => a.logicalName.localeCompare(b.logicalName, 'en'));
}

/** Same four filters as the XrmToolBox version. */
export function matchesFilter(entity: EntitySummary, filter: EntityFilter): boolean {
    if (filter === 'custom') return entity.isCustom;
    if (filter === 'standard') return !entity.isCustom;
    if (filter === 'system') return entity.isManaged;
    return true;
}

/** Same rule as FilterAttributes in the XrmToolBox version. */
export const isAnalysed = (a: DvRecord): boolean =>
    !a.AttributeOf && !!a.AttributeType && a.AttributeType !== 'Virtual' && a.AttributeType !== 'PartyList' && a.IsValidForRead === true && !a.LogicalName.includes('composite');

export function toField(a: DvRecord): Field {
    const extra = {} as Field['extra'];
    for (const name of ExtraColumns) {
        // Managed properties come as { Value, CanBeChanged, ManagedPropertyLogicalName }.
        const raw = a[name] !== null && typeof a[name] === 'object' ? a[name].Value : a[name];
        extra[name] = (raw ?? null) as Value;
    }
    return {
        name: a.LogicalName,
        displayName: label(a.DisplayName),
        description: label(a.Description),
        type: a.AttributeType,
        target: ((a.Targets ?? []) as string[]).join(', '),
        managed: a.IsManaged === true,
        custom: a.IsCustomAttribute === true,
        auditable: a.IsAuditEnabled?.Value === true,
        searchable: a.IsValidForAdvancedFind?.Value === true,
        requiredLevel: a.RequiredLevel?.Value ?? 'None',
        secured: a.IsSecured === true,
        key: a.IsPrimaryId === true || a.IsPrimaryName === true,
        deprecatedVersion: a.DeprecatedVersion ?? '',
        introducedVersion: a.IntroducedVersion ?? '',
        createdOn: day(a.CreatedOn),
        modifiedOn: day(a.ModifiedOn),
        extra,
        filled: 0,
        usage: 0,
    };
}

/** RetrieveEntity with RetrieveAsIfPublished, like the XrmToolBox version; published metadata when it is refused. */
export async function loadFields(logicalName: string, signal: AbortSignal): Promise<{ fields: Field[]; includesUnpublished: boolean }> {
    const name = logicalName.replace(/'/g, "''");
    let attributes: DvRecord[];
    let includesUnpublished = true;
    try {
        const path =
            'RetrieveEntity(EntityFilters=@p1,LogicalName=@p2,MetadataId=@p3,RetrieveAsIfPublished=@p4)' +
            `?@p1=Microsoft.Dynamics.CRM.EntityFilters'Attributes'&@p2='${name}'&@p3=00000000-0000-0000-0000-000000000000&@p4=true`;
        const response = await stoppable(getJson(path), signal);
        attributes = response.EntityMetadata?.Attributes;
        if (!Array.isArray(attributes)) throw new Error('RetrieveEntity returned no attribute.');
    } catch (error) {
        if (error instanceof StoppedError || isTooLarge(error)) throw error;
        console.warn('Entity Fields Analyzer: RetrieveEntity failed, reading the published metadata', error);
        const response = await stoppable(getJson(`EntityDefinitions(LogicalName='${name}')/Attributes`), signal);
        attributes = response.value ?? [];
        includesUnpublished = false;
    }
    const fields = attributes.filter(isAnalysed).map(toField);
    return { fields: fields.sort((a, b) => (a.name < b.name ? -1 : 1)), includesUnpublished };
}
