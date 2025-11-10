import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const { id } = await params;

    if (!session) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      );
    }

    const exam = await prisma.exam.findUnique({
      where: { id },
      include: {
        creator: {
          select: {
            name: true,
            email: true,
          },
        },
        questions: {
          include: {
            options: true,
          },
          orderBy: {
            order: 'asc',
          },
        },
        _count: {
          select: {
            submissions: true,
          },
        },
      },
    });

    if (!exam) {
      return NextResponse.json(
        { error: 'Examen non trouvé' },
        { status: 404 }
      );
    }

    if (
      session.role === 'STUDENT' &&
      (exam.status !== 'PUBLISHED' ||
        new Date() < exam.startDate ||
        new Date() > exam.endDate)
    ) {
      return NextResponse.json(
        { error: 'Cet examen n\'est pas disponible' },
        { status: 403 }
      );
    }

    if (session.role === 'TEACHER' && exam.creatorId !== session.userId) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 403 }
      );
    }

    return NextResponse.json({ exam });
  } catch (error) {
    console.error('Get exam error:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de l\'examen' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const { id } = await params;

    if (!session || (session.role !== 'TEACHER' && session.role !== 'ADMIN')) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 403 }
      );
    }

    const exam = await prisma.exam.findUnique({
      where: { id },
    });

    if (!exam) {
      return NextResponse.json(
        { error: 'Examen non trouvé' },
        { status: 404 }
      );
    }

    if (session.role === 'TEACHER' && exam.creatorId !== session.userId) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 403 }
      );
    }

    await prisma.exam.delete({
      where: { id },
    });

    return NextResponse.json({
      message: 'Examen supprimé avec succès',
    });
  } catch (error) {
    console.error('Delete exam error:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la suppression de l\'examen' },
      { status: 500 }
    );
  }
}
