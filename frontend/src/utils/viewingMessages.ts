export const formatViewingDate = (date: string): string => {
  if (!date) return '[date]';
  const parts = date.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : date;
};

export const viewingSmsPreview = (firstName: string, location: string, date: string, time: string): string => {
  const timeText = time ? ` at ${time}` : '';
  return `Hi ${firstName || '[name]'}, your appointment has been booked to view ${location || '[property address]'} on ${formatViewingDate(date)}${timeText}. If you are running late or need to reschedule then please call our offices on 01902 212 415. See you soon!`;
};

export const viewingEmailPreview = (name: string, location: string, date: string, time: string): string => {
  const dateAndTime = `${formatViewingDate(date)}${time ? ` at ${time}` : ''}`;
  return `Subject: Your viewing with Fleming Lettings at ${location || '[property address]'}\n\nHi ${name || '[name]'},\n\nThis is to confirm your viewing at:\n${location || '[property address]'}\nDate: ${dateAndTime}\n\nPlease arrive on time. If you need to reschedule, reply to this email or call us.`;
};
