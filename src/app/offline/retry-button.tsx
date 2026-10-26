"use client";

import { Button } from "@/components/ui/button";

export function RetryButton({ label }: { label: string }) {
  return (
    <Button variant="outline" className="min-h-11" onClick={() => window.location.reload()}>
      {label}
    </Button>
  );
}
