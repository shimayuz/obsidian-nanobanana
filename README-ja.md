# Obsidian NanoBanana Plugin

OpenAI GPTとkie.aiのnano-banana-proモデルを使用して、Obsidianドキュメント用のAI要約画像を自動生成するプラグインです。

## 機能

- 🎨 Obsidianドキュメントの内容を分析し、最大8枚の美しい要約画像を自動生成
- 🤖 OpenAI GPT-5-miniによるインテリジェントなプラン生成（見出しごとに最適な画像を計画）
- 🖼️ kie.aiのnano-banana-proモデルによる高品質な画像生成
- 🔄 2つの接続モード：Direct API（シンプル）とProxy Server（上級者向け）
- 💾 自動バックアップとUndo機能
- 🎯 見出しの後に画像をスマート配置
- 📊 リアルタイム進捗表示（ポーリング状況も表示）
- 🗑️ AI画像の一括削除コマンド

## クイックスタート（Direct APIモード）

ほとんどのユーザーにおすすめのセットアップ方法 - サーバー不要！

### 1. プラグインのインストール

1. [Releasesページ](https://github.com/shimayuz/obsidian-nanobanana/releases)から最新版をダウンロード
2. `YourVault/.obsidian/plugins/obsidian-nanobanana/` に展開
3. Obsidianのコミュニティプラグイン設定で有効化

### 2. APIキーの取得

#### OpenAI APIキー（プラン生成用）
1. [OpenAI Platform](https://platform.openai.com/api-keys) にアクセス
2. 「Create new secret key」をクリック
3. APIキーをコピー（`sk-...` で始まる）

#### kie.ai APIキー（画像生成用）
1. [kie.ai](https://kie.ai) にアクセスしてサインアップ
2. アカウント設定またはAPIセクションに移動
3. 新しいAPIキーを生成
4. APIキーをコピー

### 3. プラグインの設定

1. Obsidian設定 → コミュニティプラグイン → Docs Summary to Image → 設定を開く
2. **接続モード**を「Direct API（推奨）」のままにする
3. APIキーを入力：
   - **OpenAI APIキー**: プラン生成用（`sk-...`）
   - **kie.ai APIキー**: 画像生成用
4. 必要に応じて他の設定を調整

### 4. 画像を生成！

1. 任意のObsidianドキュメント（.md）を開く
2. `Cmd/Ctrl + P` を押し、「Generate Summary Images」を検索して実行
3. 進捗モーダルで生成状況をリアルタイム確認
4. 画像がドキュメントの見出し直後に自動挿入されます

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| Generate Summary Images | 現在のドキュメントに要約画像を生成 |
| Undo Last Image Injection | 直前の画像埋め込みを取り消し |
| Remove All AI Images from Current Note | 現在のドキュメントから全AI画像を削除 |
| Show Last Backup | 最新のバックアップを表示 |

## 詳細設定（Proxyサーバーモード）

以下の目的のユーザー向け：
- 複数デバイスでAPIキーを共有
- レート制限と使用状況の追跡を追加
- APIキーをローカルマシンから除外

### Cloudflare Workersを使用

1. プロキシサーバーをデプロイ：
   ```bash
   git clone https://github.com/shimayuz/obsidian-nanobanana.git
   cd obsidian-nanobanana/proxy
   
   npm install -g wrangler
   wrangler login
   wrangler deploy
   ```

2. Cloudflareダッシュボードで環境変数を設定：
   - `OPENAI_API_KEY`: OpenAI APIキー
   - `KIE_API_KEY`: kie.ai APIキー
   - `AUTH_TOKENS`: 認証トークン（例: `ogsip_user123_abc`）

3. プラグインを設定：
   - **接続モード**: 「Proxy Server（Advanced）」
   - **Proxy URL**: WorkerのURL
   - **Proxy Token**: 作成した認証トークン

## 設定項目

### 接続設定

| 設定項目 | 説明 | デフォルト |
|---------|------|---------|
| 接続モード | Direct API または Proxy Server | Direct API |
| OpenAI APIキー | プラン生成用（Direct APIモード） | - |
| kie.ai APIキー | 画像生成用（Direct APIモード） | - |
| Proxy URL | プロキシサーバーURL（Proxyモード） | - |
| Proxy Token | 認証トークン（Proxyモード） | - |

### 生成設定

| 設定項目 | 説明 | デフォルト |
|---------|------|---------|
| 最大画像数 | 生成する画像の最大数（1-8） | 8 |
| 画像スタイル | 画像の視覚スタイル | Infographic |
| アスペクト比 | 画像のアスペクト比 | 16:9 |
| 言語 | タイトルと説明の言語 | 日本語 |

### コンテンツ処理

| 設定項目 | 説明 | デフォルト |
|---------|------|---------|
| 送信モード | AIに送信するコンテンツ量 | Headings + excerpts |
| 最大文字数 | 送信する最大文字数 | 30000 |

### 保存設定

| 設定項目 | 説明 | デフォルト |
|---------|------|---------|
| 添付フォルダ | 画像の保存先 | attachments/ai-summary |
| バックアップ作成 | 変更前にドキュメントをバックアップ | ON |
| バックアップ場所 | プラグインデータ or Vault | Plugin data |

## 画像スタイル

- **Infographic**: クリーンなデザインのモダンなデータ可視化
- **Diagram**: 幾何学的形状を使用した明確な概念図
- **Summary Card**: 大胆な視覚階層を持つサマリーカード
- **Whiteboard**: 手描き風の教育スタイル
- **Slide**: プロフェッショナルなプレゼンテーションデザイン

## 生成フロー

1. **プラン生成**: OpenAI GPT-5-miniがドキュメントを分析し、各見出しに最適な画像プランを作成
2. **画像生成**: kie.ai nano-banana-proで各プランに基づいて画像を生成（非同期ポーリング）
3. **保存**: 生成された画像を指定フォルダに保存
4. **埋め込み**: 画像をドキュメントの適切な位置に自動挿入

## トラブルシューティング

### 「Please configure your API keys in settings」
- OpenAIとkie.aiの両方のAPIキーが入力されているか確認
- キーに余分なスペースがないか確認
- 接続モードが「Direct API」に設定されているか確認

### 「OpenAI API error」
- OpenAI APIキーが有効か確認
- APIクレジットが残っているか確認
- [OpenAI Platform](https://platform.openai.com/)でキーを再生成

### 「kie.ai API error」
- kie.aiのアカウントが有効か確認
- レート制限に達していないか確認
- APIキーに正しい権限があるか確認

### 「Failed to generate image」
- プロンプトが複雑すぎる可能性 - より短いドキュメントで試す
- インターネット接続を確認
- kie.aiが高負荷状態かもしれません - 後でもう一度試す

### 画像が生成されない
- 最大画像数の設定を確認
- ドキュメントに見出し（#, ##, ###）があるか確認
- コンソールログでエラーを確認（Cmd/Ctrl + Shift + I）

## 開発

```bash
# リポジトリをクローン
git clone https://github.com/shimayuz/obsidian-nanobanana.git
cd obsidian-nanobanana

# プラグインの依存関係をインストール
cd plugin && npm install

# プラグインをビルド
npm run build

# 開発モード（ファイル監視付き）
npm run dev
```

### ディレクトリ構造

```
obsidian-nanobanana/
├── plugin/           # Obsidianプラグイン本体
│   ├── src/
│   │   ├── main.ts          # エントリポイント
│   │   ├── types.ts         # 型定義
│   │   ├── api/             # APIクライアント
│   │   ├── core/            # コアロジック
│   │   └── ui/              # UIコンポーネント
│   └── manifest.json
├── proxy/            # Cloudflare Workersプロキシ
└── shared/           # 共有型定義
```

## ライセンス

MITライセンス

## 貢献

貢献を歓迎します！お気軽にプルリクエストを送信してください。

## サポート

- 🐛 [問題報告](https://github.com/shimayuz/obsidian-nanobanana/issues)
- 💬 [ディスカッション](https://github.com/shimayuz/obsidian-nanobanana/discussions)
