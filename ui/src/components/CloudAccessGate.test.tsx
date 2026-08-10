import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CloudAccessGate } from "./CloudAccessGate";

const openOnboarding = vi.fn();

vi.mock("@/lib/router", () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate">{to}</div>,
  Outlet: () => <div data-testid="outlet" />,
  useLocation: () => ({ pathname: "/", search: "" }),
}));

vi.mock("@/context/DialogContext", () => ({
  useDialogActions: () => ({ openOnboarding }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryFn, enabled = true }: { queryFn: () => unknown; enabled?: boolean }) => ({
    data: enabled ? queryFn() : undefined,
    isLoading: false,
    error: null,
  }),
  useMutation: () => ({ mutate: vi.fn(), isSuccess: false, isPending: false, error: null }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/api/health", () => ({
  healthApi: {
    get: () => ({
      deploymentMode: "authenticated",
      deploymentExposure: "private",
      bootstrapStatus: "ready",
      bootstrapInviteActive: false,
    }),
  },
}));

vi.mock("@/api/auth", () => ({
  authApi: { getSession: () => ({ user: { id: "user-1", email: "admin@example.com" } }) },
}));

vi.mock("@/api/access", () => ({
  accessApi: {
    getCurrentBoardAccess: () => ({ isInstanceAdmin: true, companyIds: [] }),
  },
}));

vi.mock("@/lib/queryKeys", () => ({
  queryKeys: {
    health: ["health"],
    auth: { session: ["auth", "session"] },
    companies: { all: ["companies"], stats: ["company-stats"] },
    access: { currentBoardAccess: ["access", "current"] },
  },
}));

vi.mock("@/components/BootstrapPendingPage", () => ({
  BootstrapPendingPage: () => <div data-testid="bootstrap-pending" />,
}));

vi.mock("@/components/AnimatedPaperclipIcon", () => ({
  PaperclipLoading: () => <div data-testid="loading" />,
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe("CloudAccessGate", () => {
  it("opens startup onboarding for a companyless instance admin", async () => {
    render(<CloudAccessGate />);

    await waitFor(() => expect(openOnboarding).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
  });
});
