import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptField, decryptField, maskContact } from '../services/encryption.service.js';

test('encryptField/decryptField round-trips arbitrary text', () => {
  const plaintext = 'Priya Kumari, Village Bhojpur';
  const encrypted = encryptField(plaintext);
  assert.notEqual(encrypted, plaintext);
  assert.equal(decryptField(encrypted), plaintext);
});

test('encryptField produces different ciphertext for the same input each time (random IV)', () => {
  const a = encryptField('9876543210');
  const b = encryptField('9876543210');
  assert.notEqual(a, b);
  assert.equal(decryptField(a), '9876543210');
  assert.equal(decryptField(b), '9876543210');
});

test('decryptField rejects a tampered ciphertext', () => {
  const encrypted = encryptField('sensitive data');
  const [iv, tag, data] = encrypted.split(':');
  const tampered = [iv, tag, Buffer.from(data, 'base64').reverse().toString('base64')].join(':');
  assert.throws(() => decryptField(tampered));
});

test('maskContact hides the middle of a value, keeps a stable length', () => {
  const masked = maskContact('9876543210');
  assert.equal(masked.length, 10);
  assert.equal(masked.slice(0, 2), '98');
  assert.equal(masked.slice(-2), '10');
  assert.ok(masked.slice(2, -2).split('').every((c) => c === '*'));
});
