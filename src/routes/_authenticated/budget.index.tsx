import { createFileRoute, Navigate } from "@tanstack/react-router";
import { currentMonthKey } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/budget/")({
  component: () => <Navigate to="/budget/$mes" params={{ mes: currentMonthKey() }} replace />,
});