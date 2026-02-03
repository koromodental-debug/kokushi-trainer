# 国試トレーナー

歯科医師国家試験対策のための問題生成・模擬試験Webアプリケーション

## 機能

- **問題生成**: AIを使用してオリジナルの練習問題を生成
- **プロンプト生成**: Claude MAXプランやChatGPTで使用できるプロンプトを生成（無料）
- **問題インポート**: 生成したJSONをインポートして保存
- **模擬試験**: 保存した問題で模擬試験を実施
- **成績管理**: 試験結果の確認

## セットアップ

1. リポジトリをクローン
```bash
git clone https://github.com/your-username/kokushi-trainer.git
cd kokushi-trainer
```

2. ブラウザで `index.html` を開く

※ サーバー不要で動作します（静的HTMLファイル）

## 使い方

### 問題を生成する（API使用）

1. 右上の設定ボタンからAPIキーを設定
2. 科目・テーマ・問題数・難易度を選択
3. 「APIで生成」ボタンをクリック

### 問題を生成する（無料）

1. 科目・テーマ・問題数・難易度を選択
2. 「プロンプトを生成（無料）」ボタンをクリック
3. 表示されたプロンプトをコピー
4. Claude MAXプランやChatGPTに貼り付けて生成
5. 生成されたJSONを「問題をインポート」欄に貼り付け

### 模擬試験を受ける

1. 問題を生成またはインポート
2. 「模擬試験を開始」ボタンをクリック
3. 問題に回答
4. 試験終了後、結果を確認

## ファイル構成

```
kokushi-trainer/
├── index.html          # メインページ
├── saved.html          # 保存済み問題管理ページ
├── css/
│   └── style.css       # スタイルシート
├── js/
│   ├── app.js          # メインアプリケーション
│   ├── saved.js        # 保存済み問題管理
│   ├── generator.js    # 問題生成エンジン
│   ├── api.js          # API連携
│   └── data.js         # データ読み込み
├── data/
│   ├── subjects.json   # 科目データ
│   └── questions.json  # 過去問データ
└── prompts/            # プロンプト設計書
```

## 対応API

- Claude (Anthropic)
- Gemini (Google)

## ライセンス

Private
