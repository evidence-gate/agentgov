# AllNew App Store Portfolio Recovery

## What This Is

AllNew が保有する既存 iOS アプリ群について、App Store での販売開始・アップデート再開に必要なボトルネックを横断的に解消するプロジェクト。対象は `/Users/masa/Development` 配下にある既存アプリ群で、Cloudflare への法務文書移管、App Store 用プレビュー/スクリーンショット刷新、審査リジェクト是正を共通基盤とアプリ別対応に分けて進める。

## Core Value

各アプリを、法務・クリエイティブ・審査指摘の3点で止まらない状態にそろえ、App Review に再投入できる提出準備完了状態まで持っていくこと。

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] 9アプリを1つの横断プロジェクトとして扱い、共通作業とアプリ別作業が分離された実行計画を持つ
- [ ] BOTTO を参照実装として、GitHub Pages 上の利用規約等の法務文書を Cloudflare / `apps.allnew.work` 配下へ移管する共通方式を確立する
- [ ] 各対象アプリについて、Figma 連携の仕組みを使って App Store 用スクリーンショットとプレビュー資産を再制作し、掲載可能な状態にする
- [ ] BabyVox、OxiSnap、CoughWav、ThermoSnap、BPSnap について、ASC のリジェクト内容を確認し、是正対応して再提出可能状態にする
- [ ] 共通テンプレート、チェックリスト、運用手順を整備し、今回限りではなく今後も再利用できる型にする

### Out of Scope

- 実際の App Review 提出や販売開始操作そのもの — 高リスク操作であり、今回の完了条件は提出準備完了までに限定するため
- 新規アプリ開発や大規模な機能追加 — 目的は既存アプリ群の販売再開・更新準備であり、製品開発の拡張は主目的ではないため
- 全アプリの全面的なブランド再設計 — 今回は App Store 露出改善と審査通過に直結する範囲を優先するため

## Context

対象アプリは以下の 9 本:

- PupWeight ワンコとニャンコの体重記録
- BabyVox 赤ちゃんの成長記録ノート
- OxiSnap 酸素飽和度をかんたん記録
- CoughWav 咳（せき）ノート
- WaistVox ウェストサイズかんたん記録
- ThermoSnap かんたん体温記録
- GlucoSnap 血糖値かんたんノート
- BPSnap 血圧かんたんノート
- WeightSnap - カメラで体重記録

共通課題は 2 つある。1 つは GitHub Pages 上にある利用規約等の法務文書を Cloudflare 側へ載せ替えること。もう 1 つは App Store に掲載するプレビュー動画とスクリーンショットを作り直し、掲載状態を更新すること。これに加え、BabyVox、OxiSnap、CoughWav、ThermoSnap、BPSnap は ASC 審査でリジェクトされており、リジェクト理由の確認と是正対応が必要。

既存資産として、法務文書移管では BOTTO の構成を参照できる。クリエイティブ制作では Figma 連携の仕組みが存在し、これを用いて App Store 向け資産を再生成する前提で進める。対象アプリのプロジェクトフォルダは `/Users/masa/Development` 配下に存在する。

このプロジェクトは 9 本をバラバラに処理するのではなく、共通基盤を整えた上でアプリ別に差分対応するポートフォリオ改善案件として扱う。優先順位は、審査で止まっているリジェクト組の立て直しを先行し、その後に同じ型を他アプリへ横展開すること。

## Constraints

- **Repository**: 対象アプリの実体は `/Users/masa/Development` 配下にある既存プロジェクトを使う — 既存成果物と審査対象を前提に対応するため
- **Hosting**: 法務文書は GitHub Pages ではなく Cloudflare / `apps.allnew.work` へ移行する — 既存運用を BOTTO とそろえるため
- **Creative Pipeline**: App Store クリエイティブは Figma 連携の仕組みを使う — 既存の制作基盤を流用し、横展開可能な型を作るため
- **Review Status**: 一部アプリは既に ASC リジェクト状態にある — リジェクト理由の確認と是正が最優先の前提になるため
- **Operational Risk**: 実際の提出・公開は高リスク操作として別承認が必要 — 今回のスコープを提出準備完了までに制限するため
- **Reuse**: 今回限りの場当たり対応ではなく、共通テンプレートと運用手順まで作る — 同種アプリ群への再利用性を確保するため

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 9アプリを1つの横断PJとして扱う | 共通課題が明確で、基盤と差分を分けた方が進行管理しやすいため | — Pending |
| 完了条件を「提出準備完了」に置く | 実提出や販売開始は承認付きの高リスク操作であり、まずは再投入可能状態を作るのが目的のため | — Pending |
| 優先順位はリジェクト組先行とする | 現在価値を失っているボトルネックを先に解消し、その型を横展開したいため | — Pending |
| BOTTO を法務文書移管の参照実装にする | 既存の成功例に寄せる方が設計判断を減らせるため | — Pending |
| Cloudflare 移管と Figma/ASC 制作フローを共通運用の型まで整える | 今回限りで終わらず、今後のアプリ運用にも再利用したいため | — Pending |

---
*Last updated: 2026-03-11 after initialization*
