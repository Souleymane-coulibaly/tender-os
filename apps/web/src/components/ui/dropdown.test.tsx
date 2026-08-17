import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Dropdown, DropdownItem } from "./dropdown";

describe("Dropdown", () => {
  it("BLOQUANT — the menu is closed by default and opens on trigger click", async () => {
    const user = userEvent.setup();
    render(
      <Dropdown trigger="Actions">
        <DropdownItem onClick={() => {}}>Archiver</DropdownItem>
      </Dropdown>,
    );

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Actions/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Archiver" })).toBeInTheDocument();
  });

  it("closes when Escape is pressed", async () => {
    const user = userEvent.setup();
    render(
      <Dropdown trigger="Actions">
        <DropdownItem onClick={() => {}}>Archiver</DropdownItem>
      </Dropdown>,
    );

    await user.click(screen.getByRole("button", { name: /Actions/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes when clicking outside the dropdown", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Dropdown trigger="Actions">
          <DropdownItem onClick={() => {}}>Archiver</DropdownItem>
        </Dropdown>
        <button type="button">Ailleurs sur la page</button>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: /Actions/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ailleurs sur la page" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("calls the item's onClick handler when activated", async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    render(
      <Dropdown trigger="Actions">
        <DropdownItem onClick={onArchive}>Archiver</DropdownItem>
      </Dropdown>,
    );

    await user.click(screen.getByRole("button", { name: /Actions/ }));
    await user.click(screen.getByRole("menuitem", { name: "Archiver" }));
    expect(onArchive).toHaveBeenCalledTimes(1);
  });
});
