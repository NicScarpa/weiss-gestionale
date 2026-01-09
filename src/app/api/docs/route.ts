import { NextResponse } from 'next/server'
import { getApiDocs } from '@/lib/swagger'

/**
 * @swagger
 * /api/docs:
 *   get:
 *     summary: Get OpenAPI specification
 *     description: Returns the OpenAPI 3.0 specification for this API
 *     tags:
 *       - Documentation
 *     responses:
 *       200:
 *         description: OpenAPI specification
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
export async function GET() {
  const spec = await getApiDocs()
  return NextResponse.json(spec)
}
