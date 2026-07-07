// POST /api/payments/confirm — 토스 결제 승인 (Secret Key는 서버에만 · 반드시 서버에서)
module.exports = async (req, res) => {
  const secret = process.env.TOSS_SECRET_KEY || '';
  if (!secret) return res.status(500).json({ error: 'TOSS_SECRET_KEY가 없어요.' });
  try {
    const body = req.body || {};
    const { paymentKey, orderId, amount } = body;
    if (!paymentKey || !orderId || amount == null) {
      return res.status(400).json({ error: '필수 파라미터(paymentKey/orderId/amount)가 없어요.' });
    }
    const basic = Buffer.from(secret + ':').toString('base64');
    const r = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: { 'Authorization': 'Basic ' + basic, 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentKey, orderId, amount: Number(amount) }),
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: '결제 승인 처리 중 오류: ' + e.message });
  }
};
