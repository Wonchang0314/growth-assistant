/** 출제 지침을 저장하는 설정 키 (설계 문서 5.4). 값은 규칙 한 줄에 하나다. */
export const GUIDELINE_KEY = 'quiz.guideline';

const clean = (rule: string) => rule.replace(/\s+/g, ' ').trim();

export const parseGuideline = (value: string | undefined): string[] =>
  (value ?? '')
    .split('\n')
    .map(clean)
    .filter((r) => r.length > 0);

export const formatGuideline = (rules: readonly string[]): string => rules.join('\n');

/** 규칙을 더하고 뺀다. 이미 있는 규칙은 다시 더하지 않는다. [notFound]는 지울 규칙 중 목록에 없던 것이다. */
export function editGuideline(
  rules: readonly string[],
  edit: { readonly add: readonly string[]; readonly remove: readonly string[] },
): { rules: string[]; notFound: string[] } {
  const remove = new Set(edit.remove.map(clean));
  const kept = rules.filter((r) => !remove.has(r));
  const added = edit.add.map(clean).filter((r) => r.length > 0);
  return {
    rules: [...new Set([...kept, ...added])],
    notFound: [...remove].filter((r) => !rules.includes(r)),
  };
}
