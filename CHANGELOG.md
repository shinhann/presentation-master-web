# 簡報達人評分系統 — 開發與版本更新日誌 (Changelog)

本檔案為開發者專用之更新筆記，記錄專案版本演進、115學年度規範對齊與前後端架構重構歷程。

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
