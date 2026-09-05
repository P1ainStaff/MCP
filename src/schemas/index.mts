import { z } from 'zod';
import { MCP_BOOKING_MAX_DAYS, MCP_DEFAULT_PAGE_LIMIT, MCP_MAX_PAGE_LIMIT, MCP_SEARCH_MAX_IDS } from '../types.mjs';

export const pagingSchema = z.object({
  cursor: z.string().optional().describe('Opaque pagination cursor from a previous response'),
  limit: z.number().int().min(1).max(MCP_MAX_PAGE_LIMIT).optional().default(MCP_DEFAULT_PAGE_LIMIT),
});

export const dateRangeFields = {
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use yyyy-MM-dd'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use yyyy-MM-dd'),
};

export const dateRangeSchema = z.object(dateRangeFields).superRefine((val, ctx) => {
  const from = new Date(val.from);
  const to = new Date(val.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid date' });
    return;
  }
  if (to < from) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '`to` must be on or after `from`' });
  }
  const days = Math.ceil((to.getTime() - from.getTime()) / 86_400_000) + 1;
  if (days > MCP_BOOKING_MAX_DAYS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Date range must not exceed ${MCP_BOOKING_MAX_DAYS} days`,
    });
  }
});

export const complianceCheckPeriodSchema = z
  .object({
    ...dateRangeFields,
    employee_id: z.string().optional(),
    jurisdiction: z.string().optional().default('DE'),
  })
  .superRefine((val, ctx) => {
    const from = new Date(val.from);
    const to = new Date(val.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid date' });
      return;
    }
    if (to < from) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '`to` must be on or after `from`' });
    }
  });

export const writeConfirmSchema = z.object({
  dry_run: z.boolean().optional().default(true),
  confirm_token: z.string().optional(),
  idempotency_key: z.string().min(8).max(128).optional(),
});

export const searchSchema = z.object({
  query: z.string().min(1).max(200).describe('Substring to match against master-data name fields'),
  types: z
    .array(z.enum(['employee', 'team', 'project', 'customer', 'article']))
    .optional()
    .describe('Restrict search to entity types'),
});

export const fetchSchema = z.object({
  id: z.string().min(1).describe('ID returned by search'),
});

export const timeGetBookingsSchema = dateRangeSchema.and(
  pagingSchema.extend({
    employee_id: z.string().optional(),
    team_id: z.string().optional(),
  })
);

export const timeGetBalanceSchema = z.object({
  employee_id: z.string().optional(),
  as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const timeBookSchema = writeConfirmSchema.extend({
  employee_id: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().optional(),
  end: z.string().optional(),
  duration_minutes: z.number().int().positive().optional(),
  reason_id: z.string().optional(),
  note: z.string().max(2000).optional(),
});

export const timeCorrectBookingSchema = writeConfirmSchema.extend({
  booking_id: z.string().min(1),
  employee_id: z.string().optional(),
  correction_note: z.string().min(1).max(2000),
  new_start: z.string().optional(),
  new_end: z.string().optional(),
  new_duration_minutes: z.number().int().optional(),
  dry_run: z.boolean().optional().default(true),
});

export const timeGetAbsencesSchema = dateRangeSchema.and(
  pagingSchema.extend({
    employee_id: z.string().optional(),
    team_id: z.string().optional(),
  })
);

export const timeRequestAbsenceSchema = writeConfirmSchema.extend({
  employee_id: z.string().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason_id: z.string().min(1),
  note: z.string().max(2000).optional(),
});

export const timeGetOpenApprovalsSchema = pagingSchema.extend({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export const timeApproveSchema = writeConfirmSchema.extend({
  approval_id: z.string().min(1),
  decision: z.enum(['approve', 'reject']),
  comment: z.string().max(2000).optional(),
  dry_run: z.boolean().optional().default(true),
});

export const projectListSchema = pagingSchema.extend({
  status: z.string().optional(),
  customer_id: z.string().optional(),
  query: z.string().optional(),
});

export const projectGetBalanceSchema = z.object({
  project_id: z.string().min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const projectGetBookingsSchema = dateRangeSchema.and(
  pagingSchema.extend({
    project_id: z.string().min(1),
    employee_id: z.string().optional(),
  })
);

export const projectBookTimeSchema = writeConfirmSchema.extend({
  project_id: z.string().min(1),
  task_id: z.string().optional(),
  employee_id: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  duration_minutes: z.number().int().positive(),
  note: z.string().max(2000).optional(),
});

export const projectGetBillingStatusSchema = z.object({
  project_id: z.string().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const employeeListSchema = pagingSchema.extend({
  team_id: z.string().optional(),
  active_only: z.boolean().optional().default(true),
});

export const employeeGetSchema = z.object({
  employee_id: z.string().min(1),
});

export const teamListSchema = pagingSchema;
export const customerListSchema = pagingSchema.extend({ query: z.string().optional() });
export const articleListSchema = pagingSchema.extend({ query: z.string().optional() });
export const modelListSchema = pagingSchema;

export const regionGetHolidaysSchema = z.object({
  region_id: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
});

export const reportListConfigurationsSchema = pagingSchema;
export const reportRunSchema = z.object({
  configuration_id: z.string().min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  parameters: z.record(z.unknown()).optional(),
});

export const shiftGetPlanSchema = dateRangeSchema.and(
  pagingSchema.extend({
    location_id: z.string().optional(),
    employee_id: z.string().optional(),
  })
);

export const shiftGetAvailabilitySchema = dateRangeSchema.and(
  pagingSchema.extend({
    employee_id: z.string().optional(),
  })
);

/** Field-name contract map used by Zod↔Yup drift tests (AD-8). */
export const YUP_CONTRACT_MAP: Record<string, { yupSchemaName: string; requiredFields: string[] }> = {
  'plainstaff.time_get_bookings': { yupSchemaName: 'BookingsGetV2', requiredFields: ['from', 'to'] },
  'plainstaff.time_book': { yupSchemaName: 'BookingsPostV2', requiredFields: ['date'] },
  'plainstaff.project_list': { yupSchemaName: 'ProjectsGetV2', requiredFields: [] },
  'plainstaff.project_get_bookings': { yupSchemaName: 'ProjectbookingsGetV2', requiredFields: ['from', 'to', 'project_id'] },
  'plainstaff.project_book_time': { yupSchemaName: 'ProjectbookingsPostV2', requiredFields: ['project_id', 'date', 'duration_minutes'] },
  'plainstaff.employee_list': { yupSchemaName: 'EmployeesGetV2', requiredFields: [] },
  'plainstaff.employee_get': { yupSchemaName: 'EmployeesGetV2', requiredFields: ['employee_id'] },
  'plainstaff.team_list': { yupSchemaName: 'TeamsGetV2', requiredFields: [] },
  'plainstaff.customer_list': { yupSchemaName: 'CustomersGetV2', requiredFields: [] },
  'plainstaff.article_list': { yupSchemaName: 'ArticlesGetV2', requiredFields: [] },
  'plainstaff.model_list': { yupSchemaName: 'ModelsGetV2', requiredFields: [] },
  'plainstaff.region_get_holidays': { yupSchemaName: 'HolidaysGetV2', requiredFields: ['region_id', 'year'] },
  'plainstaff.project_get_billing_status': { yupSchemaName: 'BillingstatusGetV2', requiredFields: [] },
};

export { MCP_SEARCH_MAX_IDS };
