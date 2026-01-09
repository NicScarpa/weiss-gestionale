import '@testing-library/jest-dom'

// Mock delle variabili d'ambiente per i test
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
process.env.NEXTAUTH_SECRET = 'test-secret-for-vitest'
process.env.NEXTAUTH_URL = 'http://localhost:3000'
