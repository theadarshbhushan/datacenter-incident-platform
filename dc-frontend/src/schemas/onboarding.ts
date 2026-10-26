import { z } from 'zod';
import { emailField } from './auth';

export const orgStepSchema = z.object({
  name: z.string().trim().min(2, 'Enter your organization name').max(100),
  size: z.string().min(1, 'Choose a company size'),
  industry: z.string().min(1, 'Choose an industry or use case'),
});

export const infraStepSchema = z.object({
  dataCenterName: z.string().trim().min(2, 'Name your data center').max(60),
  environmentName: z.string().trim().min(2, 'Name the environment').max(40),
  serverCount: z.coerce.number({ invalid_type_error: 'Enter a number' }).int('Whole numbers only').min(1, 'At least 1 server').max(100000, 'Contact us for fleets above 100,000'),
  environmentType: z.enum(['cloud', 'on-premises', 'hybrid']),
});

export const inviteRowSchema = z.object({ email: emailField, role: z.enum(['admin', 'engineer', 'viewer']) });
