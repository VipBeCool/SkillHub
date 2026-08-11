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
          style={{ zIndex: 100000 }}
          className="overflow-hidden rounded-[4px] bg-black/90 backdrop-blur-md px-1.5 py-0.5 text-[12px] font-medium text-white border border-black/5 shadow-sm animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 max-w-[300px] break-words text-wrap"
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-black/90 drop-shadow-sm" width={11} height={5} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
