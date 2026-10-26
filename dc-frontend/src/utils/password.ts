export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  checks: { label: string; ok: boolean }[];
}

export function passwordStrength(pw: string): PasswordStrength {
  const checks = [
    { label: 'At least 10 characters', ok: pw.length >= 10 },
    { label: 'Upper and lower case letters', ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
    { label: 'At least one number', ok: /\d/.test(pw) },
    { label: 'At least one symbol', ok: /[^A-Za-z0-9]/.test(pw) },
  ];
  let score = checks.filter((c) => c.ok).length;
  if (pw.length < 8) score = Math.min(score, 1);
  const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
  return { score: score as PasswordStrength['score'], label: pw ? labels[score]! : '', checks };
}
