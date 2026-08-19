/**
 * 簡報達人評分系統 115學年度 - 全域設定檔 (Config & Constants)
 */

window.APP_CONFIG = {
  // 1. 預設比賽年度
  CURRENT_YEAR: 115,

  // 2. Google Apps Script 部署網址 (後端 API Endpoint)
  API_URL: "https://script.google.com/macros/s/AKfycbwLRsiyHMiQzqyk52CBkmnASqJUznH3JWW50rzKNRNAuRGY5Ci8-IQNKxOOnxE99vLq/exec",

  // 3. API 通訊 Key
  API_KEY: "TEST_KEY_123",

  // 4. 115學年度 6 大競賽組別全銜
  ALL_CATEGORIES: [
    "【宜蘭在地自然人文特色】國中組",
    "【宜蘭在地自然人文特色】國小組",
    "【環境永續×SDGs及生活裡的永續】國中組",
    "【環境永續×SDGs及生活裡的永續】國小組",
    "【學校校訂課程】國中組",
    "【學校校訂課程】國小組"
  ],

  // 5. 115學年度 類別與組別對照表 Map
  CATEGORY_GROUP_MAP: {
    "宜蘭在地自然人文特色": [
      "【宜蘭在地自然人文特色】國中組",
      "【宜蘭在地自然人文特色】國小組"
    ],
    "環境永續×SDGs及生活裡的永續": [
      "【環境永續×SDGs及生活裡的永續】國中組",
      "【環境永續×SDGs及生活裡的永續】國小組"
    ],
    "學校校訂課程": [
      "【學校校訂課程】國中組",
      "【學校校訂課程】國小組"
    ]
  },

  // 6. 評分權重定義 (總和 100%)
  SCORING_WEIGHTS: {
    content: 0.40,     // 簡報內容 40%
    expression: 0.30,  // 表達能力 30%
    stage: 0.20,       // 臺風表現 20%
    technique: 0.10    // 製作技巧 10%
  },

  // 7. 115學年度 獎項設定 (對齊最新實施計畫)
  AWARDS: {
    RANK_AWARDS: ["特優獎", "優等獎"],
    FEATURE_AWARDS: ["簡報之星", "學習之星"]
  }
};
