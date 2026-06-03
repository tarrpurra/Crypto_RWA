import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RiskAssessmentResponse } from "@/lib/api/types";

export function RiskDetailsModal({
  open,
  onOpenChange,
  risk,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  risk: RiskAssessmentResponse | undefined;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-border bg-background">
        <DialogHeader>
          <DialogTitle>Risk validation details</DialogTitle>
          <DialogDescription>
            Bucket scores, hard veto flags, and operator notes used to gate plan approval.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 text-sm">
          <div className="grid gap-2 rounded border border-border bg-surface-2 p-3 md:grid-cols-2">
            <p className="text-muted-foreground">Risk band</p>
            <p className="font-medium text-foreground">{risk?.risk_band ?? "-"}</p>
            <p className="text-muted-foreground">Risk score</p>
            <p className="font-mono text-foreground">{risk?.risk_score ?? "-"}</p>
            <p className="text-muted-foreground">Hard veto</p>
            <p className="font-medium text-foreground">{risk?.hard_veto_status ?? "-"}</p>
            <p className="text-muted-foreground">Freshness</p>
            <p className="font-medium text-foreground">{risk?.freshness_status ?? "-"}</p>
          </div>

          <div className="grid gap-2">
            {(risk?.buckets ?? []).map((bucket) => (
              <div key={bucket.bucket} className="rounded border border-border bg-surface-2 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-foreground">{bucket.bucket}</p>
                  <div className="flex items-center gap-2">
                    {bucket.hard_veto && (
                      <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
                        veto
                      </Badge>
                    )}
                    <span className="font-mono text-xs text-muted-foreground">
                      score {bucket.score} / weight {bucket.weight}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-muted-foreground">{bucket.reason}</p>
              </div>
            ))}
            {!risk?.buckets?.length && (
              <div className="rounded border border-border bg-surface-2 p-3 text-muted-foreground">
                No bucket-level risk details returned yet.
              </div>
            )}
          </div>

          <div className="rounded border border-border bg-surface-2 p-3">
            <p className="font-medium text-foreground">Notes</p>
            <div className="mt-2 space-y-1 text-muted-foreground">
              {(risk?.notes ?? []).map((note) => (
                <p key={note}>{note}</p>
              ))}
              {!risk?.notes?.length && <p>No additional notes returned by the risk engine.</p>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
