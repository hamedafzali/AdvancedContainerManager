import {
  ReactNode,
  ButtonHTMLAttributes,
  useEffect,
  useRef,
  useState,
} from "react";
import { Loader2, X, AlertCircle, MoreVertical } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-gray-900 hover:bg-gray-700 text-white dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white",
  secondary:
    "border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700",
  danger: "bg-red-600 hover:bg-red-700 text-white",
  ghost:
    "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700",
};

export function Button({
  variant = "secondary",
  loading = false,
  icon,
  children,
  className = "",
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* IconButton — compact per-row action                                 */
/* ------------------------------------------------------------------ */

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  loading?: boolean;
  tone?: "default" | "success" | "danger" | "info";
  children: ReactNode;
}

const TONE_CLASSES: Record<NonNullable<IconButtonProps["tone"]>, string> = {
  default:
    "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700",
  success: "text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30",
  danger: "text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30",
  info: "text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30",
};

export function IconButton({
  label,
  loading = false,
  tone = "default",
  children,
  className = "",
  disabled,
  ...rest
}: IconButtonProps) {
  return (
    <button
      title={label}
      aria-label={label}
      disabled={disabled || loading}
      className={`p-1.5 rounded-lg transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${TONE_CLASSES[tone]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 ${padded ? "p-6" : "overflow-hidden"} ${className}`}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PageHeader — one consistent compact page intro                      */
/* ------------------------------------------------------------------ */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl font-light text-gray-900 dark:text-gray-100 tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full ${wide ? "max-w-4xl" : "max-w-lg"} max-h-[85vh] flex flex-col`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            {title}
          </h3>
          <IconButton label="Close" onClick={onClose}>
            <X className="w-4 h-4" />
          </IconButton>
        </div>
        <div className="px-6 py-4 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ConfirmDialog                                                       */
/* ------------------------------------------------------------------ */

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  danger = true,
  requireText,
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  requireText?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  const blocked = requireText ? typed !== requireText : false;

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={blocked}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-gray-600 dark:text-gray-300 space-y-3">
        <div>{message}</div>
        {requireText && (
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Type <span className="font-mono font-semibold">{requireText}</span>{" "}
              to confirm
            </label>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-300"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* StatTile — clickable stat that acts as a filter/navigation           */
/* ------------------------------------------------------------------ */

export function StatTile({
  value,
  label,
  icon,
  active = false,
  onClick,
}: {
  value: ReactNode;
  label: string;
  icon?: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  const interactive = Boolean(onClick);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={`w-full text-left bg-white dark:bg-gray-800 rounded-2xl shadow-sm border p-5 transition-all duration-200 ${
        active
          ? "border-gray-900 dark:border-gray-300 ring-1 ring-gray-900 dark:ring-gray-300"
          : "border-gray-200 dark:border-gray-700"
      } ${interactive ? "hover:shadow-md cursor-pointer" : "cursor-default"}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-light text-gray-900 dark:text-gray-100">
            {value}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
        </div>
        {icon}
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* ErrorBanner — inline, dismissible; never replaces page content       */
/* ------------------------------------------------------------------ */

export function ErrorBanner({
  message,
  onDismiss,
  onRetry,
}: {
  message: string | null;
  onDismiss?: () => void;
  onRetry?: () => void;
}) {
  if (!message) return null;
  return (
    <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
      <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
      <span className="text-sm text-red-800 dark:text-red-300 flex-1 break-words">
        {message}
      </span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-sm font-medium text-red-700 dark:text-red-300 hover:underline shrink-0"
        >
          Retry
        </button>
      )}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-red-400 hover:text-red-600 shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* EmptyState                                                          */
/* ------------------------------------------------------------------ */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-16 px-6">
      {icon && (
        <div className="mx-auto mb-4 w-12 h-12 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-4">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* LoadingState — first-load placeholder inside the page area           */
/* ------------------------------------------------------------------ */

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ToggleChip — compact labeled toggle for toolbars                     */
/* ------------------------------------------------------------------ */

export function ToggleChip({
  label,
  icon,
  checked,
  onChange,
}: {
  label: string;
  icon?: ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition-colors duration-200 ${
        checked
          ? "bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100"
          : "border-gray-300 text-gray-600 hover:border-gray-500 dark:border-gray-600 dark:text-gray-300 dark:hover:border-gray-400"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* DropdownMenu — overflow "…" menu for secondary actions               */
/* ------------------------------------------------------------------ */

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  dividerAbove?: boolean;
}

export function DropdownMenu({
  items,
  trigger,
  align = "right",
  triggerLabel = "More actions",
}: {
  items: MenuItem[];
  trigger?: ReactNode;
  align?: "left" | "right";
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={triggerLabel}
        aria-expanded={open}
        className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors duration-200"
      >
        {trigger ?? <MoreVertical className="w-4 h-4" />}
      </button>
      {open && (
        <div
          className={`absolute z-30 mt-1 min-w-[180px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1 ${align === "right" ? "right-0" : "left-0"}`}
        >
          {items.map((item, i) => (
            <div key={i}>
              {item.dividerAbove && (
                <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
              )}
              <button
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
                  item.danger
                    ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
                    : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
