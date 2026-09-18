import crypto from 'node:crypto';

function randomDigits(n: number): string {
  return crypto.randomInt(0, 10 ** n).toString().padStart(n, '0');
}

export function genComplaintCode(): string {
  return `TC-${randomDigits(4)}`;
}

export function genCaseNumber(): string {
  const year = new Date().getFullYear();
  return `SC/ST-${year}/${randomDigits(4)}`;
}

export function genVictimDisplayCode(): string {
  return `V-${randomDigits(5)}`;
}

export function genOtp(): string {
  return randomDigits(6);
}
