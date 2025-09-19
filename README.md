
# kayak-gogo — 出艇判断チェッカー（Firebase + React）

最小構成で **Firebase Hosting + Functions v2 + Firestore + Emulator** を使ったプロトタイプ。

## セットアップ

```bash
# 1) 依存インストール
npm i -g firebase-tools
cd app && npm i && cd ..
cd functions && npm i && cd ..

# 2) エミュレーター起動（別ターミナル）
firebase emulators:start

# 3) フロントの開発サーバ
cd app
npm run dev
```

### デプロイ（プロダクション）
```bash
# 1) ビルド
cd app && npm run build && cd ..
# 2) デプロイ（Hosting + Functions）
firebase deploy --only hosting,functions
```

## Firestore スキーマ
- `presets/{presetId}`: しきい値プリセット（全員読み取り可）
- `users/{uid}/settings/{doc}`: 個人設定（本人のみ read/write）
- `logs/{autoId}`: 判定ログ（匿名・書き込みのみ）

> 開発中はエミュレーターを利用。初回起動時に `presets` が無い場合、ローカル環境でのみ自動投入されます。

## プロジェクト構成
```
app/        # Vite + React (SPA) + PWA ざっくり
functions/  # Cloud Functions v2 (Node 18, TypeScript)
firebase.json
firestore.rules
.firebaserc
```

## 変更点（必要なら）
- Firebase Config は `app/src/firebase.ts` に記入（本番時）
- Hosting rewrite は `firebase.json` の `/api/judge` を Functions に転送

# kayak-gogo

カヤック出艇判断チェッカー

## 更新テスト
この行は GitHub Actions 自動デプロイの確認用です。
Test auto deploy 2025年 9月20日 土曜日 08時37分45秒 JST
test preview deploy
