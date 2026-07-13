import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const AlertDialog = AlertDialogPrimitive.Root
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger

export function AlertDialogPortal(props: ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return <AlertDialogPrimitive.Portal {...props} />
}

export function AlertDialogOverlay({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return <AlertDialogPrimitive.Overlay className={cn('fixed inset-0 z-[70] bg-[rgba(17,24,21,0.62)] backdrop-blur-sm', className)} {...props} />
}

export function AlertDialogContent({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return <AlertDialogPortal><AlertDialogOverlay /><AlertDialogPrimitive.Content className={cn('fixed left-1/2 top-1/2 z-[71] grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-5 rounded-[1.5rem] border border-[color:var(--erp-border)] bg-white p-6 text-[var(--erp-foreground)] shadow-2xl outline-none', className)} {...props} /></AlertDialogPortal>
}

export function AlertDialogHeader({ className, ...props }: ComponentProps<'div'>) { return <div className={cn('grid gap-2', className)} {...props} /> }
export function AlertDialogFooter({ className, ...props }: ComponentProps<'div'>) { return <div className={cn('flex flex-col-reverse gap-3 sm:flex-row sm:justify-end', className)} {...props} /> }
export function AlertDialogTitle({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Title>) { return <AlertDialogPrimitive.Title className={cn('text-xl font-black tracking-[-0.03em]', className)} {...props} /> }
export function AlertDialogDescription({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Description>) { return <AlertDialogPrimitive.Description className={cn('text-sm leading-6 text-[var(--erp-muted-foreground)]', className)} {...props} /> }
export const AlertDialogAction = AlertDialogPrimitive.Action
export const AlertDialogCancel = AlertDialogPrimitive.Cancel
