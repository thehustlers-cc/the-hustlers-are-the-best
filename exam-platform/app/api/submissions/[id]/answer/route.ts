import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const { id } = await params;

    if (!session || session.role !== 'STUDENT') {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 403 }
      );
    }

    const { questionId, answerText, selectedOptions } = await request.json();

    const submission = await prisma.examSubmission.findUnique({
      where: { id },
      include: {
        exam: true,
      },
    });

    if (!submission) {
      return NextResponse.json(
        { error: 'Soumission non trouvée' },
        { status: 404 }
      );
    }

    if (submission.studentId !== session.userId) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 403 }
      );
    }

    if (submission.status === 'SUBMITTED') {
      return NextResponse.json(
        { error: 'Cet examen a déjà été soumis' },
        { status: 403 }
      );
    }

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: {
        options: true,
      },
    });

    if (!question || question.examId !== submission.examId) {
      return NextResponse.json(
        { error: 'Question non trouvée' },
        { status: 404 }
      );
    }

    let isCorrect: boolean | null = null;
    let pointsAwarded: number | null = null;

    if (question.type === 'MCQ' && selectedOptions) {
      const correctOptions = question.options
        .filter((opt) => opt.isCorrect)
        .map((opt) => opt.id)
        .sort();
      
      const selectedSorted = [...selectedOptions].sort();
      
      isCorrect = JSON.stringify(correctOptions) === JSON.stringify(selectedSorted);
      pointsAwarded = isCorrect ? question.points : 0;
    }

    const answer = await prisma.answer.upsert({
      where: {
        submissionId_questionId: {
          submissionId: id,
          questionId,
        },
      },
      update: {
        answerText,
        selectedOptions: selectedOptions || [],
        isCorrect,
        pointsAwarded,
      },
      create: {
        submissionId: id,
        questionId,
        studentId: session.userId,
        answerText,
        selectedOptions: selectedOptions || [],
        isCorrect,
        pointsAwarded,
      },
    });

    await prisma.activityLog.create({
      data: {
        submissionId: id,
        action: 'ANSWER_SAVED',
        metadata: JSON.stringify({ questionId, timestamp: new Date() }),
      },
    });

    return NextResponse.json({
      answer,
      message: 'Réponse enregistrée',
    });
  } catch (error) {
    console.error('Save answer error:', error);
    return NextResponse.json(
      { error: 'Erreur lors de l\'enregistrement de la réponse' },
      { status: 500 }
    );
  }
}
