# 簡報達人評分系統 — 開發與版本更新日誌 (Changelog)

本檔案為開發者專用之更新筆記，記錄專案版本演進、115學年度規範對齊與前後端架構重構歷程。

---

## [v75.2-115] - 2026-08-20

### 🛠️ 全新「系統維運與檢測」模組 (AdminHealthView)
- **獨立頁籤新增**：後台選單新增 `🛠️ 系統維運/檢測` 頁籤按鈕與獨立視圖組件 `js/views/admin-health.js`。
- **🚀 一鍵全系統健康度診斷**：
  - 自動偵測 6 大關鍵指標：7 個工作表 Schema 完整性、9 位評審 (A~I) 帳密設定、隊伍資料 PDF 連結完整性、競賽開關與評分數據筆數。
  - 診斷結果以 🟢 正常 / 🟡 警告 / 🔴 異常 儀表板實時回饋。
- **📸 雲端時間點快照 (Snapshot)**：
  - 支援管理員一鍵寫入帶有時間戳記與說明備註之 `Backup_Timestamp` 雲端快照紀錄。
- **💾 本機離線備份包 (.json)**：
  - 提供一鍵打包全系統 (設定、隊伍、評審、評分) 完整 JSON 資料包並自動下載至本機電腦。

### 🐛 評審管理維護與後端主鍵修復
- **`Service_Judges.js` 重構**：
  - 修復編輯評審儲存失敗問題，改採 `Competition_Year` + `Judge_Code` 雙重主鍵定位列。
  - 補齊屬性大小寫相容機制 (`judge_code` / `Judge_Code`)，防止屬性解析失敗。

### 🔮 未來開發與規劃藍圖 (Upcoming Roadmap)
- [ ] **✉️ Email 郵件範本動態編輯與變數替換**：支援富文字/範本編輯與動態變數標籤 (`{Team_Name}`, `{Judge_Name}`, `{Password}` 等)。
- [ ] **📋 評分標準規準 (Rubrics) 與比賽簡章 URL 整合**：完整對接 `Year_Config` 中規準網址之儲存與前台連結顯示。
- [ ] **📊 115 評分進度動態矩陣圖表**：展現 6 大組別評審 A~I 的評分狀態 (🟢完稿 / 🟡暫存 / ⚪未評)。
- [ ] **🏆 115 獎項擬定與 SheetJS Excel 匯出**：依據特優/優等 (錄取不超過 1/3) 及特色獎規則自動算分排名，並提供 Excel 總表匯出。

---

## [v75.1-115] - 2026-08-19

### 🚀 115 學年度比賽規範對齊
- **年度設定**：全系統預設比賽學年度切換為 **115 學年度**。
- **組別名稱對齊**：更新 6 大組別全銜為「【宜蘭在地自然人文特色】國中/國小組」、「【環境永續×SDGs及生活裡的永續】國中/國小組」、「【學校校訂課程】國中/國小組」。
- **115 新增欄位**：
  - 前端評審介面 (`JudgeView`)、隊伍管理 (`AdminTeamsView`) 與資料庫 `Teams` 欄位加入 **`Course_Plan_Link` (校訂課程計畫 PDF)** 檢視按鈕與解析支援。
- **115 獎項名稱對齊**：
  - **特色優選獎**：🥇 特優獎、🥈 優等獎 (錄取名額合計不超過三分之一)。
  - **特色表現獎**：✨ 簡報之星、✨ 學習之星。

### 🎨 前端單頁模組化重構 (Frontend Refactoring)
- 將原 2,081 行單一檔案 `index.html` 拆解為乾淨之 ES 模組：
  - `css/style.css`：核心設計系統 (暖深棕 #3E2723 / 赤陶紅 #D84315 / 狀態燈號)。
  - `js/config.js`：115 全域變數、6大組別全銜與獎項定義。
  - `js/api.js`：前端 API 異步連動服務模組。
  - `js/app.js`：前端路由與調度中心。
  - `js/views/` 視圖模組：`login.js`, `judge.js`, `admin-teams.js`, `admin-judges.js`, `admin-config.js`, `admin-results.js`。

### ⚙️ 後端 GAS 商業邏輯模組化拆分 (Backend Refactoring)
- 將原 727 行單一檔案 `API.js` 拆分為單一職責模組：
  - `Router.js`：`doPost` 進入點、`API_Key` 安全性過濾與路由分發。
  - `Service_Auth.js`：處理身份登入驗證與評審下拉選單 (`login`, `getJudgeList`)。
  - `Service_Teams.js`：處理隊伍 CRUD 與 SheetJS 批次寫入 (`getAllTeams`, `saveTeam`, `importTeams`)。
  - `Service_Judges.js`：處理評審名單與密碼管理 (`getAllJudges`, `saveJudge`, `deleteJudge`)。
  - `Service_Scores.js`：處理評分數據提交與加權計算 (`submitScore`)。
  - `Service_Config.js`：處理系統設定與跨年度資料複製 (`getSystemConfig`, `saveSystemConfig`, `copyYearData`)。
  - `Database.js`：資料庫 Schema 與 `setupDatabase` 初始化指令。

---

## [v75.0] - 2026-02-28 (基底版本)
- 完成初始版 Login 登入頁面、評審管理 `JudgeManager`、隊伍管理 `TeamManager` 與系統設定檔。
