import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PATCH /api/regole-categorizzazione/[id] - Modifica regola
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()

  const regola = await prisma.categorizationRule.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.keywords !== undefined && { keywords: body.keywords }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.budgetCategoryId !== undefined && { budgetCategoryId: body.budgetCategoryId }),
      ...(body.autoVerify !== undefined && { autoVerify: body.autoVerify }),
      ...(body.autoHide !== undefined && { autoHide: body.autoHide }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
  })

  return NextResponse.json(regola)
}

// DELETE /api/regole-categorizzazione/[id] - Elimina regola
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await prisma.categorizationRule.delete({
    where: { id: params.id },
  })

  return NextResponse.json({ success: true })
}
