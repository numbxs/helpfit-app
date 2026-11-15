import { cn } from "@/lib/utils";

export function PageHeader({ eyebrow, title, action, className }: { eyebrow?: React.ReactNode; title: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <header className={cn("flex items-end justify-between gap-4 pb-5 pt-6", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="text-[13px] font-medium text-muted-foreground">{eyebrow}</p>}
        <h1 className="mt-0.5 text-[28px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
      </div>
      {action}
    </header>
  );
}
