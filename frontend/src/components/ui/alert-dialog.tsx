import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function AlertDialog(
  props: ComponentProps<typeof AlertDialogPrimitive.Root>,
) {
  return <AlertDialogPrimitive.Root {...props} />;
}

export function AlertDialogTrigger(
  props: ComponentProps<typeof AlertDialogPrimitive.Trigger>,
) {
  return <AlertDialogPrimitive.Trigger {...props} />;
}

export function AlertDialogPortal(
  props: ComponentProps<typeof AlertDialogPrimitive.Portal>,
) {
  return <AlertDialogPrimitive.Portal {...props} />;
}

export function AlertDialogOverlay({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-[70] bg-[rgba(17,24,21,0.62)] backdrop-blur-sm",
        className,
      )}
      {...props}
    />
  );
}

type AlertDialogContentProps = ComponentProps<
  typeof AlertDialogPrimitive.Content
> & {
  container?: Element | DocumentFragment | null;
};

export function AlertDialogContent({
  className,
  container,
  ...props
}: AlertDialogContentProps) {
  return (
    <AlertDialogPortal container={container}>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-[71] grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-[1.5rem] border border-[color:var(--erp-border)] bg-white p-4 text-[var(--erp-foreground)] shadow-2xl outline-none sm:p-6",
          className,
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}

export function AlertDialogHeader({
  className,
  ...props
}: ComponentProps<"div">) {
  return <div className={cn("grid gap-2", className)} {...props} />;
}
export function AlertDialogFooter({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-3 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}
export function AlertDialogTitle({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      className={cn("text-xl font-black tracking-[-0.03em]", className)}
      {...props}
    />
  );
}
export function AlertDialogDescription({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      className={cn(
        "text-sm leading-6 text-[var(--erp-muted-foreground)]",
        className,
      )}
      {...props}
    />
  );
}
export function AlertDialogAction(
  props: ComponentProps<typeof AlertDialogPrimitive.Action>,
) {
  return <AlertDialogPrimitive.Action {...props} />;
}

export function AlertDialogCancel(
  props: ComponentProps<typeof AlertDialogPrimitive.Cancel>,
) {
  return <AlertDialogPrimitive.Cancel {...props} />;
}
