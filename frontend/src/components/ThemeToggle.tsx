import { Check, Monitor, Moon, Sun } from "lucide-react";
import { DropdownMenu } from "pixelwizards-components";
import { useTheme, type Theme } from "@/hooks/useTheme";

const OPTIONS: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** Explicit Light / Dark / System menu; the trigger shows what is applied. */
export function ThemeToggle() {
  const { theme, actualTheme, setTheme } = useTheme();
  const TriggerIcon = actualTheme === "dark" ? Moon : Sun;

  return (
    <DropdownMenu
      align="right"
      iconTrigger
      triggerLabel={`Theme: ${theme}`}
      label={<TriggerIcon className="h-4 w-4" aria-hidden="true" />}
      items={OPTIONS.map(({ value, label, icon: Icon }) => ({
        label: (
          <span className="flex w-full items-center justify-between gap-6">
            {label}
            {theme === value && <Check className="h-4 w-4 text-primary-600 dark:text-primary-400" aria-label="selected" />}
          </span>
        ),
        icon: <Icon className="h-4 w-4" aria-hidden="true" />,
        onClick: () => setTheme(value),
      }))}
    />
  );
}
