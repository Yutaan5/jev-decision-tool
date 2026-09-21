import http from 'node:http';
import { readFile } from 'node:fs/promises';

const host = '127.0.0.1';
const port = Number(process.env.PORT || 3000);
const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
};

function reply(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 100_000) throw new Error('入力が大きすぎます。');
  }
  return JSON.parse(raw);
}

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, `http://${host}:${port}`).pathname;

  if (request.method === 'GET' && files[pathname]) {
    const [filename, type] = files[pathname];
    try {
      const content = await readFile(new URL(filename, import.meta.url));
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      response.end(content);
    } catch {
      reply(response, 500, { error: '画面を読み込めませんでした。' });
    }
    return;
  }

  if (request.method !== 'POST' || pathname !== '/api/evaluate') {
    reply(response, 404, { error: '見つかりません。' });
    return;
  }

  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    reply(response, 500, { error: 'TYPESAFE_API_KEY が設定されていません。設定済みのターミナルからアプリを起動してください。' });
    return;
  }

  let input;
  try {
    input = await readBody(request);
  } catch {
    reply(response, 400, { error: '入力を読み取れませんでした。' });
    return;
  }

  const { state, instructions, criteria } = input ?? {};
  if (typeof state !== 'string' || !state.trim() || typeof instructions !== 'string' || !instructions.trim() ||
      !criteria || typeof criteria !== 'object' || Array.isArray(criteria) ||
      Object.keys(criteria).length < 2 || Object.keys(criteria).length > 255 ||
      Object.entries(criteria).some(([key, description]) => !key.trim() || typeof description !== 'string' || !description.trim())) {
    reply(response, 400, { error: '判定材料・判断内容・2件以上の回答候補を入力してください。' });
    return;
  }

  try {
    const submitted = {
      model: 'jev-latest',
      state,
      questions: {
        decision: { type: 'choice', instructions, criteria },
      },
    };
    const upstream = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(submitted),
      signal: AbortSignal.timeout(30000),
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      reply(response, upstream.status, { error: data?.error?.message || data?.error || `Jev API エラー (${upstream.status})` });
      return;
    }
    const answer = data?.answers?.decision;
    if (!answer || typeof answer.probabilities !== 'object') {
      reply(response, 502, { error: 'Jevから予期しない形式の応答が返りました。' });
      return;
    }
    reply(response, 200, { model: data.model, answer, submitted });
  } catch (error) {
    reply(response, 502, { error: error?.name === 'TimeoutError' ? 'Jevへの接続がタイムアウトしました。' : 'Jevへの接続に失敗しました。' });
  }
});

server.listen(port, host, () => {
  console.log(`Jev app: http://${host}:${port}`);
});
