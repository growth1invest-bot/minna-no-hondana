# Ver.1.2 Firebase接続設定・追加検証（2026-11-25）

## 変更内容

`firebase-v12-config.mjs` の `null` を、登録済みプロジェクトの公開Web構成4項目に置き換えた。Firebase管理用のGoogle再認証、秘密鍵・サービスアカウント・実アカウントのパスワードは使用していない。プロジェクト、DB、認証方式、Rules、請求先は変更していない。

- projectId：`minna-no-hondana-e936b`
- authDomain：`minna-no-hondana-e936b.firebaseapp.com`
- appId：`1:750942409516:web:9b90598e435d9531685289`
- apiKey：依頼者が提示した公開Web APIキー。Authの公開設定取得により、同じプロジェクト番号 `750942409516` に対応することを確認。

Storage・Messagingの構成値も提示されたが、このアプリでは利用しないため4項目だけを反映した。Storage SDK、Analytics、Functions、Cloud Runの導入・有効化は行っていない。Sparkは依頼者から共有された状態で、管理認証がないため料金プランを独立に読み取って再確認してはいない。課金アカウントを紐付ける操作はしていない。

## 2種類のappIdの確認

提示されたコードには `…9b90598a435d9531685289` と `…9b90598e435d9531685289` が混在していた。推測では選ばず、Firebaseの読み取り専用公開APIで確認した。

| 確認先 | 実結果 |
| --- | --- |
| `https://minna-no-hondana-e936b.firebaseapp.com/__/firebase/init.json` / `init.js` | 404 |
| `https://minna-no-hondana-e936b.web.app/__/firebase/init.json` | 404 |
| 管理API `v1beta1/projects/.../webApps` | OAuth未認証で401。再認証はしなかった |
| 公開API `https://firebase.googleapis.com/v1alpha/projects/-/apps/{appId}/webConfig`、`9b90598a…` のID | 404、App not found |
| 同じ公開API、`9b90598e…` のID | 200。projectId・appId・authDomainが一致 |
| `https://identitytoolkit.googleapis.com/v1/projects`（公開Webキー） | 200、projectId `750942409516` |

このため、登録済みであることを確認できた **`9b90598e…` のID** を採用した。Web APIキー・アプリIDは公開クライアント構成であり、Firebaseを管理するOAuthトークンやサービスアカウント秘密鍵とは異なる。

## 実Firebaseで確認できた範囲

1. 正しいWebアプリの公開構成、Authの公開プロジェクト情報の取得。
2. 実SDK 13.4.0によるアプリ・Auth・Firestoreの初期化。
3. iPhone/iPad相当のWebKitから、実Firestoreの読み取り専用プローブ `users/hondana-connection-probe/sync/head` が **`permission-denied`** になること。RESTでも403。存在する利用者のUIDや読書データは参照していない。
4. 読み取り専用の確認前後で、テスト用ブラウザのローカル記録・localStorageが変化しないこと。

WebKitの検証では、PR候補の静的ファイルを **GitHub Pagesと同じHTTPSオリジン・パス** でテスト配信し、GoogleのAuth設定・Firestore通信は実サービスへ接続した。マージ前の候補コードを使った検証であり、公開中のPagesを更新した結果ではない。SDKはGoogle配布の実コードをTLS検証付きで取得し、SHA-256を照合したキャッシュからテスト配信した。ライブ検証ではSDKや通信先の関数をスタブしていない。

匿名読み取り拒否は確認したが、これだけで本人の本番書き込みや他UID隔離をすべて証明するものではない。実Firebaseのユーザー作成・ログイン・メール配信・本人の保存／読込・他アカウントのアクセス試験は未実施。Email/Password有効化は依頼者の共有情報で、本番の登録・ログインによる独立検証はしていない。既存データへの書き込み・削除は一切していない。

### Chromiumのライブ検証制約

初回の3環境実行はWebKit 2成功、Chromium 1失敗。Chromiumを診断実行すると、公開構成取得で **`net::ERR_CERT_AUTHORITY_INVALID`** が記録された。SDKの初期化後、GoogleへのHTTPS接続段階で不成立になっている。TLS検証は無効化していない。このCloud環境でのChromiumライブ接続成功とは報告しない。Chromiumの実SDK＋ローカルEmulator接続、UIの回帰検証は別途実施している。

## Rules・既存データの保護

`index-v12.html`、SDK通信・同期処理、`firestore.rules`、旧HTML、保存キー、移行・バックアップ形式は変更していない。`cloud/v12-controller.mjs` は、設定がある場合の初期表示を「公開構成は設定済み」にする1か所だけを修正した。設定値の反映で自動同期を開始するような変更もしていない。初期化は引き続き「Firebaseへ接続する」を押したときだけで、ログインのみではFirestoreの本棚を読み書きしない。

