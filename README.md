# Misskey Compass (Misskey-tutorial)

Misskeyをこれから始めたい人向けの静的ウェブサイトです。Misskeyとは何か、どのような機能があるのか、そして新規登録可能なサーバーを比較できるようにまとめています。

## プロジェクト構成

- `index.html` — メインページ。Misskeyの概要、機能紹介、サーバー比較表、登録までの流れ、FAQなどを掲載しています。
- `assets/css/styles.css` — サイト全体のスタイル定義。

## ローカルでの確認方法

1. リポジトリをクローンします。
2. 任意の静的ファイルサーバー（`python -m http.server`など）でルートディレクトリを公開します。
3. ブラウザーで `http://localhost:8000`（ポートは使用するサーバーに応じて変更してください）を開き、ページの表示を確認します。

## カスタマイズのヒント

- サーバー情報を更新する場合は、`index.html` 内の「新規登録が可能なサーバー」セクションの表を編集してください。
- カラーテーマやレイアウトを変更する場合は、`assets/css/styles.css` のカスタムプロパティ（`--accent` など）を調整すると効率的です。
- 追加のページを作成する場合は、共通のヘッダー／フッター構造を再利用すると一貫性を保ちやすくなります。

## データ更新の自動化

- `scripts/fetch-relay-data.mjs` は [Virtual Kemomimi Relay](https://relay.virtualkemomimi.net/) から最新のサーバーリストを取得し、`assets/data/virtual-kemomimi-servers.json` を上書きします。
  - ネットワークにアクセスできない環境では `node scripts/fetch-relay-data.mjs --source assets/data/virtual-kemomimi-servers.json`
    のように既存ファイルを入力ソースとして指定できます（`RELAY_DATA_SOURCE` 環境変数でも指定可能）。
- `.github/workflows/update-relay-data.yml` が 1 日と 15 日の午前 0 時（UTC）にこのスクリプトを実行し、差分がある場合は Pull Request を自動作成します。手動実行（workflow_dispatch）にも対応しています。

## ライセンス

このプロジェクトはMITライセンスの下で提供されます。
