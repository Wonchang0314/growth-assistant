import { isAcceptedAnswer, type QuestionDraft } from './quiz-question.js';

/** 정답을 모르는 검토자가 문제만 보고 푼 결과. 객관식 [answer]는 고른 보기의 글이다. */
export interface Solution {
  readonly answer: string;
  /** 정답이 (빈칸은 표기 차이를 빼고) 하나로 정해지는가. */
  readonly singleAnswer: boolean;
  readonly problems: readonly string[];
}

/** 검증에 걸린 이유. 검토자가 정답과 같은 답을 골랐고 다른 문제를 말하지 않았으면 빈 배열이다. */
export function solutionProblems(draft: QuestionDraft, solution: Solution): string[] {
  const sameAnswer =
    draft.type === 'MULTIPLE_CHOICE' ? solution.answer === draft.answer : isAcceptedAnswer(draft, solution.answer);
  if (sameAnswer && solution.singleAnswer && solution.problems.length === 0) return [];
  return [
    ...(sameAnswer
      ? []
      : [
          draft.type === 'MULTIPLE_CHOICE'
            ? `정답을 모르고 푼 검토자가 "${solution.answer}"를 골랐다`
            : `정답을 모르고 푼 검토자가 "${solution.answer}"라고 답했다. 맞는 표기면 acceptedAnswers에 넣고, 아니면 답이 하나로 정해지게 고친다`,
        ]),
    ...(solution.singleAnswer ? [] : ['정답이 하나로 정해지지 않는다']),
    ...solution.problems,
  ];
}
