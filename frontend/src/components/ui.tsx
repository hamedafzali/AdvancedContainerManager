/**
 * App-level UI kit. Everything visual comes from pixelwizards-components;
 * this module only adapts prop names the pages already use and adds the few
 * app-specific pieces (search field, loading state, filter chip).
 */
import { Fragment, ReactElement, ReactNode } from "react";
import { Loader2, Search } from "lucide-react";
import {
  Alert,
  Badge as PwBadge,
  Button as PwButton,
  Card as PwCard,
  CardBody,
  CardFooter,
  CardHeader as PwCardHeader,
  ConfirmDialog as PwConfirmDialog,
  DataTable,
  DescriptionList,
  DropdownMenu as PwDropdownMenu,
  EmptyState as PwEmptyState,
  IconButton as PwIconButton,
  List,
  ListItem,
  Modal as PwModal,
  PageHeader,
  StatCard,
  ToggleGroup,
  ViewSwitcher,
  useViewMode,
  type ButtonProps as PwButtonProps,
  type DataTableColumn,
  type DescriptionItem,
  type ViewMode,
} from "pixelwizards-components";

export {
  Alert,
  CardBody,
  CardFooter,
  DataTable,
  DescriptionList,
  List,
  ListItem,
  PageHeader,
  ViewSwitcher,
  useViewMode,
};
export type { DataTableColumn, DescriptionItem, ViewMode };

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/* Tone: the app's status vocabulary, mapped onto library colours. */
export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const TONE_COLOR = {
  neutral: "neutral",
  success: "success",
  warning: "warning",
  danger: "error",
  info: "info",
  accent: "primary",
} as const;

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

type ButtonProps = Omit<PwButtonProps, "icon" | "size" | "variant"> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  icon?: ReactNode;
};

/** Secondary is the default so a page has one primary action at most. */
export function Button({ variant = "secondary", size = "md", icon, ...rest }: ButtonProps) {
  return <PwButton variant={variant} size={size} icon={icon as ReactElement | undefined} {...rest} />;
}

export function IconButton({
  tone = "default",
  ...rest
}: Omit<React.ComponentProps<typeof PwIconButton>, "tone"> & {
  tone?: "default" | "success" | "danger" | "info";
}) {
  return <PwIconButton tone={tone === "info" ? "primary" : tone} {...rest} />;
}

