import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/helpers/render";
import { Header } from "./header";

const adoHeaderLinks = [
  {
    label: "Board",
    href: "https://dev.azure.com/kmddk/KMD%20Identity/_boards/board/t/KMD%20Identity%20Team/Stories?System.AssignedTo=%40me%2C_Unassigned_",
  },
  {
    label: "Files",
    href: "https://dev.azure.com/kmddk/KMD%20Identity/_git/KMD.Identity",
  },
  {
    label: "Pipelines",
    href: "https://dev.azure.com/kmddk/KMD%20Identity/_build",
  },
  {
    label: "Releases",
    href: "https://dev.azure.com/kmddk/KMD%20Identity/_release",
  },
] as const;

describe("Header", () => {
  it("renders centered Azure DevOps quick links", () => {
    renderWithProviders(<Header onOpenSettings={() => undefined} />);

    const banner = screen.getByRole("banner");
    const nav = screen.getByRole("navigation", {
      name: "Azure DevOps quick links",
    });

    expect(banner).toHaveClass("grid-cols-[1fr_auto_1fr]");
    expect(nav).toHaveClass("justify-self-center");

    for (const { label, href } of adoHeaderLinks) {
      const link = within(nav).getByRole("link", { name: label });

      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("shows tooltip for Azure DevOps quick links", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Header onOpenSettings={() => undefined} />);

    await user.hover(screen.getByRole("link", { name: "Board" }));

    expect(
      await screen.findByRole("tooltip", { name: "Board" }),
    ).toBeInTheDocument();
  });
});