既存の許可リスト転送、本人UID＋確認済みメール、revision競合検知、初回バックアップ、対象アカウント確認、安全な統合と取り消しを維持している。メモ・手動画像・プロフィールはクラウド転送対象外。

Firestore Emulatorでは現行Rulesの32ケースを再実行し、未認証・他UID・未確認メールの拒否、許可フィールド・list制限、分割保存と競合を確認した。追加のAuth/Firestore Emulator検証では、実SDKでメール確認後の本人が保存でき、別の確認済みUIDは読めないことを検証する。

実環境のRulesリリース読み取りAPIは403だったため、**配備済みRulesの本文とリポジトリの完全一致は未確認**。依頼者の「公開済み」という共有内容と、実環境の匿名拒否は確認結果として区別する。Rulesの公開・緩和・再配備は行っていない。

## 残る設定操作：許可ドメイン

Authの実際の公開レスポンスで、次の3つだけが登録されていた。

```text
localhost
minna-no-hondana-e936b.firebaseapp.com
minna-no-hondana-e936b.web.app
```

**`growth1invest-bot.github.io` は未登録。** 管理API更新にはGoogle管理認証が必要なため、この作業では変更していない。Email/Passwordの直接ログインと、OAuth・メールリンク等の許可ドメイン検証は別なので、未登録だけを現在のログイン失敗原因と断定はしない。導入手順に合わせ、Firebaseコンソール → Authentication → 設定 → 承認済みドメインで、`growth1invest-bot.github.io` を1件追加する。`https://` や `/minna-no-hondana/` は付けない。

## 自動テスト

新規テストは通常の `v12*.test.cjs` と分離し、意図せず実Firebaseへ接続しないようにした。

| 種別 | 対象・結果 |
| --- | --- |
| ロジック・模擬通信 | 39成功、0失敗 |
| Firestore Rules / 実SDK＋Firestore Emulator | 32成功、0失敗 |
| クラウドUIの回帰（Firebaseはスタブ） | 60成功、0失敗。Chromium / iPhone相当WebKit / iPad相当WebKit 各20 |
| 実SDK＋Auth/Firestore Emulator | 9成功、0失敗（31.3秒）。各環境3ケース |
| 実Firebase・読み取り専用 | WebKit 2環境で成功。Chromiumは上記証明書エラーで不成立 |

クラウドUIの「未設定」シナリオは、設定ファイルを明示的に `null` で配信するテストに変更し、実構成を反映した後も未設定時のローカル動作を検証できるようにした。移行、メモ・手動表紙、保存・読込・取り消し、容量不足、別タブ、公開情報の不送信を含む。今回、以前の全582ケースは再実行していない。集計・公開APIの実レスポンス・ソースのSHA-256は `tools/v12/connection-results.json` に記録した。

追加した実SDKテストは、登録、確認メールコードの適用、パスワード再設定、ログイン、セッション再読み込み、初回バックアップ後の保存、メモ・手動表紙の不送信、別の確認済みUIDの拒否、読込後の私的情報維持を検証する。メールとパスワードはローカルEmulator用で、パスワードは実行時に生成する。実メールや本番認証ではない。

### 再実行

Node 24.12以上、Java 21、Python 3とPlaywrightのChromium/WebKitが必要。

```sh
npm ci
npm --prefix tools/v12 ci
npm --prefix tools/v12 test
npm --prefix tools/v12 run test:rules
npx playwright test tests/v12-cloud.test.cjs --config=playwright.v12.config.cjs --workers=1
npm --prefix tools/v12 run test:connection
```

ライブ検証は明示した場合だけ実行する。登録・ログイン・メール送信・Firestore書き込みを行う経路は許可しない。Cloud環境のChromium証明書制約を避けてWebKitだけを確認するには、次を使用する。TLSエラーを無視する設定は使わない。

```sh
npm --prefix tools/v12 run test:live -- --project=iphone-webkit --project=ipad-webkit
```

## 実機で行う最小確認

1. 上記の承認済みドメイン1件を追加する。
2. PRのレビュー後、マージとGitHub Pagesの反映が済んだら、iPhoneで `https://growth1invest-bot.github.io/minna-no-hondana/index-v12.html` を開く。PR未マージの間は公開ページの設定は変わらない。
3. 先に私用JSONを「ファイル」へ保存。「本人専用クラウド保存」→ 接続 → メール/パスワードで登録し、確認メールのリンクを開いて「メール確認状態を更新」。パスワードやコードをIssue・PR・チャットに貼る必要はない。
4. 対象アカウント・冊数・差分・バックアップ確認後、現在の本棚（200冊以内）を「クラウドに保存」。再読み込み・再接続後に「クラウドから読み込む」で件数と差分を確認する。メモと手動表紙は端末に残り、他端末へは同期されない。

実機Safari・ファイルアプリ保存・実認証メール・本番の本人保存／読込は未検証。PRは未マージのレビュー待ちとし、Firebase管理設定や公開ページをこちらで変更していない。
