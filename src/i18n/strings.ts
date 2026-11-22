import { ColumnLimit, LowUsage, type EntityFilter, type Mode } from '../models/types';
import { Categories, type Finding, type Severity } from '../services/recommendations';

export type Language = 'en' | 'fr';

export const AppTitle = 'Entity Fields Analyzer';
export const AuthorName = 'Hamza AMRAOUI';

/** Every user-facing text of the tool, in English and French. */
function build(fr: boolean) {
    const T = (english: string, french: string) => (fr ? french : english);
    const locale = fr ? 'fr-FR' : 'en-US';
    const numbers = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    const N = (value: number) => numbers.format(value);
    const P = (percent: number, digits = 0) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: digits }).format(percent / 100);
    const month = new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit', timeZone: 'UTC' });

    const labels: Record<string, string> = {
        standard: T('Standard', 'Standard'),
        customManaged: T('Custom · managed', 'Personnalisé · géré'),
        customUnmanaged: T('Custom · unmanaged', 'Personnalisé · non géré'),
        standardUnmanaged: T('Standard · unmanaged', 'Standard · non géré'),
        audit: T('Auditing enabled', 'Audit activé'),
        find: T('In Advanced Find', 'Recherche avancée'),
        required: T('Required', 'Obligatoire'),
        secured: T('Field security', 'Sécurité de champ'),
        others: T('Other prefixes', 'Autres préfixes'),
    };

    const categories: Record<string, string> = {
        Capacity: T('Capacity', 'Capacité'),
        'Data usage': T('Data usage', 'Utilisation des données'),
        'Unused field': T('Unused field', 'Champ inutilisé'),
        'Low usage': T('Low usage', 'Peu utilisé'),
        'Data quality': T('Data quality', 'Qualité des données'),
        Deprecated: T('Deprecated', 'Obsolète'),
        Documentation: 'Documentation',
        ALM: 'ALM',
        Security: T('Security', 'Sécurité'),
    };

    /** Issue and recommendation of a finding. */
    function finding(f: Finding): [string, string] {
        const filled = f.field?.filled ?? 0;
        switch (f.rule) {
            case 'capacity':
                return [
                    T(`${P((f.used * 100) / ColumnLimit, 1)} of the column capacity is used (${f.used} / ${ColumnLimit} columns).`, `${P((f.used * 100) / ColumnLimit, 1)} de la capacité est utilisée (${f.used} / ${ColumnLimit} colonnes).`),
                    T('Few fields can still be created on this table: remove unused fields before adding new ones (see the Capacity tab of the tool).', "Peu de champs peuvent encore être créés : supprimez les champs inutilisés avant d'en ajouter (voir l'onglet Capacité de l'outil)."),
                ];
            case 'noRecord':
                return [
                    T("The table has no record that you can read: fill rates can't be computed.", "La table n'a aucun enregistrement lisible : les taux de remplissage ne peuvent pas être calculés."),
                    T('Run the analysis on an environment that contains representative data.', "Lancez l'analyse sur un environnement qui contient des données représentatives."),
                ];
            case 'securedEmpty':
                return [
                    T('Reads as empty, but is protected by column-level security.', 'Lu comme vide, mais protégé par la sécurité au niveau des colonnes.'),
                    T("Don't delete it on this basis: check again with an account that can read this field.", 'Ne le supprimez pas sur cette base : revérifiez avec un compte qui peut lire ce champ.'),
                ];
            case 'unused':
                return [
                    T(`Never filled in any of the ${N(f.records)} records read.`, `Vide dans les ${N(f.records)} enregistrements lus.`),
                    T(`Check forms, views, processes, plugins and integrations, then consider deleting it to free ${f.weight} column(s).`, `Vérifiez formulaires, vues, processus, plugins et intégrations, puis envisagez de le supprimer pour libérer ${f.weight} colonne(s).`),
                ];
            case 'low':
                return [
                    T(`Filled in only ${N(filled)} of ${N(f.records)} records.`, `Rempli dans seulement ${N(filled)} enregistrements sur ${N(f.records)}.`),
                    T('Confirm the business still needs it; otherwise remove it or merge it with another field.', 'Confirmez le besoin métier, sinon supprimez-le ou fusionnez-le avec un autre champ.'),
                ];
            case 'quality': {
                const system = f.field?.requiredLevel === 'SystemRequired';
                const level = system ? T('System required', 'Requis par le système') : T('Business required', "Requis par l'entreprise");
                const empty = N(f.records - filled);
                return [
                    T(`${level} but empty in ${empty} of ${N(f.records)} records.`, `${level} mais vide dans ${empty} enregistrements sur ${N(f.records)}.`),
                    T('Backfill the missing values, or review the requirement level (imports, integrations and records created before the rule bypass it).', 'Complétez les valeurs manquantes ou revoyez le niveau requis (imports, intégrations et enregistrements antérieurs le contournent).'),
                ];
            }
            case 'deprecated':
                return [
                    T(`Deprecated since version ${f.field?.deprecatedVersion}.`, `Obsolète depuis la version ${f.field?.deprecatedVersion}.`),
                    T('Stop using this field in new customizations and integrations.', "N'utilisez plus ce champ dans les nouveaux développements et intégrations."),
                ];
            case 'noName':
                return [
                    T('No display name in the user language.', "Aucun nom d'affichage dans la langue de l'utilisateur."),
                    T('Add a display name (and its translations) so users and makers can identify the field.', "Ajoutez un nom d'affichage (et ses traductions) pour identifier le champ."),
                ];
            case 'noDescription':
                return [
                    T('No description.', 'Aucune description.'),
                    T('Describe the purpose of the field: it is shown as a tooltip on forms and helps the next makers.', 'Décrivez le rôle du champ : la description est affichée en info-bulle et aide les prochains intervenants.'),
                ];
            case 'unmanaged':
                return [
                    T('Custom field in the unmanaged layer.', 'Champ personnalisé dans la couche non gérée.'),
                    T('Make sure it belongs to a solution and reaches test / production through a managed solution.', "Assurez-vous qu'il appartient à une solution et arrive en recette / production par une solution gérée."),
                ];
            case 'secured':
                return [
                    T('Protected by column-level security.', 'Protégé par la sécurité au niveau des colonnes.'),
                    T('Check that the field security profiles grant access to the right teams.', "Vérifiez que les profils de sécurité donnent l'accès aux bonnes équipes."),
                ];
        }
    }

    const modes: Record<Mode, string> = { metadata: T('Metadata only', 'Métadonnées seules'), usage: T('Metadata + Data usage', 'Métadonnées + Utilisation des données') };
    const filters: Record<EntityFilter, string> = {
        all: T('All entities', 'Toutes les entités'),
        custom: T('Custom entities', 'Entités personnalisées'),
        standard: T('CRM entities', 'Entités CRM'),
        system: T('System entities (managed)', 'Entités système (gérées)'),
    };
    const severities: Record<Severity, string> = { High: T('High', 'Haute'), Medium: T('Medium', 'Moyenne'), Low: T('Low', 'Faible'), Info: 'Info' };

    return {
        locale,
        N,
        P,
        label: (key: string) => labels[key] ?? key,
        period: (key: string) => (key.length === 7 ? month.format(new Date(`${key}-01`)) : key),
        modes,
        filters,
        severities,
        category: (rule: Finding['rule']) => categories[Categories[rule]],
        finding,
        yes: T('Yes', 'Oui'),
        no: T('No', 'Non'),
        ok: 'OK',
        close: T('Close', 'Fermer'),

        // Header
        appSubtitle: T('Types, origin, data usage and column capacity of your entities', 'Types, origine, utilisation et capacité en colonnes de vos entités'),
        connectedTo: (name: string) => T(`Connected to ${name}`, `Connecté à ${name}`),
        notConnected: T('Not connected', 'Non connecté'),
        getEntities: T('Get Entities', 'Charger les entités'),
        getEntitiesTip: T('Lists the entities of the connected environment. Nothing is read before this click.', "Liste les entités de l'environnement connecté. Rien n'est lu avant ce clic."),
        exportExcel: T('Export to Excel', 'Exporter vers Excel'),
        languageMenu: T('Language', 'Langue'),
        help: T('Help', 'Aide'),
        authorTip: T('Developed by Hamza AMRAOUI (LinkedIn)', 'Développé par Hamza AMRAOUI (LinkedIn)'),

        // Entities
        entities: T('Entities', 'Entités'),
        entitiesHint: T('double-click to analyse', 'double-clic pour analyser'),
        entityFilter: T('Entity filter', "Filtre d'entités"),
        searchEntity: T('Search by display or schema name', 'Rechercher par nom affiché ou technique'),
        entitiesEmpty: T('Click “Get Entities” to list your entities.', 'Cliquez sur « Charger les entités » pour les lister.'),
        entitiesNone: T('No entity matches your search.', 'Aucune entité ne correspond à votre recherche.'),
        analysisMode: T('Analysis mode', "Mode d'analyse"),
        usageWarning: T('Reads every record: it can take a while on large tables.', 'Lit tous les enregistrements : cela peut être long sur les grosses tables.'),
        analyse: (name: string) => T(`Analyse ${name}`, `Analyser ${name}`),

        // Welcome
        guideTitle: T('Get started in 3 steps', 'Démarrez en 3 étapes'),
        steps: [
            [T('Load the entities', 'Chargez les entités'), T('Click “Get Entities”, then narrow the list with the filter: all, custom, CRM or system entities.', 'Cliquez sur « Charger les entités », puis filtrez la liste : toutes, personnalisées, CRM ou système.')],
            [T('Choose an entity', 'Choisissez une entité'), T('Click an entity in the list. Use the search box to find it by display or schema name.', 'Cliquez sur une entité de la liste. La recherche accepte le nom affiché ou technique.')],
            [T('Run the analysis', "Lancez l'analyse"), T('“Metadata only” is fast. “Metadata + Data usage” also reads the records to measure how often each field is filled.', '« Métadonnées seules » est rapide. « Métadonnées + Utilisation des données » lit aussi les enregistrements pour mesurer le remplissage de chaque champ.')],
        ],
        done: T('Done', 'Terminé'),
        next: T('Next step', 'Étape suivante'),
        featuresTitle: T('What you will find after the analysis', "Ce que vous trouverez après l'analyse"),
        features: [
            [T('Overview', "Vue d'ensemble"), T('Key figures, field types, origin, publishers and creation timeline.', 'Chiffres clés, types de champs, origine, éditeurs et chronologie de création.')],
            [T('Fields', 'Champs'), T('Every field with its metadata. Click any chart to open the matching fields here.', 'Chaque champ avec ses métadonnées. Cliquez sur un graphique pour y ouvrir les champs correspondants.')],
            [T('Data usage', 'Utilisation'), T('How often each field is filled, fields never used and clean-up candidates.', 'Le remplissage de chaque champ, les champs jamais utilisés et ceux à nettoyer.')],
            [T('Capacity', 'Capacité'), T('The budget of 1,024 physical columns, what consumes it, and a calculator to plan new fields.', 'Le budget de 1 024 colonnes physiques, ce qui le consomme et un calculateur pour prévoir de nouveaux champs.')],
        ],

        // Context
        analysedAt: (time: Date) => T('analysed at ', 'analysé à ') + time.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
        recordsBadge: (n: number) => T(`${N(n)} records`, `${N(n)} enregistrements`),
        switchHint: (name: string) => T(`${name} selected · click Analyse to switch`, `${name} sélectionné · cliquez sur Analyser pour changer`),
        publishedOnly: T('Only published metadata could be read: unpublished changes are not included.', 'Seules les métadonnées publiées ont pu être lues : les modifications non publiées ne sont pas incluses.'),

        // Tabs
        overview: T('Overview', "Vue d'ensemble"),
        fields: T('Fields', 'Champs'),
        usage: T('Data usage', 'Utilisation'),
        capacity: T('Capacity', 'Capacité'),
        unusedBadge: (n: number) => T(`${N(n)} unused`, `${N(n)} inutilisés`),
        notRun: T('not run', 'non analysé'),

        // Overview
        openList: T('open the list', 'ouvrir la liste'),
        customFields: T('Custom fields', 'Champs personnalisés'),
        ofFields: (p: number) => T(`${P(p)} of fields`, `${P(p)} des champs`),
        unmanagedFields: T('Unmanaged fields', 'Champs non gérés'),
        managedCount: (n: number) => T(`${N(n)} managed`, `${N(n)} gérés`),
        capacityUsed: T('Column capacity used', 'Capacité utilisée'),
        columnsLeft: (n: number) => T(`${N(n)} columns left`, `${N(n)} colonnes restantes`),
        fieldTypes: T('Field types', 'Types de champs'),
        typesHint: (n: number) => T(`${n} types · click a bar to list them`, `${n} types · cliquez pour les lister`),
        origin: T('Origin', 'Origine'),
        originHint: T('standard / custom, managed / unmanaged', 'standard / personnalisé, géré / non géré'),
        fieldSettings: T('Field settings', 'Paramètres des champs'),
        settingsHint: T('% of fields', '% des champs'),
        publishers: T('Publishers', 'Éditeurs'),
        publishersHint: T('custom fields by prefix', 'champs personnalisés par préfixe'),
        timeline: T('Fields created over time', 'Champs créés dans le temps'),
        granularity: (byMonth: boolean) => (byMonth ? T('per month', 'par mois') : T('per year', 'par an')),
        timelineHint: T('click a column to list the fields', 'cliquez sur une colonne pour lister les champs'),
        custom: T('Custom', 'Personnalisé'),
        standard: 'Standard',
        noField: T('No field.', 'Aucun champ.'),
        noCustom: T('No custom field on this entity.', 'Aucun champ personnalisé sur cette entité.'),
        noDate: T('No creation date available for these fields.', 'Aucune date de création disponible pour ces champs.'),

        // Fields
        all: T('All', 'Tous'),
        unmanaged: T('Unmanaged', 'Non gérés'),
        required: T('Required', 'Obligatoires'),
        neverUsed: T('Never used', 'Jamais utilisés'),
        allTypes: T('All types', 'Tous les types'),
        fieldType: T('Field type', 'Type de champ'),
        searchField: T('Search a field', 'Rechercher un champ'),
        allColumns: T('All metadata columns', 'Toutes les métadonnées'),
        fieldsCount: (shown: number, total: number) => (shown === total ? T(`${N(total)} fields`, `${N(total)} champs`) : T(`${N(shown)} of ${N(total)} fields`, `${N(shown)} champs sur ${N(total)}`)),
        fieldsNone: T('No field matches these filters. Remove a filter above to see more fields.', 'Aucun champ ne correspond à ces filtres. Retirez un filtre pour en voir plus.'),
        removeFilter: T('Remove this filter', 'Retirer ce filtre'),
        drill: {
            type: T('Type', 'Type'),
            origin: T('Origin', 'Origine'),
            prefix: T('Prefix', 'Préfixe'),
            created: T('Created', 'Créés'),
            fill: T('Fill rate', 'Remplissage'),
            field: T('Field', 'Champ'),
        },
        columns: {
            displayName: T('Display Name', "Nom d'affichage"),
            schemaName: T('Schema Name', 'Nom technique'),
            percent: T('Percentage Of Use', "Pourcentage d'utilisation"),
            filled: T('Filled Records', 'Enregistrements remplis'),
            type: 'Type',
            description: 'Description',
            target: T('Target', 'Cible'),
            managed: T('Managed/Unmanaged', 'Géré/Non géré'),
            custom: T('IsCustom', 'Personnalisé'),
            auditable: T('IsAuditable', 'Auditable'),
            searchable: T('IsSearchable', 'Recherchable'),
            required: T('Required Level', 'Niveau requis'),
            version: T('Introduced Version', "Version d'introduction"),
            created: T('CreatedOn', 'Créé le'),
            modified: T('ModifiedOn', 'Modifié le'),
        },
        managedValue: (managed: boolean) => (managed ? T('Managed', 'Géré') : T('Unmanaged', 'Non géré')),

        // Data usage
        recordsAnalysed: T('Records analysed', 'Enregistrements analysés'),
        recordsRead: T('records read', 'enregistrements lus'),
        neverUsedFields: T('Never used fields', 'Champs jamais utilisés'),
        rarelyUsed: T(`Rarely used (< ${LowUsage}%)`, `Peu utilisés (< ${LowUsage} %)`),
        rarelyCaption: T(`filled in < ${LowUsage}% of records`, `remplis dans < ${LowUsage} %`),
        averageFill: T('Average fill rate', 'Remplissage moyen'),
        perField: T('per field', 'par champ'),
        distribution: T('Fill rate distribution', 'Répartition du remplissage'),
        distributionHint: T('number of fields per fill rate', 'nombre de champs par taux'),
        fillByType: T('Fill rate by type', 'Remplissage par type'),
        fillByTypeHint: T('average % of records filled', "% moyen d'enregistrements remplis"),
        leastUsed: T('Least used custom fields', 'Champs personnalisés les moins utilisés'),
        leastUsedHint: T('lowest fill rates: clean-up candidates', 'plus faibles taux : candidats au nettoyage'),
        visibility: T('Only what your account can read is counted: records you cannot see are left out, and secured fields you cannot read look empty. Check before deleting a field.', "Seul ce que votre compte peut lire est compté : les enregistrements invisibles sont exclus et les champs sécurisés illisibles paraissent vides. Vérifiez avant de supprimer un champ."),
        noRecords: T("No record could be read: fill rates can't be computed.", "Aucun enregistrement n'a pu être lu : les taux de remplissage ne peuvent pas être calculés."),
        usageEmpty: T('Data usage was not analysed', "L'utilisation des données n'a pas été analysée"),
        usageEmptyText: T('This analysis read the metadata only. Run it again with data usage to measure how often each field is filled and find fields that are never used. It reads every record of the entity, so it can take a while on large tables.', "Cette analyse n'a lu que les métadonnées. Relancez-la avec l'utilisation des données pour mesurer le remplissage de chaque champ et trouver ceux jamais utilisés. Tous les enregistrements de l'entité sont lus : cela peut être long sur les grosses tables."),
        rerun: T('Analyse with data usage', "Analyser avec l'utilisation des données"),

        // Capacity
        budget: T('Column budget', 'Budget de colonnes'),
        budgetHint: T('estimate of the physical columns consumed', 'estimation des colonnes physiques consommées'),
        budgetHeadline: (used: number, left: number) => T(`${N(used)} of ${N(ColumnLimit)} columns used (${P((used * 100) / ColumnLimit)})  ·  ${N(left)} available`, `${N(used)} colonnes utilisées sur ${N(ColumnLimit)} (${P((used * 100) / ColumnLimit)})  ·  ${N(left)} disponibles`),
        weightNames: {
            3: T('Lookups (×3)', 'Recherches (×3)'),
            2: T('Option set, money, boolean, status (×2)', "Groupe d'options, devise, booléen, statut (×2)"),
            1: T('Other types (×1)', 'Autres types (×1)'),
        },
        planned: T('Planned', 'Prévu'),
        availableLabel: T('Available', 'Disponible'),
        planTitle: T('Plan new fields', 'Prévoir de nouveaux champs'),
        planHint: T('the budget above updates live', 'le budget ci-dessus suit en direct'),
        rule: T('Each lookup uses 3 physical columns, each option set, money, boolean or status field uses 2, any other type uses 1. An entity is limited to 1,024 columns.', "Chaque recherche utilise 3 colonnes physiques, chaque groupe d'options, devise, booléen ou statut en utilise 2, tout autre type 1. Une entité est limitée à 1 024 colonnes."),
        planInputs: [T('Lookups', 'Recherches'), T('Option set, Money, Boolean, Status', "Groupe d'options, Devise, Booléen, Statut"), T('Other types', 'Autres types')],
        planEmpty: T('Enter the number of fields you plan to create.', 'Saisissez le nombre de champs à créer.'),
        planFits: (needed: number, left: number) => T(`It fits: ${N(needed)} columns needed, ${N(left)} left afterwards.`, `Ça passe : ${N(needed)} colonnes nécessaires, ${N(left)} restantes ensuite.`),
        planTooBig: (needed: number, left: number) => T(`It doesn't fit: ${N(needed)} columns needed, only ${N(left)} available.`, `Ça ne passe pas : ${N(needed)} colonnes nécessaires, ${N(left)} disponibles seulement.`),
        cost: T('What consumes the budget', 'Ce qui consomme le budget'),
        costHint: T('columns consumed per field type (fields × weight)', 'colonnes par type de champ (champs × poids)'),

        // Work
        loadingEntities: T('Retrieving entities…', 'Lecture des entités…'),
        analysing: (name: string) => T(`Analysing ${name}…`, `Analyse de ${name}…`),
        readingMetadata: T('Retrieving the metadata…', 'Lecture des métadonnées…'),
        readingRecords: (n: number) => T(`Reading the records… ${N(n)} read`, `Lecture des enregistrements… ${N(n)} lus`),
        exporting: T('Building the Excel report…', 'Création du rapport Excel…'),
        stop: T('Stop', 'Arrêter'),
        stopped: T('Stopped. No partial result was kept.', "Arrêté. Aucun résultat partiel n'a été conservé."),
        errorTitle: T('Something went wrong', 'Une erreur est survenue'),
        noConnectionTitle: T('No connection', 'Aucune connexion'),
        noConnection: T('Connect the tool to a Dataverse environment first.', "Connectez d'abord l'outil à un environnement Dataverse."),
        exportedTitle: T('Export completed', 'Export terminé'),
        exported: (path: string) => T(`The report was saved to:\n${path}`, `Le rapport a été enregistré ici :\n${path}`),

        // Help
        helpTitle: T('How to use Entity Fields Analyzer', 'Comment utiliser Entity Fields Analyzer'),
        helpSteps: [
            T('Click Get Entities. Nothing is read before that.', "Cliquez sur Charger les entités. Rien n'est lu avant."),
            T('Click an entity (double-click analyses it right away). The search works on the display and schema names.', "Cliquez sur une entité (un double-clic lance l'analyse). La recherche porte sur le nom affiché et technique."),
            T('Choose the mode: Metadata only, or Metadata + Data usage, which reads every record. Stop or Esc interrupts it.', "Choisissez le mode : Métadonnées seules, ou Métadonnées + Utilisation des données, qui lit tous les enregistrements. Arrêter ou Échap l'interrompt."),
            T('Click Analyse, then browse Overview, Fields, Data usage and Capacity.', "Cliquez sur Analyser, puis parcourez Vue d'ensemble, Champs, Utilisation et Capacité."),
            T('Click any bar, slice or tile to open the matching fields. The blue chip shows the active filter: click its × to remove it.', 'Cliquez sur une barre, une part ou une tuile pour ouvrir les champs correspondants. La pastille bleue montre le filtre actif : cliquez sur × pour le retirer.'),
            T('Highlighted rows are empty in every record your account can read.', 'Les lignes surlignées sont vides dans tous les enregistrements lisibles par votre compte.'),
            T('Export to Excel saves the full report, with dashboard and recommendations.', "Exporter vers Excel enregistre le rapport complet, avec tableau de bord et recommandations."),
        ],
        readOnly: T('The tool is read-only: it never changes your environment.', "L'outil est en lecture seule : il ne modifie jamais votre environnement."),

        // Excel
        xl: {
            metadata: T('_MetaData', '_Métadonnées'),
            dashboard: T('Dashboard', 'Tableau de bord'),
            summary: T('Summary', 'Synthèse'),
            recommendations: T('Recommendations', 'Recommandations'),
            usage: T('Data Usage', 'Utilisation'),
            byType: T('By Type', 'Par type'),
            byPublisher: T('By Publisher', 'Par éditeur'),
            lookups: T('Lookups', 'Recherches'),
            timeline: T('Timeline', 'Chronologie'),
            entityName: T('Entity Display Name', "Nom d'affichage de l'entité"),
            entitySchema: T('Entity Technical Name', "Nom technique de l'entité"),
            createdOn: T('Created on', 'Créée le'),
            numberFields: T('Number Of Fields', 'Nombre de champs'),
            numberRecords: T('Number Of Records', "Nombre d'enregistrements"),
            notAnalysed: T('Not analysed (metadata only)', 'Non analysé (métadonnées seules)'),
            columnsUsed: T('Estimated Columns Used', 'Colonnes utilisées (estimation)'),
            volume: T('Entity Fields Volume Usage', 'Capacité de champs utilisée'),
            mode: T('Analysis Mode', "Mode d'analyse"),
            exportedOn: T('Exported On', 'Exporté le'),
            environment: T('Environment', 'Environnement'),
            summaryTitle: T('Analysis summary', "Synthèse de l'analyse"),
            table: 'Table',
            standardFields: T('Standard fields', 'Champs standards'),
            ofWhichManaged: T('   of which managed', '   dont gérés'),
            ofWhichUnmanaged: T('   of which unmanaged', '   dont non gérés'),
            prefixes: T('Publisher prefixes', "Préfixes d'éditeurs"),
            lookupCount: T('Lookups (lookup, owner, customer)', 'Recherches (recherche, propriétaire, client)'),
            columnsAvailable: T('Columns available', 'Colonnes disponibles'),
            ruleLabel: T('Rule', 'Règle'),
            findings: T('Findings (details in Recommendations)', 'Constats (détails dans Recommandations)'),
            recommendationsHint: T('Rule-based findings, sorted by severity. Filter on severity or category, and double-check every field before deleting it.', 'Constats triés par sévérité. Filtrez par sévérité ou catégorie et vérifiez chaque champ avant de le supprimer.'),
            severity: T('Severity', 'Sévérité'),
            category: T('Category', 'Catégorie'),
            issue: T('Issue', 'Constat'),
            recommendation: T('Recommendation', 'Recommandation'),
            tableRow: '(table)',
            band: T('Fill rate band', 'Tranche de remplissage'),
            share: T('Share of fields', 'Part des champs'),
            fillRate: T('Fill rate', 'Taux de remplissage'),
            emptyRecords: T('Empty records', 'Enregistrements vides'),
            usageBand: T('Usage band', "Niveau d'utilisation"),
            bands: [T('Never used', 'Jamais utilisé'), T('Rarely used (< 5%)', 'Peu utilisé (< 5 %)'), T('Partially used (5-50%)', 'Partiellement utilisé (5-50 %)'), T('Mostly used (50-90%)', 'Souvent utilisé (50-90 %)'), T('Always used (>= 90%)', 'Toujours utilisé (>= 90 %)')],
            weight: T('Column weight', 'Poids en colonnes'),
            columns: T('Columns used', 'Colonnes utilisées'),
            capacityShare: T('Share of capacity', 'Part de la capacité'),
            prefix: T('Prefix', 'Préfixe'),
            noPrefix: T('(no prefix)', '(sans préfixe)'),
            managed: T('Managed', 'Gérés'),
            firstCreated: T('First created', 'Première création'),
            lastCreated: T('Last created', 'Dernière création'),
            period: T('Period', 'Période'),
            total: 'Total',
            cumulative: T('Cumulative total', 'Total cumulé'),
            nothing: T('Nothing to report.', 'Rien à signaler.'),
            chartData: T('Chart data', 'Données des graphiques'),
        },
    };
}

export type Strings = ReturnType<typeof build>;

const cache: Partial<Record<Language, Strings>> = {};
export const getStrings = (language: Language): Strings => (cache[language] ??= build(language === 'fr'));
