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

export function AddressAutocomplete({
    value,
    onChange,
    disabled,
    className,
    placeholder = 'Cerca indirizzo...',
}: AddressAutocompleteProps) {
    const [open, setOpen] = React.useState(false)
    const [scriptLoaded, setScriptLoaded] = React.useState(false)

    // Load Google Maps Script if not already loaded
    React.useEffect(() => {
        if (window.google?.maps?.places) {
            setScriptLoaded(true)
            return
        }
    }, [])

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
                    onLoad={() => setScriptLoaded(true)}
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
