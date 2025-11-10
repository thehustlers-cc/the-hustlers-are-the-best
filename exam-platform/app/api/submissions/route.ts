import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session || session.role !== 'STUDENT') {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 403 }
      );
    }

    const { examId } = await request.json();

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        questions: true,
      },
    });

    if (!exam) {
      return NextResponse.json(
        { error: 'Examen non trouvé' },
        { status: 404 }
      );
    }

    if (exam.status !== 'PUBLISHED') {
      return NextResponse.json(
        { error: 'Cet examen n\'est pas disponible' },
        { status: 403 }
      );
    }

    const now = new Date();
    if (now < exam.startDate || now > exam.endDate) {
      return NextResponse.json(
        { error: 'Cet examen n\'est pas disponible actuellement' },
        { status: 403 }
      );
    }

    const existingSubmissions = await prisma.examSubmission.count({
      where: {
        examId,
        studentId: session.userId,
      },
    });

    if (existingSubmissions >= exam.maxAttempts) {
      return NextResponse.json(
        { error: 'Nombre maximum de tentatives atteint' },
        { status: 403 }
      );
    }

    const totalPoints = exam.questions.reduce((sum, q) => sum + q.points, 0);

    const submission = await prisma.examSubmission.create({
      data: {
        examId,
        studentId: session.userId,
        totalPoints,
        activityLogs: {
          create: {
            action: 'EXAM_STARTED',
            metadata: JSON.stringify({ timestamp: new Date() }),
          },
        },
      },
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
      },
    });

    return NextResponse.json({
      submission,
      message: 'Examen démarré',
    });
  } catch (error) {
    console.error('Start exam error:', error);
    return NextResponse.json(
      { error: 'Erreur lors du démarrage de l\'examen' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const examId = searchParams.get('examId');

    let submissions;

    if (session.role === 'STUDENT') {
      submissions = await prisma.examSubmission.findMany({
        where: {
          studentId: session.userId,
          ...(examId && { examId }),
        },
        include: {
          exam: {
            select: {
              title: true,
              duration: true,
            },
          },
        },
        orderBy: {
          startedAt: 'desc',
        },
      });
    } else {
      const where: any = {};
      
      if (examId) {
        where.examId = examId;
        
        if (session.role === 'TEACHER') {
          const exam = await prisma.exam.findUnique({
            where: { id: examId },
          });
          
          if (!exam || exam.creatorId !== session.userId) {
            return NextResponse.json(
              { error: 'Non autorisé' },
              { status: 403 }
            );
          }
        }
      }

      submissions = await prisma.examSubmission.findMany({
        where,
        include: {
          exam: {
            select: {
              title: true,
              duration: true,
            },
          },
          student: {
            select: {
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          startedAt: 'desc',
        },
      });
    }

    return NextResponse.json({ submissions });
  } catch (error) {
    console.error('Get submissions error:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des soumissions' },
      { status: 500 }
    );
  }
}
