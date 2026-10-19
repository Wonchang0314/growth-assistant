import { describe, expect, it, vi } from 'vitest';
import { QuizReviewService } from '../../application/quiz-review.service.js';
import { GetReviewSetTool } from './get-review-set.tool.js';

function tool(set: unknown) {
  const review = { reviewSet: vi.fn().mockResolvedValue(set) };
  return { handler: new GetReviewSetTool(review as unknown as QuizReviewService), review };
}

describe('복습 카드', () => {
  it('복습 서비스가 고른 순서를 보존하고 첫 문제만 안내한다', async () => {
    const questions = [25, 45].map((questionId) => ({
      questionId,
      concept: '개념',
      type: 'MULTIPLE_CHOICE',
      prompt: `질문 ${questionId}`,
      choices: ['보기'],
    }));
    const { handler, review } = tool({ kind: 'READY', questions, preparing: [], failed: [], remainingToday: 7 });
    const result = await handler.handle({});
    expect(review.reviewSet).toHaveBeenCalledExactlyOnceWith({});
    expect(result.data?.questions).toEqual(questions);
    expect(result.text).toContain('질문 25');
    expect(result.text).not.toContain('질문 45');
    expect(handler.view.html).toContain('payload.questions[0]');
  });
  it('문제가 없으면 지정한 문장만 반환한다', async () => {
    const { handler } = tool({ kind: 'READY', questions: [], preparing: [], failed: [], remainingToday: 10 });
    expect((await handler.handle({})).text).toBe('오늘 복습할 문제가 없어요');
  });
  it('준비 중이거나 실패한 개념은 상태만 반환한다', async () => {
    const { handler } = tool({ kind: 'READY', questions: [], preparing: ['A'], failed: ['B'], remainingToday: 10 });
    const result = await handler.handle({});
    expect(result.text).toContain('문제를 만드는 중');
    expect(result.text).toContain('문제를 만들지 못함');
    expect(result.text).not.toContain('오늘 더 풀');
    expect(result.text).not.toContain('오늘 복습할 문제가 없어요');
  });
});
