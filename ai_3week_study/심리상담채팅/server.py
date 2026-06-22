# ========================================
# 마음 상담소 — 심리상담 채팅 서버 (Python 버전)
# Python3 표준 라이브러리만 사용 (설치 불필요)
#   - http.server : 정적 파일 서빙 + API 엔드포인트
#   - urllib       : OpenAI Chat Completions API 호출
# 실행: python3 server.py  →  http://localhost:3456
#
# server.js(Node)와 동일하게 동작합니다. Node가 설치되어 있으면
# `node server.js`를, 아니면 이 파일을 사용하세요.
# ========================================

import os
import json
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ---------------------------------------
# 설정
# ---------------------------------------
PORT = int(os.environ.get("PORT", 3456))

# API 키는 서버에서만 사용 (클라이언트에 절대 노출 금지)
# 반드시 환경변수 OPENAI_API_KEY 로 주입 (코드에 하드코딩 금지)
OPENAI_API_KEY = (os.environ.get("OPENAI_API_KEY") or "").strip()
if not OPENAI_API_KEY:
    print("⚠️  OPENAI_API_KEY 환경변수가 설정되지 않았습니다.")

OPENAI_MODEL = "gpt-4o-mini"

# 상담사 "김다온" 시스템 프롬프트
SYSTEM_PROMPT = """당신은 "김다온"이라는 이름의 따뜻하고 공감적인 한국어 심리상담사입니다.

[역할과 태도]
- 내담자의 이야기를 진심으로 경청하고, 감정을 있는 그대로 공감하며 받아들입니다.
- 판단하거나 가르치려 하지 않고, 내담자가 스스로 마음을 들여다볼 수 있도록 부드럽게 곁에서 함께합니다.
- 따뜻하고 다정한 말투를 사용하되, 과하지 않고 진솔하게 이야기합니다.

[지켜야 할 원칙]
- 의학적 진단이나 처방(예: 특정 질환 단정, 약물 권유)은 절대 하지 않습니다.
- 섣부른 조언이나 해결책 제시보다는, 경청과 공감, 그리고 마음을 열 수 있는 부드러운 질문을 우선합니다.
- 내담자의 감정을 먼저 충분히 반영(reflection)한 뒤, 더 이야기를 이어갈 수 있는 열린 질문을 한두 개 건넵니다.
- 답변은 한국어로, 보통 2~4문장 정도로 따뜻하고 간결하게 작성합니다.

[위기 상황]
- 자해, 자살, 타인을 해치려는 생각 등 위급한 신호가 보이면, 진심 어린 공감과 함께 전문기관(예: 정신건강 위기상담전화 1577-0199, 자살예방상담전화 109)에 연락하도록 부드럽게 안내합니다."""


# ---------------------------------------
# OpenAI Chat Completions 호출
# ---------------------------------------
def call_openai(messages):
    payload = json.dumps(
        {
            "model": OPENAI_MODEL,
            "messages": [{"role": "system", "content": SYSTEM_PROMPT}] + messages,
            "temperature": 0.8,
            "max_tokens": 500,
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + OPENAI_API_KEY,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "ignore")
        try:
            msg = json.loads(body).get("error", {}).get("message")
        except Exception:
            msg = None
        raise RuntimeError(msg or ("OpenAI API 오류 (status %s)" % e.code))
    except Exception as e:
        raise RuntimeError("OpenAI 호출 실패: " + str(e))

    try:
        reply = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        raise RuntimeError("OpenAI 응답에서 메시지를 찾을 수 없습니다.")
    return reply.strip()


# ---------------------------------------
# 요청 핸들러
# ---------------------------------------
class Handler(BaseHTTPRequestHandler):
    def _send_json(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_index(self):
        try:
            path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "index.html")
            with open(path, "rb") as f:
                content = f.read()
        except OSError:
            self.send_response(500)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write("index.html을 찾을 수 없습니다.".encode("utf-8"))
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        url = self.path.split("?")[0]
        if url in ("/", "/index.html"):
            return self._serve_index()
        self._send_json(404, {"success": False, "message": "요청하신 경로를 찾을 수 없습니다."})

    def do_POST(self):
        url = self.path.split("?")[0]
        if url != "/api/chat":
            return self._send_json(404, {"success": False, "message": "요청하신 경로를 찾을 수 없습니다."})

        length = int(self.headers.get("Content-Length", 0) or 0)
        if length > 1_000_000:
            return self._send_json(400, {"success": False, "message": "요청 본문이 너무 큽니다."})

        raw = self.rfile.read(length) if length else b""
        try:
            body = json.loads(raw.decode("utf-8")) if raw else {}
        except Exception:
            return self._send_json(400, {"success": False, "message": "잘못된 JSON 형식입니다."})

        messages = body.get("messages")
        if not isinstance(messages, list) or len(messages) == 0:
            return self._send_json(400, {"success": False, "message": "messages 배열이 필요합니다."})

        cleaned = []
        for m in messages:
            if isinstance(m, dict) and isinstance(m.get("content"), str) and m["content"].strip():
                role = "assistant" if m.get("role") == "assistant" else "user"
                cleaned.append({"role": role, "content": m["content"]})

        if not cleaned:
            return self._send_json(400, {"success": False, "message": "유효한 메시지가 없습니다."})

        try:
            reply = call_openai(cleaned)
        except Exception as e:
            print("[POST /api/chat] 오류:", str(e))
            return self._send_json(
                500,
                {"success": False, "message": "상담사 응답을 가져오는 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요."},
            )
        return self._send_json(200, {"success": True, "data": {"reply": reply}})

    # 기본 액세스 로그 간결화
    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print("마음 상담소 서버 실행 중 → http://localhost:%d" % PORT)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()
