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
