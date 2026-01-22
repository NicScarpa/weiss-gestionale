#!/bin/bash

# Script per sostituire console.* con logger.*
# Uso: ./scripts/replace-console-with-logger.sh <file>

FILE=$1

if [ -z "$FILE" ]; then
    echo "Uso: $0 <file>"
    exit 1
fi

# Verifica se il file esiste
if [ ! -f "$FILE" ]; then
    echo "File non trovato: $FILE"
    exit 1
fi

# Verifica se l'import del logger è già presente
if ! grep -q "import.*logger.*from.*@/lib/logger" "$FILE" && ! grep -q "import.*logger.*from.*'.*lib/logger'" "$FILE"; then
    # Aggiungi import del logger dopo il primo import o all'inizio
    if grep -q "^import" "$FILE"; then
        # Trova l'ultima riga di import e aggiungi dopo
        sed -i '' '/^import/!b;:a;n;/^import/ba;i\
import { logger } from "@/lib/logger"
' "$FILE"
    else
        # Aggiungi all'inizio
        sed -i '' '1i\
import { logger } from "@/lib/logger"\
' "$FILE"
    fi
fi

# Sostituisci console.log con logger.info
sed -i '' 's/console\.log(/logger.info(/g' "$FILE"

# Sostituisci console.error con logger.error
sed -i '' 's/console\.error(/logger.error(/g' "$FILE"

# Sostituisci console.warn con logger.warn
sed -i '' 's/console\.warn(/logger.warn(/g' "$FILE"

# Sostituisci console.debug con logger.debug
sed -i '' 's/console\.debug(/logger.debug(/g' "$FILE"

echo "Processato: $FILE"
