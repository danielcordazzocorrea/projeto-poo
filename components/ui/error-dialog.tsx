import { useEffect, useId, useRef } from 'react';
import { CircleAlert, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import type { Theme } from '@/lib/theme';
import './error-dialog.css';

export type ErrorDialogProps = {
  open: boolean;
  title: string;
  description: string;
  theme?: Theme;
  variant?: 'error' | 'warning';
  icon?: LucideIcon;
  details?: ReadonlyArray<{ label: string; value: string }>;
  actionLabel?: string;
  /** The owner must set open to false. Called for Escape and both buttons. */
  onClose: () => void;
  /** Runs after closing, so the owner can focus a field or navigate. */
  onAction?: () => void;
};

/** Presentation only: callers choose the message and recovery action. */
export function ErrorDialog({
  open, title, description, theme = 'dark', variant = 'error', icon,
  details = [], actionLabel = 'Entendi', onClose, onAction,
}: ErrorDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const Icon = icon ?? (variant === 'warning' ? TriangleAlert : CircleAlert);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => { if (dialog.open) dialog.close(); };
  }, [open]);

  function dismiss() {
    // Native close restores focus before a recovery action selects its target.
    dialogRef.current?.close();
    onClose();
  }

  return <dialog
    ref={dialogRef}
    className="error-dialog"
    data-theme={theme}
    data-variant={variant}
    role="alertdialog"
    aria-labelledby={titleId}
    aria-describedby={descriptionId}
    onCancel={event => { event.preventDefault(); dismiss(); }}
  >
    <div className="error-dialog-content">
      <div className="error-dialog-heading">
        <span className="error-dialog-icon"><Icon size={30} strokeWidth={1.8} aria-hidden="true" /></span>
        <button type="button" className="error-dialog-close" aria-label="Fechar aviso" onClick={dismiss}>
          <X size={22} aria-hidden="true" />
        </button>
      </div>
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId} className="error-dialog-description">{description}</p>
      {details.length > 0 && <dl className="error-dialog-details">
        {details.map((detail, index) => <div key={`${detail.label}-${index}`}>
          <dt>{detail.label}</dt><dd>{detail.value}</dd>
        </div>)}
      </dl>}
      <button type="button" className="error-dialog-action" autoFocus onClick={() => { dismiss(); onAction?.(); }}>
        {actionLabel}
      </button>
    </div>
  </dialog>;
}
