const { customAlphabet } = require('nanoid');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بدون أحرف/أرقام ملتبسة
const genCode = customAlphabet(ALPHABET, 8);
const genReferralCode = customAlphabet(ALPHABET, 6);
const genOtp = customAlphabet('0123456789', 6);

module.exports = {
  generateTaskAccessCode: () => genCode(),
  generateReferralCode: () => genReferralCode(),
  generateOtp: () => genOtp(),
};
