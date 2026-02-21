import { defineConfig } from '@prisma/config'
import { config } from 'dotenv'

// Carica le variabili d'ambiente
config()

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
})
