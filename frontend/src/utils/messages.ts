export function rejectionSms(firstName: string): string {
  return `Hi ${firstName || '[name]'}, thank you for your enquiry with Fleming Lettings. Unfortunately, we are unable to proceed with your application at this time. If you would like us to continue to search for similar properties that meet your requirements, then please let us know. All the very best in your search!`;
}
