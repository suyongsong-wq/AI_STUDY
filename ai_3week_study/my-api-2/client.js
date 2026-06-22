// ============================================================
//  client.js
//  버튼 클릭 시 /api/greeting 을 fetch 로 호출하고
//  응답(인사말 + 시간)을 화면에 표시한다.
// ============================================================

const btn = document.getElementById('greetBtn');
const resultEl = document.getElementById('result');

// 결과 영역에 인사말 + 시간 렌더링
function renderResult({ greeting, time }) {
  resultEl.classList.remove('error');
  resultEl.innerHTML = `
    <span class="greeting">${greeting}</span>
    <span class="time">현재 시간 (KST): ${time}</span>
  `;
}

// 에러 메시지 렌더링
function renderError(message) {
  resultEl.classList.add('error');
  resultEl.innerHTML = `<span class="greeting">${message}</span>`;
}

// 버튼 클릭 핸들러
btn.addEventListener('click', async () => {
  btn.disabled = true;
  resultEl.classList.remove('error');
  resultEl.innerHTML = '<span class="placeholder">요청 중...</span>';

  try {
    const res = await fetch('/api/greeting');
    const json = await res.json();

    if (json.success && json.data) {
      renderResult(json.data);
    } else {
      renderError(json.message || '응답을 처리할 수 없습니다.');
    }
  } catch (err) {
    renderError('서버에 연결할 수 없습니다.');
  } finally {
    btn.disabled = false;
  }
});
