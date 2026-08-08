"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import {
  SFUMATURA_SCORRIMENTO,
  useStrisciaScorrevole,
} from "@/hooks/useStrisciaScorrevole"
import { cn } from "@/lib/utils"

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

/**
 * `max-w-full overflow-x-auto` sta qui e non nelle singole pagine perché il
 * difetto è del contenitore, non di chi lo usa: `w-fit` lo allarga quanto le
 * tab, e su schermo stretto la striscia esce dal riquadro trascinandosi dietro
 * l'intera pagina. Misurato a 390 px su turni, riconciliazione, anomalie,
 * ferie e analisi costi.
 */
function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  const { rifStriscia, restaDaScorrere, centraAttivo } =
    useStrisciaScorrevole<HTMLDivElement>()

  return (
    <TabsPrimitive.List
      ref={rifStriscia}
      data-slot="tabs-list"
      onFocus={centraAttivo}
      className={cn(
        "bg-muted text-muted-foreground inline-flex h-9 w-fit max-w-full items-center justify-center overflow-x-auto rounded-lg p-[3px]",
        restaDaScorrere && SFUMATURA_SCORRIMENTO,
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
