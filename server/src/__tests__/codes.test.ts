import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genComplaintCode, genCaseNumber, genVictimDisplayCode, genOtp } from '../lib/codes.js';

test('genComplaintCode matches TC-#### format', () => {
  assert.match(genComplaintCode(), /^TC-\d{4}$/);
});

test('genVictimDisplayCode matches V-##### format', () => {
  assert.match(genVictimDisplayCode(), /^V-\d{5}$/);
});

test('genCaseNumber includes the current year', () => {
  const year = new Date().getFullYear();
  assert.match(genCaseNumber(), new RegExp(`^SC/ST-${year}/\\d{4}$`));
});

test('genOtp is always 6 digits', () => {
  for (let i = 0; i < 20; i += 1) {
    assert.match(genOtp(), /^\d{6}$/);
  }
});
