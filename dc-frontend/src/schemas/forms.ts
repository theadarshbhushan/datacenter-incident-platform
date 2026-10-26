import { z } from 'zod';
import { emailField } from './auth';

export const contactSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email: emailField,
  company: z.string().trim().min(2, 'Enter your company').max(100),
  subject: z.string().min(1, 'Choose a subject'),
  message: z.string().trim().min(20, 'Tell us a little more (at least 20 characters)').max(4000, 'Keep it under 4000 characters'),
});
export type ContactValues = z.infer<typeof contactSchema>;

export const incidentSchema = z.object({
  title: z.string().trim().min(5, 'Use at least 5 characters').max(120, 'Keep the title under 120 characters'),
  description: z.string().trim().min(10, 'Describe the impact (at least 10 characters)').max(2000),
  severity: z.enum(['critical', 'major', 'minor']),
  category: z.enum(['thermal', 'power', 'network', 'hardware', 'storage', 'software', 'capacity']),
  rackId: z.string().min(1, 'Choose the affected rack'),
  serverIds: z.array(z.string()),
  assigneeId: z.string(),
});
export type IncidentValues = z.infer<typeof incidentSchema>;

export const inviteSchema = z.object({
  email: emailField,
  role: z.enum(['owner', 'admin', 'engineer', 'viewer']),
});

export const alertRuleSchema = z.object({
  name: z.string().trim().min(2, 'Name the rule').max(60),
  metric: z.enum(['cpu', 'memory', 'temperature', 'power', 'latency', 'storage']),
  operator: z.enum(['>', '<']),
  threshold: z.coerce.number({ invalid_type_error: 'Enter a number' }).min(0, 'Must be 0 or more').max(10000),
  durationMin: z.coerce.number({ invalid_type_error: 'Enter a number' }).int('Whole minutes only').min(1, 'At least 1 minute').max(1440),
  severity: z.enum(['critical', 'warning', 'info']),
});
