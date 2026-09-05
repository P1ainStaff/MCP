import type { ToolDefinition } from '../types.mjs';
import { McpToolError } from '../runtime/errors.mjs';
import { hashParams } from '../runtime/audit.mjs';
import {
  articleListSchema,
  customerListSchema,
  employeeGetSchema,
  employeeListSchema,
  fetchSchema,
  modelListSchema,
  projectBookTimeSchema,
  projectGetBillingStatusSchema,
  projectGetBookingsSchema,
  projectGetBalanceSchema,
  projectListSchema,
  regionGetHolidaysSchema,
  searchSchema,
  teamListSchema,
  timeApproveSchema,
  timeBookSchema,
  timeCorrectBookingSchema,
  timeGetAbsencesSchema,
  timeGetBalanceSchema,
  timeGetBookingsSchema,
  timeGetOpenApprovalsSchema,
  timeRequestAbsenceSchema,
  reportListConfigurationsSchema,
  reportRunSchema,
  shiftGetPlanSchema,
  shiftGetAvailabilitySchema,
  complianceCheckPeriodSchema,
} from '../schemas/index.mjs';

async function withWriteConfirm(
  toolName: string,
  args: Record<string, unknown>,
  ctx: Parameters<ToolDefinition['handler']>[1],
  execute: () => Promise<unknown>
): Promise<unknown> {
  const dryRun = args.dry_run !== false;
  const paramsHash = hashParams({ ...args, dry_run: undefined, confirm_token: undefined });

  if (dryRun) {
    const preview = await execute();
    const confirm_token = await ctx.bridge.issueConfirmToken({
      tenant: ctx.auth.tenant,
      sub: ctx.auth.sub,
      toolName,
      paramsHash,
    });
    return {
      dry_run: true,
      preview,
      confirm_token,
      confirm_ttl_seconds: 300,
      message:
        'This is a dry-run preview. Re-call with dry_run=false and the confirm_token to commit.',
    };
  }

  const token = String(args.confirm_token ?? '');
  if (!token) {
    throw new McpToolError('confirm_required', 'confirm_token is required when dry_run=false');
  }
  const ok = await ctx.bridge.consumeConfirmToken(token, {
    tenant: ctx.auth.tenant,
    sub: ctx.auth.sub,
    toolName,
    paramsHash,
  });
  if (!ok) {
    throw new McpToolError(
      'confirm_required',
      'Invalid or expired confirm_token. Run dry_run=true again to obtain a fresh token.'
    );
  }
  return execute();
}

export const searchTools: ToolDefinition[] = [
  {
    name: 'search',
    description: {
      en: 'Search PlainStaff master data (employees, teams, projects, customers, articles) by name substring. Does NOT search bookings or free-text notes. Returns up to 50 IDs for use with fetch.',
      de: 'Durchsucht Stammdaten (Mitarbeiter, Teams, Projekte, Kunden, Artikel) per Namens-Substring. Keine Buchungs- oder Freitextsuche. Liefert max. 50 IDs für fetch.',
    },
    scope: 'employees:read',
    inputSchema: searchSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    rateBucket: 'read',
    since: '1.0.0',
    handler: async (args, ctx) => ctx.bridge.searchMasterData(args, ctx.auth),
  },
  {
    name: 'fetch',
    description: {
      en: 'Fetch a full master-data record by ID previously returned from search.',
      de: 'Lädt einen vollständigen Stammdaten-Datensatz anhand einer search-ID.',
    },
    scope: 'employees:read',
    inputSchema: fetchSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    rateBucket: 'read',
    since: '1.0.0',
    handler: async (args, ctx) => ctx.bridge.fetchMasterData(args, ctx.auth),
  },
];

