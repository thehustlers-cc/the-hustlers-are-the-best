import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const questionSchema = z.object({
  type: z.enum(['MCQ', 'OPEN_ENDED', 'SHORT_ANSWER']),
  question: z.string().min(1, 'La question est requise'),
  points: z.number().positive(),
  order: z.number().int().nonnegative(),
  options: z.array(z.object({
    optionText: z.string(),
    isCorrect: z.boolean(),
    order: z.number().int().nonnegative(),
  })).optional(),
});

const examSchema = z.object({
  title: z.string().min(1, 'Le titre est requis'),
  description: z.string().optional(),
  duration: z.number().int().positive('La durée doit être positive'),
  maxAttempts: z.number().int().positive().default(1),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  passingScore: z.number().min(0).max(100).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
  questions: z.array(questionSchema),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session || (session.role !== 'TEACHER' && session.role !== 'ADMIN')) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = examSchema.parse(body);

    const exam = await prisma.exam.create({
      data: {
        title: validatedData.title,
        description: validatedData.description,
        duration: validatedData.duration,
        maxAttempts: validatedData.maxAttempts,
        startDate: new Date(validatedData.startDate),
        endDate: new Date(validatedData.endDate),
        passingScore: validatedData.passingScore,
        status: validatedData.status,
        creatorId: session.userId,
        questions: {
          create: validatedData.questions.map((q) => ({
            type: q.type,
            question: q.question,
            points: q.points,
            order: q.order,
            options: q.options ? {
              create: q.options,
            } : undefined,
          })),
        },
      },
      include: {
        questions: {
          include: {
            options: true,
          },
        },
      },
    });

    return NextResponse.json({
      exam,
      message: 'Examen créé avec succès',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error('Create exam error:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la création de l\'examen' },
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
    const status = searchParams.get('status');

    let exams;

    if (session.role === 'STUDENT') {
      exams = await prisma.exam.findMany({
        where: {
          status: 'PUBLISHED',
          startDate: { lte: new Date() },
          endDate: { gte: new Date() },
        },
        include: {
          creator: {
            select: {
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              questions: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    } else {
      const where: any = {};
      
      if (session.role === 'TEACHER') {
        where.creatorId = session.userId;
      }
      
      if (status) {
        where.status = status;
      }

      exams = await prisma.exam.findMany({
        where,
        include: {
          creator: {
            select: {
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              questions: true,
              submissions: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    }

    return NextResponse.json({ exams });
  } catch (error) {
    console.error('Get exams error:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des examens' },
      { status: 500 }
    );
  }
}
