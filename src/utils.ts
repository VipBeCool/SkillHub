export const formatTime = (timeStr: string) => {
  if (!timeStr) return '';
  try {
    const d = new Date(timeStr.replace(' ', 'T'));
    const pad = (n: number) => String(n).padStart(2, '0');
    return `更新于 ${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch (e) {
    return `更新于 ${timeStr.split('T')[0]}`;
  }
};

export const formatTokens = (tokens: number | undefined | null): string => {
  if (tokens === undefined || tokens === null || isNaN(tokens)) return '0';
  if (tokens < 1000) {
    return tokens.toString();
  } else if (tokens < 1000000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  } else {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
};