export const timeTools: ToolDefinition[] = [
  {
    name: 'plainstaff.time_get_bookings',
    description: {
      en: 'List time bookings for a required date range (max 366 days), optionally filtered by employee or team.',
      de: 'Listet Zeitbuchungen für einen Pflicht-Zeitraum (max. 366 Tage), optional nach Mitarbeiter/Team gefiltert.',
    },
    scope: 'time:read',
    inputSchema: timeGetBookingsSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    rateBucket: 'read',
    since: '1.0.0',
    handler: async (args, ctx) => ctx.bridge.timeGetBookings(args, ctx.auth),
  },
  {
    name: 'plainstaff.time_get_balance',
    description: {
      en: 'Get time account balance: overtime, vacation, sick leave, special leave.',
      de: 'Zeitkonto: Saldo, Urlaub, Krank, Sonderurlaub.',
    },
    scope: 'time:read',
    inputSchema: timeGetBalanceSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    rateBucket: 'read',
    since: '1.0.0',
    handler: async (args, ctx) => ctx.bridge.timeGetBalance(args, ctx.auth),
  },
  {
    name: 'plainstaff.time_book',
    description: {
      en: 'Create a time booking. Defaults to dry_run=true; set dry_run=false with confirm_token to commit.',
      de: 'Zeitbuchung anlegen. Standard dry_run=true; mit confirm_token und dry_run=false buchen.',
    },
    scope: 'time:write',
    inputSchema: timeBookSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    rateBucket: 'write',
    since: '1.0.0',
    handler: async (args, ctx) =>
      withWriteConfirm('plainstaff.time_book', args, ctx, () => ctx.bridge.timeBook(args, ctx.auth)),
  },
  {
    name: 'plainstaff.time_correct_booking',
    description: {
      en: 'Correct an existing booking (destructive). Requires dry_run preview + confirm_token.',
      de: 'Korrekturbuchung (destruktiv). Erfordert dry_run-Vorschau und confirm_token.',
    },
    scope: 'time:write',
    inputSchema: timeCorrectBookingSchema,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    rateBucket: 'write',
    since: '1.0.0',
    handler: async (args, ctx) =>
      withWriteConfirm('plainstaff.time_correct_booking', args, ctx, () =>
        ctx.bridge.timeCorrectBooking(args, ctx.auth)
      ),
  },
  {
    name: 'plainstaff.time_get_absences',
    description: {
      en: 'List absences including reasons for a date range.',
      de: 'Abwesenheiten inkl. Gründe im Zeitraum.',
    },
    scope: 'time:read',
    inputSchema: timeGetAbsencesSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    rateBucket: 'read',
    since: '1.0.0',
    handler: async (args, ctx) => ctx.bridge.timeGetAbsences(args, ctx.auth),
  },
  {
    name: 'plainstaff.time_request_absence',
    description: {
      en: 'Submit a leave/absence request.',
      de: 'Urlaubs-/Abwesenheitsantrag stellen.',
    },
    scope: 'time:write',
    inputSchema: timeRequestAbsenceSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    rateBucket: 'write',
    since: '1.0.0',
    handler: async (args, ctx) =>
      withWriteConfirm('plainstaff.time_request_absence', args, ctx, () =>
        ctx.bridge.timeRequestAbsence(args, ctx.auth)
      ),
  },
  {
    name: 'plainstaff.time_get_open_approvals',
    description: {
      en: 'List open approvals for the calling user.',
      de: 'Offene Genehmigungen des aufrufenden Users.',
    },
    scope: 'time:read',
    inputSchema: timeGetOpenApprovalsSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    rateBucket: 'read',
    since: '1.0.0',
    handler: async (args, ctx) => ctx.bridge.timeGetOpenApprovals(args, ctx.auth),
  },
  {
    name: 'plainstaff.time_approve',
    description: {
      en: 'Approve or reject an open approval (destructive).',
      de: 'Genehmigung annehmen oder ablehnen (destruktiv).',
    },
    scope: 'approvals:write',
    inputSchema: timeApproveSchema,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    rateBucket: 'write',
    since: '1.0.0',
    handler: async (args, ctx) =>
      withWriteConfirm('plainstaff.time_approve', args, ctx, () => ctx.bridge.timeApprove(args, ctx.auth)),
  },
];

