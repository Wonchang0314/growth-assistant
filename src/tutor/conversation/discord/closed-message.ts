/** 대화를 닫을 때 스레드에 남기는 안내. 요약이 있으면 붙인다. */
export function closedMessage(headline: string, summary: string | null): string {
  return summary === null ? headline : `${headline}\n\n**요약**\n${summary}`;
}
