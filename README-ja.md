# Gemini Summary Images Plugin

GoogleのGeminiとkie.aiのnano-banana-proモデルを使用して、ノート用のAI要約画像を生成するObsidianプラグインです。

## 機能

- 🎨 ノートごとに4-5個の美しい要約画像を生成
- 🤖 Gemini 2.5 Flashによるインテリジェントなコンテンツ分析
- 🖼️ kie.aiのnano-banana-proモデルによる高品質な画像
- 🔄 2つの接続モード：Direct API（シンプル）とProxy Server（上級者向け）
- 💾 自動バックアップと元に戻す機能
- 🎯 関連する見出しの後に画像をスマート配置
- 📊 生成中の進捗追跡

## クイックスタート（Direct APIモード）

ほとんどのユーザーにおすすめのセットアップ方法 - サーバー不要！

### 1. プラグインのインストール

1. [Releasesページ](https://github.com/your-username/obsidian-gemini-plugin/releases)から最新版をダウンロード
2. `YourVault/.obsidian/plugins/obsidian-gemini-plugin/` に展開
3. Obsidianのコミュニティプラグイン設定で有効化

### 2. APIキーの取得

#### Gemini APIキー
1. [Google AI Studio](https://aistudio.google.com/app/apikey) にアクセス
2. 「Create API Key」をクリック
3. 既存のプロジェクトを選択するか、新しいプロジェクトを作成
4. APIキーをコピー（`AIzaSy...` で始まる）

#### kie.ai APIキー
1. [kie.ai](https://kie.ai) にアクセスしてサインアップ
2. アカウント設定またはAPIセクションに移動
3. 新しいAPIキーを生成
4. APIキーをコピー（`kie-...` で始まる）

### 3. プラグインの設定

1. Obsidian設定 → コミュニティプラグイン → Gemini Summary Images → オプションを開く
2. **接続モード**を「Direct API（推奨）」のままにする
3. APIキーを入力：
   - **Gemini APIキー**: ステップ2で取得したキーを貼り付け
   - **kie.ai APIキー**: ステップ2で取得したキーを貼り付け
4. 必要に応じて他の設定を調整（画像スタイル、数など）

### 4. 画像を生成！

1. 任意のマークダウンノートを開く
2. `Cmd/Ctrl + P` を押し、「Generate summary images」を検索
3. 画像が生成される様子を進捗モーダルで確認
4. 画像がノートに自動的に挿入されます

## 詳細設定（Proxyサーバーモード）

以下の目的のユーザー向け：
- 複数デバイスでAPIキーを共有
- レート制限と使用状況の追跡を追加
- APIキーをローカルマシンから除外

### オプション1：Cloudflare Workersを使用（推奨）

1. プロキシサーバーをデプロイ：
   ```bash
   # リポジトリをクローン
   git clone https://github.com/your-username/obsidian-gemini-plugin.git
   cd obsidian-gemini-plugin/proxy
   
   # Cloudflare Workersにデプロイ
   npm install -g wrangler
   wrangler login
   wrangler deploy
   ```

2. Cloudflareダッシュボードで環境変数を設定：
   - `GEMINI_API_KEY`: Gemini APIキー
   - `KIE_API_KEY`: kie.ai APIキー
   - `AUTH_TOKENS`: `ogsip_user123_abc` のようなトークンを作成

3. プラグインを設定：
   - **接続モード**を「Proxy Server（Advanced）」に設定
   - **Proxy URL**: WorkerのURL（例: `https://your-worker.workers.dev`）
   - **Proxy Token**: 作成した認証トークン

### オプション2：ローカルで実行

```bash
cd obsidian-gemini-plugin/proxy
npm install
npm run dev
```

プラグインを以下で設定：
- Proxy URL: `http://localhost:8787`
- Proxy Token: 設定したトークン

## 設定

| 設定項目 | 説明 | デフォルト |
|---------|------|---------|
| 接続モード | Direct APIまたはProxy Server | Direct API |
| 画像数 | 生成する画像の数 | 4 |
| 画像スタイル | 画像の視覚スタイル | インフォグラフィック |
| アスペクト比 | 画像のアスペクト比 | 16:9 |
| 言語 | タイトルと説明の言語 | 日本語 |
| 添付フォルダ | 画像の保存先 | attachments/ai-summary |
| バックアップ作成 | 変更前に元のノートを保存 | ✅ |

## 画像スタイル

- **インフォグラフィック**: クリーンなデザインのモダンなデータ可視化
- **ダイアグラム**: 幾何学的形状を使用した明確な概念図
- **カード**: 大胆な視覚階層を持つサマリーカード
- **ホワイトボード**: 手描き風の教育スタイル
- **スライド**: プロフェッショナルなプレゼンテーションデザイン

## トラブルシューティング

### 「APIキーを設定してください」と表示される
- Geminiとkie.aiの両方のAPIキーが入力されているか確認
- キーに余分なスペースがないか確認
- 接続モードが「Direct API」に設定されているか確認

### 「Gemini API error」
- Gemini APIキーが有効か確認
- 無料ティアの制限を超えていないか確認
- Google AI Studioからキーを再生成してみる

### 「kie.ai API error」
- kie.aiのサブスクリプションが有効か確認
- レート制限に達していないか確認
- APIキーに正しい権限があるか確認

### 「画像生成に失敗しました」
- プロンプトが複雑すぎる可能性 - より短いノートで試す
- インターネット接続を確認
- kie.aiが高負荷状態かもしれません - 後でもう一度試す

### 「画像生成がタイムアウトしました」
- 複雑なプロンプトで発生することがあります
- 画像数を5から4に減らしてみる
- kie.aiに遅延があるか確認

## 開発

```bash
# リポジトリをクローン
git clone https://github.com/your-username/obsidian-gemini-plugin.git
cd obsidian-gemini-plugin

# 依存関係をインストール
cd plugin && npm install

# プラグインをビルド
npm run build

# 開発モード（ファイル監視付き）
npm run dev
```

## ライセンス

MITライセンス - 詳細は[LICENSE](LICENSE)ファイルを参照。

## 貢献

貢献を歓迎します！お気軽にプルリクエストを送信してください。

## サポート

- 📖 [ドキュメント](https://github.com/your-username/obsidian-gemini-plugin/wiki)
- 🐛 [問題報告](https://github.com/your-username/obsidian-gemini-plugin/issues)
- 💬 [ディスカッション](https://github.com/your-username/obsidian-gemini-plugin/discussions)
