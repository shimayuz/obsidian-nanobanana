# Obsidian Gemini Summary Images Plugin - 詳細実装計画

**作成日**: 2025-12-24
**更新日**: 2025-12-24（kie.ai API対応）
**方式**: プロキシ版（APIキーはサーバ側に保持）
**原則**: 既存環境（pdftranslation）に影響を与えない独立開発

---

## 1. ディレクトリ構造

```
pdftranslation/
├── obsidian-gemini-plugin/           # ★ 新規追加（このディレクトリ）
│   │
│   ├── plugin/                       # Obsidianプラグイン本体
│   │   ├── src/
│   │   │   ├── main.ts              # エントリポイント
│   │   │   ├── types.ts             # 型定義
│   │   │   ├── api/
│   │   │   │   └── proxy-client.ts  # プロキシAPI通信（ポーリング対応）
│   │   │   ├── core/
│   │   │   │   ├── note-parser.ts   # ノート解析（見出し分割等）
│   │   │   │   ├── image-injector.ts # 画像埋め込み処理
│   │   │   │   ├── backup-manager.ts # バックアップ管理
│   │   │   │   └── undo-manager.ts  # Undo機能
│   │   │   ├── ui/
│   │   │   │   ├── progress-modal.ts # 進捗表示モーダル
│   │   │   │   └── confirm-modal.ts  # 確認ダイアログ
│   │   │   └── utils/
│   │   │       ├── hash.ts          # ハッシュ計算（競合検出用）
│   │   │       └── filename.ts      # ファイル名サニタイズ
│   │   ├── manifest.json            # Obsidianプラグインマニフェスト
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── esbuild.config.mjs       # CJSバンドル設定
│   │   └── styles.css               # スタイル（最小限）
│   │
│   ├── proxy/                        # プロキシサーバー
│   │   ├── src/
│   │   │   ├── index.ts             # Honoエントリポイント
│   │   │   ├── routes/
│   │   │   │   ├── plan.ts          # POST /v1/plan
│   │   │   │   └── image.ts         # /v1/image/create, /v1/image/status/:jobId
│   │   │   ├── services/
│   │   │   │   ├── gemini.ts        # Gemini API連携（Plan生成）
│   │   │   │   ├── kie-ai.ts        # kie.ai API連携（画像生成）
│   │   │   │   └── rate-limiter.ts  # レート制限
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts          # Bearer Token認証
│   │   │   │   └── error-handler.ts # エラーハンドリング
│   │   │   └── types.ts             # 型定義
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── wrangler.toml            # Cloudflare Workers設定
│   │
│   ├── shared/                       # 共有型定義
│   │   └── api-types.ts             # プラグイン⇔プロキシ共通型
│   │
│   └── IMPLEMENTATION_PLAN.md       # この文書
│
├── server/                           # ← 既存（触れない）
├── src/                              # ← 既存（触れない）
└── ...
```

---

## 2. 使用APIと方式

### 2.1 API選定

| 用途 | API / モデル | 備考 |
|-----|-------------|------|
| Plan生成（テキスト） | Gemini API / `gemini-2.5-flash` | 高速・高性能 |
| 画像生成 | **kie.ai / `nano-banana-pro`** | 高品質、ポーリング方式 |

### 2.2 ポーリング方式（重要）

Obsidianプラグインはローカル環境のため、**Callback URLは使用不可**。
kie.ai APIはポーリング方式で利用する。

```
[プラグイン] → POST /v1/image/create → [プロキシ] → kie.ai createTask
                                                         ↓
                                                     job_id を返す
                                                         ↓
[プラグイン] ← { jobId } ←────────────────────────────────┘
     │
     │ (5秒間隔でポーリング)
     ↓
[プラグイン] → GET /v1/image/status/:jobId → [プロキシ] → kie.ai getJob
                                                              ↓
[プラグイン] ← { status, imageUrl } ←───────────────────────┘
     │
     │ (status === 'completed')
     ↓
[プラグイン] → fetch(imageUrl) → 画像ダウンロード → Vaultに保存
```

---

## 3. プロキシサーバー詳細設計

### 3.1 エンドポイント仕様

#### `POST /v1/plan` - 画像計画生成

**リクエスト**
```typescript
interface PlanRequest {
  noteContent: string;       // ノート本文（または圧縮版）
  settings: {
    imageCount: 4 | 5;       // 生成枚数
    style: ImageStyle;       // スタイルプリセット
    language: 'ja' | 'en';   // 出力言語
  };
}
```

**レスポンス**
```typescript
interface PlanResponse {
  version: '1';
  items: PlanItem[];
  metadata: {
    noteHash: string;
    generatedAt: string;
  };
}
```

#### `POST /v1/image/create` - 画像生成タスク作成

**リクエスト**
```typescript
interface ImageCreateRequest {
  prompt: string;
  style: ImageStyle;
  aspectRatio?: '16:9' | '4:3' | '1:1' | '9:16' | '3:4';
  resolution?: '1K' | '2K' | '4K';
  outputFormat?: 'png' | 'jpg' | 'webp';
}
```

**レスポンス**
```typescript
interface ImageCreateResponse {
  jobId: string;               // kie.ai job_id
  estimatedWaitSeconds?: number;
}
```

#### `GET /v1/image/status/:jobId` - ステータス確認

**レスポンス**
```typescript
interface ImageStatusResponse {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  imageUrl?: string;           // 完了時のみ
  errorMessage?: string;       // 失敗時のみ
  progress?: number;           // 0-100
}
```

### 3.2 認証・セキュリティ

```typescript
// 認証ヘッダー
Authorization: Bearer <user-token>

// トークン形式
// ogsip_<userId>_<randomBytes>
```

