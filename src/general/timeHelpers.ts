/**
 * Convert HH:MM:SS to seconds
 */

export const timeToSeconds = (timeStr: string): number => {
  const [s, m, h] = timeStr.split(':').map(t => parseFloat(t)).reverse();
  return (h ?? 0) * 3600 + (m ?? 0) * 60 + s;
};
/**
 * Convert seconds to HH:MM:SS format
 */

export const secondsToTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
};
