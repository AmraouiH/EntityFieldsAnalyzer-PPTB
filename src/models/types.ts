export const ColumnLimit = 1024;
/** A field filled in less than this percentage of the records is rarely used. */
export const LowUsage = 5;

export type Mode = 'metadata' | 'usage';
export type EntityFilter = 'all' | 'custom' | 'standard' | 'system';

export interface EntitySummary {
    logicalName: string;
    displayName: string;
    entitySetName: string;
    primaryId: string;
    createdOn: string | null;
    isCustom: boolean;
    isManaged: boolean;
}

/** Metadata shown as is, in the order of the XrmToolBox grid and export. */
export const ExtraColumns = [
    'AttributeOf', 'AutoNumberFormat', 'CanBeSecuredForCreate', 'CanBeSecuredForRead', 'CanBeSecuredForUpdate',
    'CanModifyAdditionalSettings', 'ColumnNumber', 'DeprecatedVersion', 'ExternalName', 'InheritsFrom', 'IsCustomizable',
    'IsDataSourceSecret', 'IsFilterable', 'IsGlobalFilterEnabled', 'IsLogical', 'IsPrimaryId', 'IsPrimaryName', 'IsRenameable',
    'IsRequiredForForm', 'IsRetrievable', 'IsSecured', 'IsSortableEnabled', 'IsValidForAdvancedFind', 'IsValidForCreate',
    'IsValidForForm', 'IsValidForGrid', 'IsValidForRead', 'IsValidForUpdate', 'IsValidODataAttribute', 'LinkedAttributeId',
    'EntityLogicalName', 'SourceType',
] as const;

export type Value = string | number | boolean | null;

export interface Field {
    name: string;
    /** Empty when the field has no label in the language of the user. */
    displayName: string;
    description: string;
    type: string;
    target: string;
    managed: boolean;
    custom: boolean;
    auditable: boolean;
    searchable: boolean;
    requiredLevel: string;
    secured: boolean;
    /** Primary id or primary name. */
    key: boolean;
    deprecatedVersion: string;
    introducedVersion: string;
    /** yyyy-mm-dd, UTC. */
    createdOn: string | null;
    modifiedOn: string | null;
    extra: Record<(typeof ExtraColumns)[number], Value>;
    filled: number;
    /** 0 to 100. */
    usage: number;
}

export interface Analysis {
    entity: EntitySummary;
    mode: Mode;
    fields: Field[];
    records: number;
    analysedAt: Date;
    /** False when only the published metadata could be read. */
    includesUnpublished: boolean;
}

export interface PluginSettings {
    language: 'en' | 'fr';
    filter: EntityFilter;
    allColumns: boolean;
}

export const defaultSettings: PluginSettings = { language: 'en', filter: 'all', allColumns: false };
