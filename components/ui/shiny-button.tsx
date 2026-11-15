"use client";

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import './shiny-button.css';

type ShinyButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export function ShinyButton({ children, className, type = 'button', ...props }: ShinyButtonProps) {
  return <button type={type} className={cn('shiny-cta', className)} {...props}>
    <span className="shiny-cta-content">{children}</span>
  </button>;
}
