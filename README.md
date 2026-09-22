# 南堂 DFI 補貨系統 V1.1

粉藍白、手機優先的分店補貨管理工具，供南堂花茶管理 DFI 四間分店的巡店、貨架餘量、建議補貨量及 Delivery Note。

## 正式網站

[namtong-dfi-restock.ksamandhisfds.workers.dev](https://namtong-dfi-restock.ksamandhisfds.workers.dev/)

網站由 Cloudflare Workers 免費方案託管，連接本 GitHub 倉庫的 `main` 分支；每次推送更新都會自動重新構建及發佈。

## 主要功能

- 管理朗豪坊、圓方、K11 及西寶城的分店資料、地址與營業時間
- 記錄每款 SKU 的貨架剩餘量及未滿情況
- 按巡店週期、逾期日數、剩餘量及歷史補貨量計算下一次建議
- 一鍵建立每間分店的 Delivery Note PDF
- 保留補貨歷史，並支援 iPhone 單手快速新增
- 公開瀏覽；管理操作由伺服器端 `ADMIN_PIN` 環境變數保護

## 巡店規則

| 分店 | 建議巡店週期 |
| --- | ---: |
| 朗豪坊 | 10 日 |
| 圓方 | 12 日 |
| K11 | 14 日 |
| 西寶城 | 14 日 |

## 本機開發

需要 Node.js 22.13 或以上版本。

```bash
pnpm install
pnpm dev
```

正式構建：

```bash
pnpm build
```

管理密碼只應設於部署平台的秘密環境變數，請勿提交到 Git：

```text
ADMIN_PIN=<your-admin-pin>
```

## 字體授權

網站內嵌 [LXGW WenKai／霞鶩文楷](https://github.com/lxgw/LxgwWenKai)，字體按 SIL Open Font License 1.1 發佈。完整授權內容見 [`public/fonts/OFL.txt`](public/fonts/OFL.txt)。

## 專案授權

除另有註明的第三方素材外，本倉庫未授予額外的原始碼使用權利。
