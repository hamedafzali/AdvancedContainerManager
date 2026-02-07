// Accessibility utilities and hooks for the Advanced Container Manager

import { useEffect, useRef, RefObject, useState } from "react";

// Hook for managing focus and keyboard navigation
export function useKeyboardNavigation() {
  const handleKeyDown = (event: KeyboardEvent) => {
    // Global keyboard shortcuts
    switch (event.key) {
      case "/":
        // Focus search input
        if (!event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          const searchInput = document.querySelector(
            'input[placeholder*="search" i]',
          ) as HTMLInputElement;
          if (searchInput) {
            searchInput.focus();
          }
        }
        break;
      case "Escape":
        // Close modals, clear focus, etc.
        const focusedElement = document.activeElement;
        if (focusedElement && focusedElement !== document.body) {
          (focusedElement as HTMLElement).blur();
        }
        break;
    }
  };

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}

// Hook for managing focus within modals and dialogs
export function useFocusTrap(
  containerRef: RefObject<HTMLElement>,
  isActive: boolean = true,
) {
  const previouslyFocusedElement = useRef<Element | null>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    // Store the currently focused element
    previouslyFocusedElement.current = document.activeElement;

    // Focus the first focusable element in the container
    const focusableElements = containerRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const firstElement = focusableElements[0] as HTMLElement;
    if (firstElement) {
      firstElement.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;

      const focusableElements = Array.from(
        containerRef.current!.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ) as HTMLElement[];

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Return focus to previously focused element
        if (previouslyFocusedElement.current instanceof HTMLElement) {
          previouslyFocusedElement.current.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keydown", handleEscape);

      // Restore focus
      if (previouslyFocusedElement.current instanceof HTMLElement) {
        previouslyFocusedElement.current.focus();
      }
    };
  }, [containerRef, isActive]);
}

// Hook for announcing dynamic content to screen readers
export function useAnnounce(
  message: string,
  priority: "polite" | "assertive" = "polite",
) {
  useEffect(() => {
    if (!message) return;

    const announcement = document.createElement("div");
    announcement.setAttribute("aria-live", priority);
    announcement.setAttribute("aria-atomic", "true");
    announcement.style.position = "absolute";
    announcement.style.left = "-10000px";
    announcement.style.width = "1px";
    announcement.style.height = "1px";
    announcement.style.overflow = "hidden";

    document.body.appendChild(announcement);

    // Small delay to ensure screen readers pick up the change
    setTimeout(() => {
      announcement.textContent = message;
    }, 100);

    return () => {
      document.body.removeChild(announcement);
    };
  }, [message, priority]);
}

// Utility function to generate unique IDs for form elements
let idCounter = 0;
export function useUniqueId(prefix: string = "acm"): string {
  const idRef = useRef<string>();

  if (!idRef.current) {
    idRef.current = `${prefix}-${++idCounter}`;
  }

  return idRef.current;
}

// Hook for managing reduced motion preferences
export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return prefersReducedMotion;
}

// Accessibility helper components (converted to functions)
export function getSkipLink(
  href: string,
  children: string,
): { href: string; children: string; className: string } {
  return {
    href,
    children,
    className:
      "sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-primary-600 text-white px-4 py-2 rounded-md z-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2",
  };
}

export function getVisuallyHidden(children: string): {
  children: string;
  className: string;
} {
  return {
    children,
    className: "sr-only",
  };
}

// ARIA helper functions
export function getAriaLabel(text: string, context?: string): string {
  if (context) {
    return `${text}, ${context}`;
  }
  return text;
}

export function getAriaDescription(description: string): {
  "aria-describedby": string;
} {
  const id = `desc-${Math.random().toString(36).substr(2, 9)}`;
  return { "aria-describedby": id };
}

// Color contrast utilities for accessibility
export function getContrastColor(backgroundColor: string): string {
  // Simple implementation - in a real app, you'd use a proper color contrast library
  // This is a basic implementation for demonstration
  const hex = backgroundColor.replace("#", "");
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? "#000000" : "#ffffff";
}