export const projectTools: ToolDefinition[] = [
  {
    name: 'plainstaff.project_list',
    description: {
      en: 'List projects including status and customer.',
      de: 'Projekte inkl. Status und Kunde auflisten.',
    },
    scope: 'projects:read',
    inputSchema: projectListSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    rateBucket: 'read',
    since: '1.0.0',
    handler: async (args, ctx) => ctx.bridge.projectList(args, ctx.auth),
  },
  {
    name: 'plainstaff.project_get_balance',
    description: {
      en: 'Project planned vs actual hours and budget utilization.',
      de: 'Projekt Soll/Ist und Budgetauslastung.',
    },
    scope: 'projects:read',
    inputSchema: projectGetBalanceSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    rateBucket: 'read',
    since: '1.0.0',
    handler: async (args, ctx) => ctx.bridge.projectGetBalance(args, ctx.auth),
  },
  {
    name: 'plainstaff.project_get_bookings',
    description: {
      en: 'Project time bookings in a required date range.',
      de: 'Projektbuchungen im Pflicht-Zeitraum.',
    },
    scope: 'projects:read',
    inputSchema: projectGetBookingsSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    rateBucket: 'read',
    since: '1.0.0',
    handler: async (args, ctx) => ctx.bridge.projectGetBookings(args, ctx.auth),
  },
  {
    name: 'plainstaff.project_book_time',
    description: {
      en: 'Book time against a project.',
      de: 'Projektzeit buchen.',
    },
    scope: 'projects:write',
    inputSchema: projectBookTimeSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    rateBucket: 'write',
    since: '1.0.0',
    handler: async (args, ctx) =>
      withWriteConfirm('plainstaff.project_book_time', args, ctx, () =>
        ctx.bridge.projectBookTime(args, ctx.auth)
      ),
  },
  {
    name: 'plainstaff.project_get_billing_status',
    description: {
      en: 'Get billing/invoicing status for projects.',
      de: 'Abrechnungsstatus von Projekten.',
    },
    scope: 'projects:read',
    inputSchema: projectGetBillingStatusSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    rateBucket: 'read',
    since: '1.0.0',
    handler: async (args, ctx) => ctx.bridge.projectGetBillingStatus(args, ctx.auth),
  },
];

export const masterdataTools: ToolDefinition[] = [
  {
    name: 'plainstaff.employee_list',
    description: {
      en: 'List employees (RBAC-filtered: non-admins only see themselves).',
      de: 'Mitarbeiterliste (RBAC: ohne Admin nur eigener Datensatz).',
    },
    scope: 'employees:read',
    inputSchema: employeeListSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    rateBucket: 'read',
    since: '1.0.0',
    handler: async (args, ctx) => ctx.bridge.employeeList(args, ctx.auth),
  },
  {
    name: 'plainstaff.employee_get',
    description: {
      en: 'Get one employee including model, team, and regions.',
      de: 'Einzelner Mitarbeiter inkl. Modell/Team/Regionen.',
    },
    scope: 'employees:read',
    inputSchema: employeeGetSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    rateBucket: 'read',
    since: '1.0.0',
    handler: async (args, ctx) => ctx.bridge.employeeGet(args, ctx.auth),
  },
  {
    name: 'plainstaff.team_list',
    description: { en: 'List teams.', de: 'Teams auflisten.' },
    scope: 'employees:read',
    inputSchema: teamListSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    rateBucket: 'read',
    since: '1.0.0',
    handler: async (args, ctx) => ctx.bridge.teamList(args, ctx.auth),
  },
  {
    name: 'plainstaff.customer_list',
    description: { en: 'List customers.', de: 'Kunden auflisten.' },
    scope: 'projects:read',
    inputSchema: customerListSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    rateBucket: 'read',
    since: '1.0.0',
    handler: async (args, ctx) => ctx.bridge.customerList(args, ctx.auth),
  },
  {
    name: 'plainstaff.article_list',
    description: { en: 'List articles/services.', de: 'Artikel/Leistungen auflisten.' },
    scope: 'projects:read',
    inputSchema: articleListSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    rateBucket: 'read',
    since: '1.0.0',
    handler: async (args, ctx) => ctx.bridge.articleList(args, ctx.auth),
  },
  {
    name: 'plainstaff.model_list',
    description: { en: 'List working-time models.', de: 'Arbeitszeitmodelle auflisten.' },
    scope: 'employees:read',
    inputSchema: modelListSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    rateBucket: 'read',
    since: '1.0.0',
    handler: async (args, ctx) => ctx.bridge.modelList(args, ctx.auth),
  },
  {
    name: 'plainstaff.region_get_holidays',
    description: {
      en: 'Public holidays for a region and year.',
      de: 'Feiertage einer Region für ein Jahr.',
    },
    scope: 'employees:read',
    inputSchema: regionGetHolidaysSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    rateBucket: 'read',
    since: '1.0.0',
    handler: async (args, ctx) => ctx.bridge.regionGetHolidays(args, ctx.auth),
  },
];

