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

    const submission = await prisma.examSubmission.findUnique({
      where: { id },
      include: {
        exam: {
          include: {
            questions: {
              include: {
                options: true,
              },
              orderBy: {
                order: 'asc',
              },
            },
          },
        },
        student: {
          select: {
            name: true,
            email: true,
          },
        },
        answers: {
          include: {
            question: {
              include: {
                options: true,
              },
            },
          },
        },
      },
    });

    if (!submission) {
      return NextResponse.json(
        { error: 'Soumission non trouvée' },
        { status: 404 }
      );
    }

    if (
      session.role === 'STUDENT' &&
      submission.studentId !== session.userId
    ) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 403 }
      );
    }

    if (session.role === 'TEACHER' && submission.exam.creatorId !== session.userId) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 403 }
      );
    }

    return NextResponse.json({ submission });
  } catch (error) {
    console.error('Get submission error:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de la soumission' },
      { status: 500 }
    );
  }
}
