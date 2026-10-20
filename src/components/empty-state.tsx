import type { ReactNode } from "react";

type EmptyStateProps = {
  title?: string;
  body: string;
  children?: ReactNode;
};

export function EmptyState({ title, body, children }: EmptyStateProps) {
  return (
    <section className="flex flex-col items-center gap-3 py-12 text-center">
      {title && <h2 className="text-lg font-semibold text-balance">{title}</h2>}
      <p className="max-w-xs text-muted-foreground">{body}</p>
      {children && <div className="mt-2 flex w-full flex-col gap-2">{children}</div>}
    </section>
  );
}
