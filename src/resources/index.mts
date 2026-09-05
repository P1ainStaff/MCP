import type { ResourceDefinition } from '../types.mjs';

export const mcpResources: ResourceDefinition[] = [
  {
    uri: 'plainstaff://schema/entities',
    name: 'PlainStaff entity overview',
    description: {
      en: 'High-level data model: employees, teams, projects, bookings, absences, shifts, reports.',
      de: 'Datenmodell-Übersicht: Mitarbeiter, Teams, Projekte, Buchungen, Abwesenheiten, Schichten, Reports.',
    },
    mimeType: 'application/json',
    read: async () =>
      JSON.stringify(
        {
          entities: [
            { id: 'employee', fields: ['id', 'name', 'teamId', 'modelId', 'regions'] },
            { id: 'team', fields: ['id', 'name'] },
            { id: 'project', fields: ['id', 'name', 'customerId', 'status'] },
            { id: 'customer', fields: ['id', 'name'] },
            { id: 'article', fields: ['id', 'name'] },
            { id: 'timeBooking', fields: ['id', 'employeeId', 'date', 'start', 'end', 'reasonId'] },
            { id: 'projectBooking', fields: ['id', 'projectId', 'employeeId', 'date', 'durationMinutes'] },
            { id: 'absence', fields: ['id', 'employeeId', 'from', 'to', 'reasonId'] },
            { id: 'shift', fields: ['id', 'employeeId', 'locationId', 'start', 'end'] },
            { id: 'reportConfiguration', fields: ['id', 'name', 'type'] },
          ],
        },
        null,
        2
      ),
  },
  {
    uri: 'plainstaff://config/tenant',
    name: 'Tenant configuration summary',
    description: {
      en: 'Working-time models, absence reasons, and regions for the authenticated tenant.',
      de: 'Arbeitszeitmodelle, Gründe und Regionen des Mandanten.',
    },
    mimeType: 'application/json',
    read: async (ctx) =>
      JSON.stringify(
        {
          tenant: ctx.auth.tenant,
          region: ctx.auth.region,
          note: 'Detailed models/reasons are available via model_list and related tools.',
          scopes: ctx.auth.scopes,
        },
        null,
        2
      ),
  },
  {
    uri: 'plainstaff://docs/api',
    name: 'Public API short docs',
    description: {
      en: 'Short pointer to the public REST API OpenAPI documentation.',
      de: 'Kurzverweis auf die öffentliche REST-API OpenAPI-Dokumentation.',
    },
    mimeType: 'text/markdown',
    read: async () =>
      [
        '# PlainStaff Public API',
        '',
        'OpenAPI: https://plainstaff.com/swagger_public_api_en.yaml',
        'Feature page: https://plainstaff.com/en/features/public-api/',
        'MCP docs: https://plainstaff.com/en/developers/mcp/',
        '',
        'MCP tools map to domain services with OAuth scopes; they are task-oriented, not a 1:1 CRUD mirror of every REST endpoint.',
      ].join('\n'),
  },
];
