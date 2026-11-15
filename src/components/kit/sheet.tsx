"use client";

import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

/** Bottom sheet used for quick, focused tasks. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerContent className={cn("mx-auto w-full max-w-lg rounded-t-[1.75rem]", className)}>
        <DrawerHeader className="px-5 pb-2 pt-2 text-left">
          <DrawerTitle className="text-lg font-semibold tracking-tight">{title}</DrawerTitle>
          {description && <DrawerDescription className="text-left">{description}</DrawerDescription>}
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        {footer && <div className="pb-safe border-t bg-popover px-5 pt-3 [&]:pb-[max(env(safe-area-inset-bottom),1rem)]">{footer}</div>}
      </DrawerContent>
    </Drawer>
  );
}
