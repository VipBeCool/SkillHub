import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

export function TooltipProvider({ children, delayDuration = 500 }: { children: React.ReactNode, delayDuration?: number }) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={0}>{children}</TooltipPrimitive.Provider>;
}

interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}

export function Tooltip({ children, content, side = 'top', align = 'center' }: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={5}
          className="z-[150] overflow-hidden rounded-[6px] bg-white/90 backdrop-blur-md px-2 py-1 text-[11px] font-medium text-[var(--foreground)] border border-black/5 shadow-sm animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-white drop-shadow-sm" width={11} height={5} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