export function DropdownMenu({
  trigger,
  ...rest
}: Omit<React.ComponentProps<typeof PwDropdownMenu>, "label"> & { trigger?: ReactNode }) {
  return <PwDropdownMenu align="right" label={trigger} {...rest} />;
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

export function Card({
  children,
  className,
  padded = true,
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  interactive?: boolean;
}) {
  return (
    <PwCard padding={padded ? "md" : "none"} hover={interactive} className={className}>
      {children}
    </PwCard>
  );
}

export function CardHeader({
  badges,
  ...rest
}: React.ComponentProps<typeof PwCardHeader> & { badges?: ReactNode }) {
  return <PwCardHeader meta={badges} {...rest} />;
}

/** Square icon tile used as the leading visual of cards and rows. */
export function IconTile({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  const soft: Record<Tone, string> = {
    neutral: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
    success: "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400",
    warning: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
    danger: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
    info: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400",
    accent: "bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300",
  };
  return (
    <div
      className={cx(
        "w-9 h-9 rounded-lg flex items-center justify-center [&>svg]:w-[18px] [&>svg]:h-[18px]",
        soft[tone],
      )}
    >
      {children}
    </div>
  );
}

/** Responsive card grid: one column on phones, more as space allows. */
export function CardGrid({ children, dense = false }: { children: ReactNode; dense?: boolean }) {
  return (
    <div
      className={cx(
        "grid gap-4",
        dense
          ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
          : "grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3",
      )}
    >
      {children}
    </div>
  );
}

/**
 * One collection, three layouts: cards, a list or a table. Pages describe
 * each layout once and the switcher picks which one renders.
 */
export function CollectionView<T>({
  view,
  rows,
  rowKey,
  columns,
  caption,
  renderCard,
  renderListItem,
  rowClassName,
}: {
  view: ViewMode;
  rows: T[];
  rowKey: (row: T) => string;
  columns: DataTableColumn<T>[];
  caption: string;
  renderCard: (row: T) => ReactNode;
  renderListItem: (row: T) => ReactNode;
  rowClassName?: (row: T) => string | undefined;
}) {
  if (view === "grid") {
    return (
      <CardGrid dense>
        {rows.map((row) => (
          <Fragment key={rowKey(row)}>{renderCard(row)}</Fragment>
        ))}
      </CardGrid>
    );
  }
  if (view === "list") {
    return (
      <List>
        {rows.map((row) => (
          <Fragment key={rowKey(row)}>{renderListItem(row)}</Fragment>
        ))}
      </List>
    );
  }
  return (
    <PwCard padding="none" className="overflow-hidden">
      <DataTable caption={caption} columns={columns} rows={rows} rowKey={rowKey} rowClassName={rowClassName} />
    </PwCard>
  );
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

export function Badge({
  tone = "neutral",
  children,
  icon,
  mono,
  title,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  icon?: ReactNode;
  mono?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <PwBadge
      color={TONE_COLOR[tone]}
      variant="subtle"
      size="sm"
      icon={icon}
      mono={mono}
      title={title}
      className={className}
    >
      {children}
    </PwBadge>
  );
}

/** Status shown as dot + word, so colour is never the only signal. */
export function StatusBadge({ tone, label, busy = false }: { tone: Tone; label: string; busy?: boolean }) {
  return (
    <PwBadge
      color={TONE_COLOR[tone]}
      variant="subtle"
      dot={!busy}
      pulse={tone === "success"}
      icon={busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : undefined}
    >
      {label.charAt(0).toUpperCase() + label.slice(1)}
    </PwBadge>
  );
}

export function StatTile({
  tone,
  ...rest
}: Omit<React.ComponentProps<typeof StatCard>, "tone"> & { tone?: Tone }) {
  const map = { ...TONE_COLOR, accent: "primary", neutral: "neutral" } as const;
  return <StatCard tone={tone ? map[tone] : undefined} {...rest} />;
}

/* ------------------------------------------------------------------ */
/* Toolbars and filters                                                */
/* ------------------------------------------------------------------ */

/** Filters on the left, view controls on the right; stacks on phones. */
export function Toolbar({ children, end }: { children?: ReactNode; end?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex flex-1 flex-wrap items-center gap-2 min-w-0">{children}</div>
      {end && <div className="flex items-center gap-2 shrink-0">{end}</div>}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}) {
  return (
    <div className={cx("relative w-full sm:w-72", className)}>
      <Search
        className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
        aria-hidden="true"
      />
      <input
        type="search"
        aria-label={label ?? placeholder.replace(/…$/, "")}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field pl-9"
      />
    </div>
  );
}

/** Single-choice filter (All / Running / Stopped …) with counts. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; count?: number }>;
  label: string;
}) {
  return (
    <ToggleGroup
      variant="segmented"
      ariaLabel={label}
      value={value}
      onChange={(v) => onChange(v as T)}
      items={options.map((o) => ({ id: o.value, label: o.label, count: o.count }))}
    />
  );
}

/** On/off filter chip for toolbars. */
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
    <ToggleGroup
      multiple
      value={checked ? ["on"] : []}
      onChange={(v) => onChange((v as string[]).includes("on"))}
      items={[{ id: "on", label, icon }]}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Overlays                                                            */
/* ------------------------------------------------------------------ */

export function Modal({
  wide = false,
  ...rest
}: Omit<React.ComponentProps<typeof PwModal>, "size"> & { wide?: boolean }) {
  return <PwModal size={wide ? "xl" : "md"} {...rest} />;
}

export function ConfirmDialog({
  danger = true,
  ...rest
}: React.ComponentProps<typeof PwConfirmDialog>) {
  return <PwConfirmDialog danger={danger} {...rest} />;
}

/* ------------------------------------------------------------------ */
/* Page states                                                         */
/* ------------------------------------------------------------------ */

/** Inline, dismissible error; never replaces page content. */
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
    <Alert
      status="error"
      description={message}
      closable={Boolean(onDismiss)}
      onClose={onDismiss}
      action={
        onRetry ? (
          <button type="button" onClick={onRetry} className="text-red-700 dark:text-red-300 hover:underline">
            Retry
          </button>
        ) : undefined
      }
    />
  );
}

export function EmptyState(props: React.ComponentProps<typeof PwEmptyState>) {
  return <PwEmptyState {...props} />;
}

/** First-load placeholder inside the page area. */
export function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-24" role="status">
      <div className="text-center">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin mx-auto mb-3" aria-hidden="true" />
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  );
}
