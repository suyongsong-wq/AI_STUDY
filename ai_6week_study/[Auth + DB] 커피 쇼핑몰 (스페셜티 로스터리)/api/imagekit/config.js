// GET /api/imagekit/config — ImageKit 공개 설정 (publicKey, urlEndpoint)
module.exports = (req, res) => {
  const publicKey = process.env.IMAGEKIT_PUBLIC_KEY || '';
  const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT || '';
  if (!publicKey || !urlEndpoint) {
    return res.status(500).json({ error: 'ImageKit 환경변수가 설정되지 않았어요.' });
  }
  res.status(200).json({ publicKey, urlEndpoint });
};
