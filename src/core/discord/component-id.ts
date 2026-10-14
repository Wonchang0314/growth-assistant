/**
 * 버튼·선택 메뉴의 custom_id 규칙: `모듈:동작:인자1:인자2…` (Discord 제한 100자).
 * 예: `quiz:answer:42:B`. 처리기는 [module]로 고르고 [action]과 [args]로 해석한다.
 */
export interface ComponentId {
  readonly module: string;
  readonly action: string;
  readonly args: readonly string[];
}

export const COMPONENT_ID_MAX_LENGTH = 100;
const SEPARATOR = ':';

export function encodeComponentId({
  module,
  action,
  args = [],
}: Omit<ComponentId, 'args'> & { args?: readonly string[] }): string {
  if (module === '' || action === '') throw new Error('module과 action은 비어 있을 수 없다');
  const parts = [module, action, ...args];
  if (parts.some((part) => part.includes(SEPARATOR))) {
    throw new Error(`'${SEPARATOR}'는 쓸 수 없다: ${parts.join(',')}`);
  }
  const encoded = parts.join(SEPARATOR);
  if (encoded.length > COMPONENT_ID_MAX_LENGTH) {
    throw new Error(`custom_id가 ${COMPONENT_ID_MAX_LENGTH}자를 넘는다: ${encoded}`);
  }
  return encoded;
}

/** 이 규칙을 따르지 않는 ID면 undefined. */
export function decodeComponentId(raw: string): ComponentId | undefined {
  const [module, action, ...args] = raw.split(SEPARATOR);
  if (!module || !action) return undefined;
  return { module, action, args };
}
