import { describe, expect, it } from "vitest";
import { createDraftGuard } from "../draft-guard";

type FakeControl = EventTarget & {
  tagName: string;
  type?: string;
  value?: string;
  disabled?: boolean;
  readOnly?: boolean;
  isConnected?: boolean;
  getAttribute: (name: string) => string | null;
  hasAttribute: (name: string) => boolean;
  closest: (selector: string) => unknown;
};

function control({
  tagName,
  type,
  value = "",
  role,
  pressed = false,
  inForm = true,
}: {
  tagName: string;
  type?: string;
  value?: string;
  role?: string;
  pressed?: boolean;
  inForm?: boolean;
}): FakeControl {
  return {
    tagName,
    type,
    value,
    isConnected: true,
    getAttribute: (name) => name === "role" ? role ?? null : null,
    hasAttribute: (name) => name === "aria-pressed" && pressed,
    closest: (selector) => selector === "form" && inForm ? {} : null,
  } as FakeControl;
}

function eventFor(target: EventTarget): Event {
  return { target } as Event;
}

describe("draft update guard", () => {
  it("releases a typed field only after the user clears it", () => {
    const guard = createDraftGuard();
    const input = control({ tagName: "input", value: "Dinner" });

    guard.trackText(eventFor(input));
    expect(guard.hasUnsavedInput()).toBe(true);

    input.value = "";
    expect(guard.hasUnsavedInput()).toBe(false);
  });

  it.each([
    control({ tagName: "select" }),
    control({ tagName: "input", type: "radio" }),
    control({ tagName: "input", type: "checkbox" }),
  ])("protects a changed select or native choice", (choice) => {
    const guard = createDraftGuard();
    guard.trackChoice(eventFor(choice));
    expect(guard.hasUnsavedInput()).toBe(true);
  });

  it.each([
    control({ tagName: "button", role: "radio" }),
    control({ tagName: "button", role: "switch" }),
    control({ tagName: "button", pressed: true }),
  ])("protects a stateful custom button", (button) => {
    const guard = createDraftGuard();
    guard.trackStatefulButton(eventFor(button));
    expect(guard.hasUnsavedInput()).toBe(true);
  });

  it("ignores plain action buttons and removes closed form controls", () => {
    const guard = createDraftGuard();
    const cancel = control({ tagName: "button" });
    const select = control({ tagName: "select" });

    guard.trackStatefulButton(eventFor(cancel));
    expect(guard.hasUnsavedInput()).toBe(false);

    guard.trackChoice(eventFor(select));
    select.isConnected = false;
    expect(guard.hasUnsavedInput()).toBe(false);
  });

  it("protects a stateful button when its child receives the click", () => {
    const guard = createDraftGuard();
    const button = control({ tagName: "button", role: "radio" });
    const child = control({ tagName: "span" });
    child.closest = (selector) => selector === "button" ? button : {};

    guard.trackStatefulButton(eventFor(child));

    expect(guard.hasUnsavedInput()).toBe(true);
  });

  it("ignores page filters outside a draft form", () => {
    const guard = createDraftGuard();
    const filter = control({ tagName: "select", inForm: false });

    guard.trackChoice(eventFor(filter));
    expect(guard.hasUnsavedInput()).toBe(false);
  });
});
