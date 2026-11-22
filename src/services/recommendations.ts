import { ColumnLimit, LowUsage, type Analysis, type Field } from '../models/types';
import { isRequired, weightOf, type Insights } from './insights';

export type Severity = 'High' | 'Medium' | 'Low' | 'Info';
export const Severities: Severity[] = ['High', 'Medium', 'Low', 'Info'];

export const Categories = {
    capacity: 'Capacity',
    noRecord: 'Data usage',
    securedEmpty: 'Security',
    unused: 'Unused field',
    low: 'Low usage',
    quality: 'Data quality',
    deprecated: 'Deprecated',
    noName: 'Documentation',
    noDescription: 'Documentation',
    unmanaged: 'ALM',
    secured: 'Security',
};

export type Rule = keyof typeof Categories;

export interface Finding {
    severity: Severity;
    rule: Rule;
    field?: Field;
    records: number;
    used: number;
    weight: number;
}

/** Rule-based findings of the Recommendations sheet (port of AnalysisSheets.BuildFindings). */
export function buildFindings(analysis: Analysis, insights: Insights): Finding[] {
    const { records } = analysis;
    const found: Finding[] = [];
    const add = (severity: Severity, rule: Rule, field?: Field) =>
        found.push({ severity, rule, field, records, used: insights.used, weight: field ? weightOf(field.type) : 0 });
    const usage = insights.hasUsage && records > 0;
    const capacity = (insights.used * 100) / ColumnLimit;

    if (capacity >= 75) add(capacity >= 90 ? 'High' : 'Medium', 'capacity');
    if (insights.hasUsage && records === 0) add('Info', 'noRecord');

    for (const f of analysis.fields) {
        if (usage && f.custom && !f.key) {
            // A secured field reads as empty without the profile: it must never be proposed for deletion.
            if (f.usage <= 0) add(f.secured ? 'Info' : 'High', f.secured ? 'securedEmpty' : 'unused', f);
            else if (f.usage < LowUsage) add('Medium', 'low', f);
        }
        if (usage && !f.key && !f.secured && isRequired(f) && f.usage < 100) add('Medium', 'quality', f);
        if (f.deprecatedVersion) add('Medium', 'deprecated', f);
        if (f.custom && !f.displayName) add('Low', 'noName', f);
        if (f.custom && !f.description.trim()) add('Low', 'noDescription', f);
        if (f.custom && !f.managed) add('Info', 'unmanaged', f);
        if (f.secured) add('Info', 'secured', f);
    }
    return found.sort(
        (a, b) =>
            Severities.indexOf(a.severity) - Severities.indexOf(b.severity) ||
            Categories[a.rule].localeCompare(Categories[b.rule], 'en') ||
            (a.field?.name ?? '').localeCompare(b.field?.name ?? '', 'en'),
    );
}
