import { describe, expect, it, vi } from 'vitest';
import { QuizReviewService } from '../../application/quiz-review.service.js';
import { GetReviewSetTool } from './get-review-set.tool.js';

function tool(set: unknown) {
  const review = { reviewSet: vi.fn().mockResolvedValue(set) };
  return { handler: new GetReviewSetTool(review as unknown as QuizReviewService), review };
}

describe('복습 카드', () => {
  it('복습 서비스가 고른 문제를 순서대로 모두 카드와 글로 넘긴다', async () => {
    const questions = [25, 45].map((questionId) => ({
      questionId,
      concept: '개념',
      type: 'MULTIPLE_CHOICE',
      prompt: `질문 ${questionId}`,
      choices: [`보기 ${questionId}`],
    }));
    const { handler, review } = tool({ kind: 'READY', questions, preparing: [], failed: [], remainingToday: 7 });
    const result = await handler.handle({});
    expect(review.reviewSet).toHaveBeenCalledExactlyOnceWith({});
    expect(result.data?.questions).toEqual(questions);
    expect(result.text).toBe(
      '[문제 25] 개념 (객관식)\n질문 25\n1. 보기 25\n\n[문제 45] 개념 (객관식)\n질문 45\n1. 보기 45',
    );
    expect(handler.view.uri).toBe('ui://growth-assistant/review-card.html');
  });
  it('문제가 없으면 지정한 문장만 반환한다', async () => {
    const { handler } = tool({ kind: 'READY', questions: [], preparing: [], failed: [], remainingToday: 10 });
    expect((await handler.handle({})).text).toBe('오늘 복습할 문제가 없어요');
  });
  it('오늘 몫을 다 풀었으면 카드가 알아볼 상태를 싣고, 모델에게 more로 더 낼 수 있다고 알린다', async () => {
    const { handler } = tool({ kind: 'DAILY_LIMIT_REACHED' });
    const result = await handler.handle({});
    expect(result.data).toEqual({ kind: 'DAILY_LIMIT_REACHED', questions: [] });
    expect(result.text).toContain('more를 true로 다시 불러');
  });
  it('더 풀기 요청은 그대로 복습 서비스에 넘긴다', async () => {
    const { handler, review } = tool({ kind: 'READY', questions: [], preparing: [], failed: [], remainingToday: null });
    await handler.handle({ more: true });
    expect(review.reviewSet).toHaveBeenCalledExactlyOnceWith({ more: true });
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
