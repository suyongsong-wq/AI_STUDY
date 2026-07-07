// POST /api/imagekit/auth — ImageKit 업로드 서명 (Private Key는 서버에만)
const crypto = require('crypto');

module.exports = (req, res) => {
  const priv = process.env.IMAGEKIT_PRIVATE_KEY || '';
  if (!priv) return res.status(500).json({ error: 'IMAGEKIT_PRIVATE_KEY가 없어요.' });
  const token = crypto.randomUUID();
  const expire = Math.floor(Date.now() / 1000) + 60 * 30; // 30분
  const signature = crypto.createHmac('sha1', priv).update(token + expire).digest('hex');
  res.status(200).json({ token, expire, signature });
};
