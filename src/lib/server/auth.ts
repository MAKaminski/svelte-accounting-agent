import { createHmac } from 'node:crypto';
export const sessionToken = (passcode: string) => createHmac('sha256', passcode).update('laceluxx-books-session').digest('hex');
