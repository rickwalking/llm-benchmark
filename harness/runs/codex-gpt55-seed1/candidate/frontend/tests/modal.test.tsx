import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Modal from "../src/components/Modal";

describe("Modal", () => {
  it("closes when Escape is pressed", async () => {
    const onClose = vi.fn();
    render(
      <Modal title="Confirm" onClose={onClose}>
        <button type="button">Confirm</button>
      </Modal>
    );

    expect(screen.getByRole("dialog", { name: "Confirm" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