export const reportTools: ToolDefinition[] = [
  {
    name: 'plainstaff.report_list_configurations',
    description: {
      en: 'List available report configurations.',
      de: 'Verfügbare Report-Konfigurationen.',
    },
    scope: 'reports:read',
    inputSchema: reportListConfigurationsSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    rateBucket: 'read',
    since: '1.0.0',
    handler: async (args, ctx) => ctx.bridge.reportListConfigurations(args, ctx.auth),
  },
  {
    name: 'plainstaff.report_run',
    description: {
      en: 'Start a report job asynchronously. Returns job_id; poll via report status — does not block.',
      de: 'Report asynchron starten. Liefert job_id; kein Blocking des Tool-Calls.',
    },
    scope: 'reports:read',
    inputSchema: reportRunSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false },
    rateBucket: 'report',
    since: '1.0.0',
    handler: async (args, ctx) => ctx.bridge.reportRun(args, ctx.auth),
  },
];

export const shiftTools: ToolDefinition[] = [
  {
    name: 'plainstaff.shift_get_plan',
    description: {
      en: 'Get shift plan for a date range.',
      de: 'Schichtplan im Zeitraum.',
    },
    scope: 'time:read',
    inputSchema: shiftGetPlanSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    rateBucket: 'read',
    since: '1.0.0',
    handler: async (args, ctx) => ctx.bridge.shiftGetPlan(args, ctx.auth),
  },
  {
    name: 'plainstaff.shift_get_availability',
    description: {
      en: 'Get shift availability / wishes for a date range.',
      de: 'Verfügbarkeiten/Wünsche im Zeitraum.',
    },
    scope: 'time:read',
    inputSchema: shiftGetAvailabilitySchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    rateBucket: 'read',
    since: '1.0.0',
    handler: async (args, ctx) => ctx.bridge.shiftGetAvailability(args, ctx.auth),
  },
];

export const complianceTools: ToolDefinition[] = [
  {
    name: 'plainstaff.compliance_check_period',
    description: {
      en: 'Technical working-time compliance hints (breaks/rest) for a period. NOT legal advice — cites rule sources in the result.',
      de: 'Technische Hinweise zur Arbeitszeit-Compliance (Pausen) im Zeitraum. KEINE Rechtsberatung — Regelquellen werden im Ergebnis genannt.',
    },
    scope: 'time:read',
    inputSchema: complianceCheckPeriodSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    rateBucket: 'read',
    since: '1.0.0',
    handler: async (args, ctx) => ctx.bridge.complianceCheckPeriod(args, ctx.auth),
  },
];

export const allToolDefinitions: ToolDefinition[] = [
  ...searchTools,
  ...timeTools,
  ...projectTools,
  ...masterdataTools,
  ...reportTools,
  ...shiftTools,
  ...complianceTools,
];
