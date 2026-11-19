import Link from "next/link";
import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProfileLink({ className }: { className?: string }) {
  return (
    <Link href="/profile" aria-label="Profile and settings" className={cn("flex size-11 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground transition hover:text-foreground", className)}>
      <UserRound className="size-5" />
    </Link>
  );
}

export function PageHeader({
  eyebrow,
  title,
  action,
  className,
  showProfile = true,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  showProfile?: boolean;
}) {
  return (
    <header className={cn("flex items-end justify-between gap-4 pb-5 pt-6", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="text-[13px] font-medium text-muted-foreground">{eyebrow}</p>}
        <h1 className="mt-0.5 text-[28px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        {action}
        {showProfile && <ProfileLink />}
      </div>
    </header>
  );
}
