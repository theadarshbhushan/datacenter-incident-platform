import { Link } from 'react-router-dom';
import { cn } from '@/utils/cn';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-7 w-7', className)} aria-hidden>
      <path fill="#16834A" d="M16 1.5 28.6 8.75v14.5L16 30.5 3.4 23.25V8.75z" />
      <path fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" d="m10.5 16.5 3.8 3.8 7.2-8.3" />
    </svg>
  );
}

export function Logo({ to = '/', className, light }: { to?: string; className?: string; light?: boolean }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', light ? 'text-white' : 'text-ink', className)} aria-label="VaultWatch home">
      <LogoMark />
      <span className="text-[17px]">VaultWatch</span>
    </Link>
  );
}
