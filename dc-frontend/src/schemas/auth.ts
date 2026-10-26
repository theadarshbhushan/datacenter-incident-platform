import { z } from 'zod';

export const emailField = z.string().trim().min(1, 'Email is required').max(254, 'Email is too long').email('Enter a valid email address');

/** Matches the backend password policy (dc-backend/app/core/passwords.py). */
export const newPasswordField = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters')
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v), 'Include upper and lower case letters')
  .refine((v) => /\d/.test(v), 'Include at least one number');

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required'),
  remember: z.boolean(),
});
export type LoginValues = z.infer<typeof loginSchema>;

const nameField = z.string().trim().min(2, 'Enter your full name').max(80, 'Name is too long');

export const signupSchema = z
  .object({
    name: nameField,
    email: emailField,
    company: z.string().trim().min(2, 'Enter your company or organization').max(100, 'Name is too long'),
    password: newPasswordField,
    confirm: z.string().min(1, 'Confirm your password'),
    accept: z.boolean().refine((v) => v, 'You must accept the Terms and Privacy Policy'),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });
export type SignupValues = z.infer<typeof signupSchema>;

export const forgotSchema = z.object({ email: emailField });

export const resetSchema = z
  .object({ password: newPasswordField, confirm: z.string().min(1, 'Confirm your password') })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export const acceptInviteSchema = z
  .object({ name: nameField, password: newPasswordField, confirm: z.string().min(1, 'Confirm your password') })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export const changePasswordSchema = z
  .object({ current: z.string().min(1, 'Enter your current password'), next: newPasswordField, confirm: z.string().min(1, 'Confirm your new password') })
  .refine((v) => v.next === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
  .refine((v) => v.next !== v.current, { path: ['next'], message: 'Choose a password different from your current one' });

export const profileSchema = z.object({
  name: nameField,
  jobTitle: z.string().trim().max(80, 'Too long').optional().or(z.literal('')),
});