**レート制限**
| エンドポイント | 制限 |
|--------------|------|
| /v1/plan     | 10回/分/ユーザー |
| /v1/image/*  | 20回/分/ユーザー, 100回/日/ユーザー |

### 3.3 環境変数（Secrets）

```bash
# Plan生成用（Gemini）
wrangler secret put GEMINI_API_KEY

# 画像生成用（kie.ai）
wrangler secret put KIE_API_KEY

# 認証トークン（カンマ区切り）
wrangler secret put AUTH_TOKENS
```

---

## 4. Obsidianプラグイン詳細設計

### 4.1 ポーリング実装

```typescript
// plugin/src/api/proxy-client.ts

const POLLING_INTERVAL_MS = 5000;  // 5秒間隔
const POLLING_MAX_ATTEMPTS = 60;   // 最大60回（5分）

async function generateImage(prompt: string, settings: PluginSettings): Promise<ArrayBuffer> {
  // 1. タスク作成
  const { jobId } = await this.post('/v1/image/create', { prompt, style, ... });

  // 2. ポーリング
  for (let i = 0; i < POLLING_MAX_ATTEMPTS; i++) {
    const status = await this.get(`/v1/image/status/${jobId}`);

    if (status.status === 'completed') {
      // 3. 画像ダウンロード
      return await this.downloadImage(status.imageUrl);
    }

    if (status.status === 'failed') {
      throw new Error(status.errorMessage);
    }

    await sleep(POLLING_INTERVAL_MS);
  }

  throw new Error('Timeout');
}
```

### 4.2 進捗表示

ポーリング中はモーダルでユーザーに状態を通知：
- `pending`: "Waiting in queue..."
- `processing`: "Generating image..."
- `completed`: "Image generated!"

### 4.3 設定項目

```typescript
interface PluginSettings {
  // 接続設定
  proxyUrl: string;
  proxyToken: string;

  // 生成設定
  imageCount: 4 | 5;
  imageStyle: ImageStyle;
  aspectRatio: AspectRatio;
  language: Language;

  // 保存設定
  attachmentFolder: string;

  // 送信設定
  sendMode: 'full' | 'headings' | 'summary';
  maxCharacters: number;

  // 安全設定
  createBackup: boolean;
  backupLocation: 'plugin' | 'vault';
}
```

### 4.4 コマンド一覧

| コマンドID | 表示名 | 説明 |
|-----------|--------|------|
| `generate-images` | Generate Summary Images | 現在のノートに画像生成 |
| `undo-injection` | Undo Last Image Injection | 直前の埋め込みを取消 |
| `clear-all-images` | Remove All AI Images | このノートのAI画像を全削除 |
| `show-backup` | Show Backup | バックアップを表示 |

### 4.5 画像埋め込みフォーマット

```markdown
<!-- ai-summary:start id="img1" generated="2025-12-24T10:30:00Z" -->
![[attachments/ai-summary/note-name__img1.png]]
*全体サマリ: この記事の主要ポイントを図解*
<!-- ai-summary:end id="img1" -->
```

---

## 5. 実装フェーズ

### Phase 1: 基盤構築（プロキシ優先）
- [x] Hono + Cloudflare Workers セットアップ
- [x] Bearer Token認証ミドルウェア
- [x] エラーハンドリング共通化
- [x] ヘルスチェック `/health`
- [x] Plan API実装（Gemini Flash連携）
- [x] Image API実装（kie.ai ポーリング方式）

### Phase 2: プラグイン骨格
- [x] TypeScript + esbuild設定
- [x] manifest.json作成
- [x] 設定タブ実装
- [x] 基本コマンド登録
- [x] ポーリング対応API通信層

### Phase 3: コア機能
- [x] ノート解析（見出し分割）
- [x] 画像生成フロー（ポーリング＋進捗表示）
- [x] 画像保存・埋め込み

### Phase 4: 安全機能
- [x] バックアップ保存・復元
- [x] Undo機能
- [x] 競合検出

### Phase 5: QA・配布
- [ ] テストケース作成
- [ ] モバイル動作確認
- [ ] READMEドキュメント
- [ ] リリースビルド

---

## 6. 技術スタック

### プロキシサーバー
| 項目 | 選択 | 理由 |
|-----|------|------|
| ランタイム | Cloudflare Workers | 既存serverと統一、低コスト |
| フレームワーク | Hono | 軽量、Workers最適化 |
| Plan API | Gemini 2.5 Flash | 高速・高性能 |
| Image API | **kie.ai nano-banana-pro** | 高品質画像生成 |

### Obsidianプラグイン
| 項目 | 選択 | 理由 |
|-----|------|------|
| 言語 | TypeScript | 型安全 |
| バンドラー | esbuild | 高速、CJS出力対応 |
| 出力形式 | CJS (CommonJS) | Obsidian要件 |
| 通信 | requestUrl (Obsidian API) | CORS回避 |

---

## 7. リスクと対策

| リスク | 影響 | 対策 |
|-------|------|------|
| kie.ai API制限 | 画像生成失敗 | 429時リトライ、ユーザー通知 |
| ポーリングタイムアウト | 画像取得失敗 | 5分上限、エラーハンドリング |
| 大きなノート | トークン超過 | 圧縮、分割送信 |
| 競合編集 | データ損失 | ハッシュ検証、バックアップ |
| モバイル性能 | 遅延 | 枚数制限、逐次処理 |

---

## 8. 今後の拡張案（スコープ外）

- 画像スタイルのカスタムプロンプト
- 複数ノート一括処理
- 画像キャッシュ（同じ内容は再生成しない）
- 画像編集・再生成機能
- エクスポート機能（PowerPoint等）
