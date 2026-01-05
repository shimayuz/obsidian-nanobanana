# シンボリックリンクによるプラグイン開発設定

## 概要

シンボリックリンクを使用すると、開発フォルダでビルドするだけでVault側に自動反映されます。

## 現在の設定

```
開発フォルダ: /Users/heavenlykiss0820/obsidian-plugin/obsidian-nanobanana/plugin
      ↓ シンボリックリンク
Vault: /Users/heavenlykiss0820/Desktop/Obsidian Starter Kit改/.obsidian/plugins/obsidian-nanobanana
```

## 開発フロー

1. コードを編集
2. ビルド: `NODE_ENV=production node esbuild.config.mjs`
3. Obsidianを再起動（Cmd+R または Cmd+Q → 再起動）

**コピー作業は不要です。**

---

## 新しいVaultに追加する場合

### コマンド

```bash
ln -s /Users/heavenlykiss0820/obsidian-plugin/obsidian-nanobanana/plugin "<Vaultパス>/.obsidian/plugins/obsidian-nanobanana"
```

### 例

```bash
# 別のVaultに追加
ln -s /Users/heavenlykiss0820/obsidian-plugin/obsidian-nanobanana/plugin "/Users/heavenlykiss0820/Documents/MyVault/.obsidian/plugins/obsidian-nanobanana"
```

### 注意点

- Vault側の `.obsidian/plugins/` フォルダが存在することを確認
- 同名のフォルダが既に存在する場合は先に削除: `rm -rf "<Vaultパス>/.obsidian/plugins/obsidian-nanobanana"`

---

## 複数のVaultで使用する場合

複数のVaultに同じシンボリックリンクを作成できます。

```bash
# Vault A
ln -s /Users/heavenlykiss0820/obsidian-plugin/obsidian-nanobanana/plugin "/path/to/VaultA/.obsidian/plugins/obsidian-nanobanana"

# Vault B
ln -s /Users/heavenlykiss0820/obsidian-plugin/obsidian-nanobanana/plugin "/path/to/VaultB/.obsidian/plugins/obsidian-nanobanana"

# Vault C
ln -s /Users/heavenlykiss0820/obsidian-plugin/obsidian-nanobanana/plugin "/path/to/VaultC/.obsidian/plugins/obsidian-nanobanana"
```

**全てのVaultが同じ開発フォルダを参照するため、1回のビルドで全Vaultに反映されます。**

---

## Vaultを変更・移動した場合

### Vaultを別の場所に移動した場合

シンボリックリンクは**絶対パス**で作成されているため、Vaultを移動してもリンクは有効です。

ただし、Vault内の `.obsidian/plugins/obsidian-nanobanana` がシンボリックリンクであることを確認してください。

### 開発フォルダを移動した場合

**シンボリックリンクが壊れます。** 以下の手順で修復してください：

1. 古いリンクを削除
   ```bash
   rm "<Vaultパス>/.obsidian/plugins/obsidian-nanobanana"
   ```

2. 新しいパスでリンクを再作成
   ```bash
   ln -s <新しい開発フォルダパス>/plugin "<Vaultパス>/.obsidian/plugins/obsidian-nanobanana"
   ```

### Vaultを削除した場合

開発フォルダには影響ありません。他のVaultのリンクも影響を受けません。

---

## トラブルシューティング

### リンクが壊れているか確認

```bash
ls -la "<Vaultパス>/.obsidian/plugins/obsidian-nanobanana"
```

正常な場合：
```
lrwxr-xr-x  ... obsidian-nanobanana -> /Users/heavenlykiss0820/obsidian-plugin/obsidian-nanobanana/plugin
```

壊れている場合（赤字で表示されることが多い）：
```
lrwxr-xr-x  ... obsidian-nanobanana -> /存在しないパス/plugin
```

### リンクを削除してコピーに戻す

```bash
# リンクを削除
rm "<Vaultパス>/.obsidian/plugins/obsidian-nanobanana"

# フォルダをコピー
cp -r /Users/heavenlykiss0820/obsidian-plugin/obsidian-nanobanana/plugin "<Vaultパス>/.obsidian/plugins/obsidian-nanobanana"
```

---

## まとめ

| 操作 | 影響 |
|------|------|
| ビルド | 全リンク先Vaultに即反映 |
| Vault移動 | 影響なし |
| 開発フォルダ移動 | リンク再作成が必要 |
| Vault削除 | 他に影響なし |
| 複数Vault | 全て同じソースを参照 |
