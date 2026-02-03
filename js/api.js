/**
 * API 連携モジュール
 * Claude / Gemini API対応
 */

const STORAGE_KEY = 'kokushi_generator_settings';
const DEFAULT_PROVIDER = 'claude';
const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';

/**
 * 設定を読み込む
 */
export function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return {
    provider: DEFAULT_PROVIDER,
    claudeApiKey: '',
    geminiApiKey: '',
    claudeModel: DEFAULT_CLAUDE_MODEL,
    geminiModel: DEFAULT_GEMINI_MODEL
  };
}

/**
 * 設定を保存する
 */
export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch (e) {
    console.error('Failed to save settings:', e);
    return false;
  }
}

/**
 * APIキーが設定されているか確認
 */
export function hasApiKey() {
  const settings = loadSettings();
  if (settings.provider === 'claude') {
    return settings.claudeApiKey && settings.claudeApiKey.startsWith('sk-ant-');
  } else if (settings.provider === 'gemini') {
    return settings.geminiApiKey && settings.geminiApiKey.length > 10;
  }
  return false;
}

/**
 * 現在のプロバイダーを取得
 */
export function getCurrentProvider() {
  const settings = loadSettings();
  return settings.provider || DEFAULT_PROVIDER;
}

/**
 * APIを呼び出す（プロバイダーに応じて振り分け）
 */
export async function callAPI(prompt, options = {}) {
  const settings = loadSettings();

  if (settings.provider === 'gemini') {
    return callGeminiAPI(prompt, options);
  } else {
    return callClaudeAPI(prompt, options);
  }
}

/**
 * Claude APIを呼び出す
 */
export async function callClaudeAPI(prompt, options = {}) {
  const settings = loadSettings();

  if (!settings.claudeApiKey) {
    throw new Error('Claude APIキーが設定されていません。設定画面からAPIキーを入力してください。');
  }

  const model = options.model || settings.claudeModel || DEFAULT_CLAUDE_MODEL;
  const maxTokens = options.maxTokens || 4096;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.claudeApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: maxTokens,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `API Error: ${response.status}`;

      if (response.status === 401) {
        throw new Error('Claude APIキーが無効です。正しいAPIキーを設定してください。');
      } else if (response.status === 429) {
        throw new Error('APIレート制限に達しました。しばらく待ってから再試行してください。');
      } else if (response.status === 500) {
        throw new Error('Anthropic APIサーバーエラーです。しばらく待ってから再試行してください。');
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();

    if (data.content && data.content.length > 0) {
      const textContent = data.content.find(c => c.type === 'text');
      if (textContent) {
        return {
          text: textContent.text,
          usage: data.usage,
          provider: 'claude'
        };
      }
    }

    throw new Error('Unexpected API response format');

  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('ネットワークエラー：インターネット接続を確認してください。');
    }
    throw error;
  }
}

/**
 * Gemini APIを呼び出す
 */
export async function callGeminiAPI(prompt, options = {}) {
  const settings = loadSettings();

  if (!settings.geminiApiKey) {
    throw new Error('Gemini APIキーが設定されていません。設定画面からAPIキーを入力してください。');
  }

  const model = options.model || settings.geminiModel || DEFAULT_GEMINI_MODEL;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.geminiApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt }
              ]
            }
          ],
          generationConfig: {
            maxOutputTokens: options.maxTokens || 4096,
            temperature: 0.7
          }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `API Error: ${response.status}`;

      if (response.status === 400) {
        throw new Error(`Gemini APIエラー: ${errorMessage}`);
      } else if (response.status === 403) {
        throw new Error('Gemini APIキーが無効です。正しいAPIキーを設定してください。');
      } else if (response.status === 429) {
        throw new Error('APIレート制限に達しました。しばらく待ってから再試行してください。');
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();

    if (data.candidates && data.candidates.length > 0) {
      const candidate = data.candidates[0];
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        return {
          text: candidate.content.parts[0].text,
          usage: data.usageMetadata,
          provider: 'gemini'
        };
      }
    }

    throw new Error('Unexpected Gemini API response format');

  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('ネットワークエラー：インターネット接続を確認してください。');
    }
    throw error;
  }
}

/**
 * コストを見積もる
 */
export function estimateCost(questionCount, model = null) {
  const settings = loadSettings();
  const provider = settings.provider || DEFAULT_PROVIDER;

  let selectedModel;
  if (provider === 'gemini') {
    selectedModel = model || settings.geminiModel || DEFAULT_GEMINI_MODEL;
  } else {
    selectedModel = model || settings.claudeModel || DEFAULT_CLAUDE_MODEL;
  }

  // モデルごとの価格（1Mトークンあたり、USD）
  const pricing = {
    // Claude
    'claude-sonnet-4-20250514': { input: 3, output: 15 },
    'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
    'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
    // Gemini
    'gemini-2.0-flash': { input: 0.1, output: 0.4 },
    'gemini-1.5-flash': { input: 0.075, output: 0.3 },
    'gemini-1.5-pro': { input: 1.25, output: 5 }
  };

  const modelPricing = pricing[selectedModel] || pricing['claude-sonnet-4-20250514'];

  // 推定トークン数（1問あたり）
  const estimatedInputTokens = 2000;
  const estimatedOutputTokens = 500;

  const totalInputTokens = estimatedInputTokens * questionCount;
  const totalOutputTokens = estimatedOutputTokens * questionCount;

  // USD計算
  const inputCost = (totalInputTokens / 1000000) * modelPricing.input;
  const outputCost = (totalOutputTokens / 1000000) * modelPricing.output;
  const totalUSD = inputCost + outputCost;

  // 円換算（1 USD = 150 JPY）
  const totalJPY = totalUSD * 150;
  const perQuestionJPY = totalJPY / questionCount;

  return {
    totalJPY: Math.round(totalJPY * 100) / 100,
    perQuestionJPY: Math.round(perQuestionJPY * 100) / 100,
    totalUSD: Math.round(totalUSD * 10000) / 10000,
    provider: provider
  };
}

/**
 * モデル一覧を取得
 */
export function getAvailableModels(provider = null) {
  const settings = loadSettings();
  const currentProvider = provider || settings.provider || DEFAULT_PROVIDER;

  if (currentProvider === 'gemini') {
    return [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (推奨)', description: '高速・安価' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: '安価で高速' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: '高性能' }
    ];
  } else {
    return [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4 (推奨)', description: 'バランスの良いモデル' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: '高性能モデル' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: '安価で高速' }
    ];
  }
}
