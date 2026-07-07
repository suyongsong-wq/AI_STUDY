// GET /api/toss/config — 토스 클라이언트 키 (공개값)
module.exports = (req, res) => {
  const clientKey = process.env.TOSS_CLIENT_KEY || '';
  if (!clientKey) return res.status(500).json({ error: '토스 클라이언트 키가 설정되지 않았어요.' });
  res.status(200).json({ clientKey });
};
