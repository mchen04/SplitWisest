type DraftControl = EventTarget & {
  tagName?: string;
  type?: string;
  value?: string;
  disabled?: boolean;
  readOnly?: boolean;
  isConnected?: boolean;
  getAttribute?: (name: string) => string | null;
  hasAttribute?: (name: string) => boolean;
  closest?: (selector: string) => unknown;
};

function controlFrom(event: Event): DraftControl | null {
  const target = event.target as DraftControl | null;
  return target && typeof target.tagName === "string" ? target : null;
}

function tagOf(control: DraftControl): string {
  return control.tagName?.toUpperCase() ?? "";
}

function isTextControl(control: DraftControl): boolean {
  if (tagOf(control) === "TEXTAREA") return true;
  if (tagOf(control) !== "INPUT") return false;
  const ignored = ["hidden", "checkbox", "radio", "submit", "button", "range", "file"];
  return !ignored.includes((control.type ?? "text").toLowerCase());
}

function isChoiceControl(control: DraftControl): boolean {
  if (!control.closest?.("form")) return false;
  if (tagOf(control) === "SELECT") return true;
  if (tagOf(control) !== "INPUT") return false;
  return ["checkbox", "radio"].includes((control.type ?? "").toLowerCase());
}

function isStatefulButton(control: DraftControl): boolean {
  if (!control.closest?.("form")) return false;
  if (tagOf(control) !== "BUTTON") return false;
  const role = control.getAttribute?.("role");
  return role === "radio"
    || role === "checkbox"
    || role === "switch"
    || control.hasAttribute?.("aria-pressed") === true;
}

/**
 * Track edits that a deploy reload must not discard.
 *
 * Choice controls cannot use `defaultValue` as a baseline because React keeps
 * controlled defaults in sync. A real user event marks them dirty until their
 * form closes. Plain buttons do not count, so Cancel and disclosure controls
 * never defer an update by themselves.
 */
export function createDraftGuard() {
  const touchedText = new Set<DraftControl>();
  const touchedChoices = new Set<DraftControl>();

  const trackText = (event: Event) => {
    const control = controlFrom(event);
    if (control && isTextControl(control)) touchedText.add(control);
  };

  const trackChoice = (event: Event) => {
    const control = controlFrom(event);
    if (control && isChoiceControl(control)) touchedChoices.add(control);
  };

  const trackStatefulButton = (event: Event) => {
    const origin = controlFrom(event);
    const control = origin && tagOf(origin) !== "BUTTON"
      ? origin.closest?.("button") as DraftControl | null
      : origin;
    if (control && isStatefulButton(control)) touchedChoices.add(control);
  };

  const hasUnsavedInput = () => {
    for (const control of touchedText) {
      if (control.isConnected === false) {
        touchedText.delete(control);
        continue;
      }
      if (control.disabled || control.readOnly) continue;
      if ((control.value ?? "").trim() !== "") return true;
    }
    for (const control of touchedChoices) {
      if (control.isConnected === false) {
        touchedChoices.delete(control);
        continue;
      }
      if (!control.disabled) return true;
    }
    return false;
  };

  return { trackText, trackChoice, trackStatefulButton, hasUnsavedInput };
}
