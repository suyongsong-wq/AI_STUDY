const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const INGREDIENTS_DIR = path.join(__dirname, 'ingredients');
const RECIPES_DIR = path.join(__dirname, 'recipes');

app.use(express.json());
app.use(express.static(__dirname));

// ===== 유틸 =====
function ensureDirs() {
  for (const dir of [INGREDIENTS_DIR, RECIPES_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

// ingredients/ 폴더의 모든 .json 재료를 읽어 배열로 반환
function readIngredients() {
  ensureDirs();
  return fs
    .readdirSync(INGREDIENTS_DIR)
    .filter((f) => f.toLowerCase().endsWith('.json'))
    .map((file) => {
      try {
        const raw = fs.readFileSync(path.join(INGREDIENTS_DIR, file), 'utf-8');
        const data = JSON.parse(raw);
        return {
          name: data.name || file.replace(/\.json$/i, ''),
          quantity: data.quantity || '',
          category: data.category || '기타',
          file,
        };
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean);
}

// path traversal 방지: 파일명만 허용
function safeJsonFileName(file) {
  if (!file || file.includes('/') || file.includes('\\') || file.includes('..')) return null;
  if (!file.toLowerCase().endsWith('.json')) return null;
  return file;
}

// ===== API: 재료 목록 =====
app.get('/api/ingredients', (_req, res) => {
  try {
    res.json({ success: true, ingredients: readIngredients() });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ===== API: 재료 추가 (= JSON 파일 1개 생성) =====
app.post('/api/ingredients', (req, res) => {
  try {
    const { name, quantity, category } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: '재료 이름이 필요합니다.' });
    }
    ensureDirs();
    // 한글 이름이어도 안전한 파일명 생성: 타임스탬프 기반 slug
    const base = 'item-' + process.hrtime.bigint().toString(36);
    const file = `${base}.json`;
    const payload = {
      name: String(name).trim(),
      quantity: String(quantity || '').trim(),
      category: String(category || '기타').trim(),
    };
    fs.writeFileSync(path.join(INGREDIENTS_DIR, file), JSON.stringify(payload, null, 2) + '\n', 'utf-8');
    res.json({ success: true, file });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ===== API: 재료 삭제 (= JSON 파일 삭제) =====
app.delete('/api/ingredients/:file', (req, res) => {
  try {
    const file = safeJsonFileName(req.params.file);
    if (!file) return res.status(400).json({ success: false, message: '잘못된 파일명입니다.' });
    const target = path.join(INGREDIENTS_DIR, file);
    if (!fs.existsSync(target)) return res.status(404).json({ success: false, message: '파일이 없습니다.' });
    fs.unlinkSync(target);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ===== 고정 룰 레시피 생성 =====
function generateFeastRecipe(ingredients) {
  const names = ingredients.map((i) => i.name);
  const has = (kw) => names.some((n) => n.includes(kw));
  const qtyOf = (kw) => {
    const found = ingredients.find((i) => i.name.includes(kw));
    return found ? found.quantity : '';
  };

  if (ingredients.length === 0) {
    return {
      title: '재료를 추가해주세요',
      markdown:
        '# 🧊 냉장고가 비어 있어요\n\n`ingredients/` 폴더에 재료 JSON을 추가하거나, 화면에서 재료를 등록한 뒤 다시 시도하세요.\n',
    };
  }

  // 메인 결정
  let mainTitle, mainSteps;
  if (has('라면')) {
    mainTitle = '김치 라면 전골';
    mainSteps = ['냄비에 물 1.2L를 붓고 끓인다.'];
    if (has('김치')) mainSteps.push(`배추김치(${qtyOf('김치')})를 큼직하게 썰어 넣고 5분간 끓여 국물 맛을 낸다.`);
    mainSteps.push('라면 스프를 넣어 국물 간을 맞춘다.');
    if (has('두부')) mainSteps.push(`두부(${qtyOf('두부')})를 큼직하게 썰어 넣는다.`);
    if (has('대파')) mainSteps.push(`대파를 어슷 썰어 올린다.`);
    mainSteps.push('라면 면을 넣고 2분간 끓인다.');
    if (has('계란')) mainSteps.push('계란을 깨뜨려 올리고 뚜껑을 덮어 1분 더 익힌다.');
  } else if (has('밥')) {
    mainTitle = '냉장고 털기 볶음밥';
    mainSteps = ['팬에 기름을 두르고 달군다.'];
    if (has('김치')) mainSteps.push(`김치(${qtyOf('김치')})를 잘게 썰어 볶아 신맛을 날린다.`);
    if (has('대파')) mainSteps.push('대파를 송송 썰어 넣고 파기름을 낸다.');
    mainSteps.push(`밥(${qtyOf('밥')})을 넣고 고슬고슬하게 볶는다.`);
    if (has('계란')) mainSteps.push('가장자리에 계란을 풀어 스크램블하듯 섞는다.');
    mainSteps.push('간장이나 소금으로 간을 맞춘다.');
  } else {
    mainTitle = '냉장고 모둠 볶음';
    mainSteps = ['팬에 기름을 두르고 달군다.'];
    mainSteps.push(`보유 재료(${names.join(', ')})를 먹기 좋게 썬다.`);
    mainSteps.push('센 불에 빠르게 볶는다.');
    mainSteps.push('소금·간장으로 간을 맞춘다.');
  }

  // 사이드 결정
  let sideTitle = null, sideSteps = [];
  if (has('계란')) {
    sideTitle = '대파 계란말이';
    sideSteps = ['계란을 풀고 소금으로 간한다.'];
    if (has('대파')) sideSteps.push('대파를 송송 썰어 계란물에 섞는다.');
    sideSteps.push('기름 두른 팬에 얇게 부어가며 돌돌 말아낸다.');
    sideSteps.push('한 김 식혀 한입 크기로 썬다.');
  } else if (has('두부')) {
    sideTitle = '두부 부침';
    sideSteps = ['두부를 도톰하게 썰어 키친타월로 물기를 뺀다.', '소금을 살짝 뿌린다.', '기름 두른 팬에 노릇하게 양면을 부친다.'];
  }

  const usedLines = ingredients.map((i) => `- ${i.name} (${i.quantity})`).join('\n');
  let md = `# 🍲 ${mainTitle} 한상\n\n> 푸짐한 한상 모드 · 2~3인분\n\n## 사용한 냉장고 재료\n${usedLines}\n\n## 🍛 메인 — ${mainTitle}\n${mainSteps
    .map((s, idx) => `${idx + 1}. ${s}`)
    .join('\n')}\n`;

  if (sideTitle) {
    md += `\n## 🥢 사이드 — ${sideTitle}\n${sideSteps.map((s, idx) => `${idx + 1}. ${s}`).join('\n')}\n`;
  }

  md += `\n## 상차림 팁\n- 전골/메인은 식탁 가운데 두고 따뜻할 때 함께 먹으면 분위기가 산다.\n`;
  if (sideTitle) md += `- ${sideTitle}는 접시 가장자리에 비스듬히 담아 곁들이면 보기 좋다.\n`;
  md += `\n---\n*🍳 냉장고 재료 기반 레시피 스킬 — 푸짐한 한상 모드(고정 룰)로 생성됨*\n`;

  return { title: mainTitle, markdown: md };
}

// ===== API: 레시피 생성 + 저장 =====
app.post('/api/recipe', (_req, res) => {
  try {
    ensureDirs();
    const ingredients = readIngredients();
    const { title, markdown } = generateFeastRecipe(ingredients);
    const fileName = `레시피-${title}.md`;
    const savePath = path.join(RECIPES_DIR, fileName);
    fs.writeFileSync(savePath, markdown, 'utf-8');
    res.json({ success: true, title, markdown, savedPath: `recipes/${fileName}` });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`🍲 냉장고 레시피 서버 실행 중: http://localhost:${PORT}`);
});
