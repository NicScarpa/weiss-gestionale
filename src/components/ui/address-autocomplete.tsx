'use client'

import * as React from 'react'
import usePlacesAutocomplete, {
    getGeocode,
} from 'use-places-autocomplete'
import { Check, ChevronsUpDown } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import Script from 'next/script'

import { logger } from '@/lib/logger'
type Google = {
    maps: {
        places: unknown
    }
}

declare global {
    interface Window {
        google: Google
    }
}

interface AddressAutocompleteProps {
    value: string
    onChange: (value: string) => void
    disabled?: boolean
    className?: string
    placeholder?: string
}

// Lo script di Google Maps vive su window, fuori da React: si legge con
// useSyncExternalStore invece di copiarlo in uno stato dentro un effetto.
// Il flag di modulo copre il caso in cui sia questo componente a caricarlo.
let scriptMappeSegnalato = false
const listenerScriptMappe = new Set<() => void>()

function subscribeScriptMappe(onStoreChange: () => void) {
    listenerScriptMappe.add(onStoreChange)
    return () => {
        listenerScriptMappe.delete(onStoreChange)
    }
}

function getScriptMappeCaricato() {
    if (typeof window === 'undefined') return false
    return scriptMappeSegnalato || !!window.google?.maps?.places
}

// Lato server window non esiste: lo script non è mai caricato.
function getServerScriptMappeCaricato() {
    return false
}

function segnalaScriptMappeCaricato() {
    scriptMappeSegnalato = true
    listenerScriptMappe.forEach((listener) => listener())
}

export function AddressAutocomplete({
    value,
    onChange,
    disabled,
    className,
    placeholder = 'Cerca indirizzo...',
}: AddressAutocompleteProps) {
    const [open, setOpen] = React.useState(false)

    // Vero se lo script di Google Maps è già disponibile su window
    const scriptLoaded = React.useSyncExternalStore(
        subscribeScriptMappe,
        getScriptMappeCaricato,
        getServerScriptMappeCaricato
    )

    const {
        ready,
        value: searchValue,
        suggestions: { status, data },
        setValue: setSearchValue,
        clearSuggestions,
    } = usePlacesAutocomplete({
        requestOptions: {
            componentRestrictions: { country: 'it' },
            language: 'it',
        },
        debounce: 300,
        initOnMount: scriptLoaded,
    })

    // Sync internal search value with prop value initially
    React.useEffect(() => {
        if (value && value !== searchValue) {
            setSearchValue(value, false)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]) // Only sync single way to allow typing

    const handleSelect = async (address: string) => {
        setSearchValue(address, false)
        clearSuggestions()
        onChange(address)
        setOpen(false)

        // Optional: Get coordinates if needed
        try {
            await getGeocode({ address })
            // const { lat, lng } = await getLatLng(results[0])
            // logger.info('📍 Coordinates: ', { lat, lng })
        } catch (error) {
            logger.error('Error: ', error)
        }
    }

    return (
        <div className={cn('relative w-full', className)}>
            {!scriptLoaded && (
                <Script
                    src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
                    onLoad={segnalaScriptMappeCaricato}
                    strategy="lazyOnload"
                />
            )}

            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className={cn('w-full justify-between', !value && 'text-muted-foreground')}
                        disabled={disabled || !scriptLoaded}
                    >
                        {value ? (
                            <span className="truncate">{value}</span>
                        ) : (
                            <span>{scriptLoaded ? placeholder : 'Caricamento mappe...'}</span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command shouldFilter={false}>
                        {/* Disable internal filtering, use Google's results */}
                        <CommandInput
                            placeholder={placeholder}
                            value={searchValue}
                            onValueChange={(val) => {
                                setSearchValue(val)
                            }}
                            disabled={!ready}
                        />
                        <CommandList>
                            <CommandEmpty>
                                {!searchValue ? 'Digita per cercare...' : status === 'ZERO_RESULTS' ? 'Nessun risultato.' : ''}
                            </CommandEmpty>
                            {status === 'OK' && (
                                <CommandGroup heading="Suggerimenti">
                                    {data.map(({ place_id, description }) => (
                                        <CommandItem
                                            key={place_id}
                                            value={description}
                                            onSelect={handleSelect}
                                        >
                                            <Check
                                                className={cn(
                                                    'mr-2 h-4 w-4',
                                                    value === description ? 'opacity-100' : 'opacity-0'
                                                )}
                                            />
                                            {description}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            )}
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    )
}
