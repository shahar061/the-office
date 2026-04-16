import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { Typewriter } from "@/components/Typewriter";

vi.mock("framer-motion", () => ({
  motion: {
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe("Typewriter", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("renders the first phrase character by character", () => {
    render(<Typewriter phrases={["hello", "world"]} typingSpeed={40} />);
    expect(screen.getByTestId("typewriter-text").textContent).toBe("");
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByTestId("typewriter-text").textContent).toBe("hello");
  });

  it("deletes and types next phrase after pause", () => {
    render(
      <Typewriter phrases={["hi", "yo"]} typingSpeed={40} deletingSpeed={25} pauseDuration={100} />
    );
    act(() => { vi.advanceTimersByTime(80); });
    expect(screen.getByTestId("typewriter-text").textContent).toBe("hi");
    act(() => { vi.advanceTimersByTime(100); });
    expect(screen.getByTestId("typewriter-text").textContent).toBe("hi");
    act(() => { vi.advanceTimersByTime(50); });
    expect(screen.getByTestId("typewriter-text").textContent).toBe("");
    act(() => { vi.advanceTimersByTime(80); });
    expect(screen.getByTestId("typewriter-text").textContent).toBe("yo");
  });
});
