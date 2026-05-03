import { Landmark } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Spending, net worth, and recent activity.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-muted p-2">
              <Landmark className="size-5" />
            </div>
            <div>
              <CardTitle>No accounts connected</CardTitle>
              <CardDescription>
                Connect a bank to start seeing transactions.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Plaid integration ships in Phase 1. Until then this dashboard is a
            placeholder.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
