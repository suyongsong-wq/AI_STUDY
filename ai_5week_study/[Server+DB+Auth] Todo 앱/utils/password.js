// 비밀번호 해싱 유틸 (bcryptjs)
// 평문 비밀번호는 절대 저장/비교하지 않습니다. 항상 해시만 다룹니다.
const bcrypt = require('bcryptjs');

// salt rounds: 보안 권장값(>= 10). 값이 클수록 안전하지만 느려집니다.
const SALT_ROUNDS = 10;

// 평문 → 해시
async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

// 평문과 해시 비교 (true/false)
async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

module.exports = { hashPassword, comparePassword };
