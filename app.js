const form = document.querySelector('#decision-form');
const criteriaList = document.querySelector('#criteria-list');
const addButton = document.querySelector('#add-criterion');
const submitButton = document.querySelector('#submit-button');
const status = document.querySelector('#status');
const result = document.querySelector('#result');
const summary = document.querySelector('#summary');
const probabilities = document.querySelector('#probabilities');
const modelInfo = document.querySelector('#model-info');
const submittedRequest = document.querySelector('#submitted-request');
const stateInput = document.querySelector('#state');
const instructionsInput = document.querySelector('#instructions');

function addCriterion(key = '', description = '') {
  const row = document.createElement('div');
  row.className = 'criterion-row';
  const keyInput = document.createElement('input');
  keyInput.className = 'criterion-key';
  keyInput.placeholder = '例: billing';
  keyInput.setAttribute('aria-label', '候補の識別名');
  keyInput.value = key;
  const descriptionInput = document.createElement('input');
  descriptionInput.className = 'criterion-description';
  descriptionInput.placeholder = '例: 請求・返金';
  descriptionInput.setAttribute('aria-label', '候補を選ぶ基準');
  descriptionInput.value = description;
  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'remove-button';
  removeButton.textContent = '削除';
  removeButton.setAttribute('aria-label', `${key || '候補'}を削除`);
  removeButton.addEventListener('click', () => row.remove());
  row.append(keyInput, descriptionInput, removeButton);
  criteriaList.append(row);
}

addCriterion();
addCriterion();
addButton.addEventListener('click', () => addCriterion());

const percent = value => `${(value * 100).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}%`;

form.addEventListener('submit', async event => {
  event.preventDefault();
  const criteria = Object.create(null);
  const rows = [...criteriaList.querySelectorAll('.criterion-row')];
  for (const row of rows) {
    const key = row.querySelector('.criterion-key').value.trim();
    const description = row.querySelector('.criterion-description').value.trim();
    if (!key || !description) {
      status.textContent = 'すべての候補に識別名と基準を入力してください。';
      return;
    }
    if (Object.hasOwn(criteria, key)) {
      status.textContent = `識別名「${key}」が重複しています。`;
      return;
    }
    criteria[key] = description;
  }
  if (rows.length < 2) {
    status.textContent = '回答候補は2件以上入力してください。';
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = '判定中…';
  status.textContent = 'Jevに問い合わせています…';
  result.hidden = true;
  try {
    const request = {
      state: stateInput.value,
      instructions: instructionsInput.value,
      criteria,
    };
    const response = await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '判定に失敗しました。');
    const entries = Object.entries(data.answer.probabilities).sort((a, b) => b[1] - a[1]);
    probabilities.replaceChildren();
    for (const [key, value] of entries) {
      const row = document.createElement('div');
      row.className = 'probability-row';
      const label = document.createElement('div');
      label.className = 'probability-label';
      const name = document.createElement('span');
      name.textContent = `${key} — ${criteria[key] ?? key}`;
      const number = document.createElement('strong');
      number.textContent = percent(value);
      label.append(name, number);
      const track = document.createElement('div');
      track.className = 'track';
      const fill = document.createElement('div');
      fill.className = 'fill';
      fill.style.width = `${Math.max(0, Math.min(100, value * 100))}%`;
      track.append(fill);
      row.append(label, track);
      probabilities.append(row);
    }
    summary.textContent = `最も可能性が高い回答：${data.answer.choice}（${criteria[data.answer.choice] ?? data.answer.choice}）`;
    modelInfo.textContent = `モデル: ${data.model} · 信頼度: ${percent(data.answer.confidence)}`;
    submittedRequest.textContent = JSON.stringify(data.submitted, null, 2);
    status.textContent = `${entries.length}件の候補を判定しました。`;
    result.hidden = false;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Jevで判定する';
  }
});
