/**
 * 簡報達人評分系統 - API 服務層 (js/api.js)
 * 負責與 Google Apps Script (GAS) 後端 Web App 異步通訊
 */

window.ApiService = {
  /**
   * 發送 POST 請求至 GAS API
   */
  async request(action, payload = {}) {
    const apiUrl = window.APP_CONFIG.API_URL;
    const apiKey = window.APP_CONFIG.API_KEY;

    const requestBody = {
      action: action,
      API_Key: apiKey,
      year: window.APP_CONFIG.CURRENT_YEAR,
      competition_year: window.APP_CONFIG.CURRENT_YEAR,
      ...payload
    };

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8' // GAS 建議跨域寫法
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP 錯誤: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error(`[API Error] Action: ${action}`, error);
      return {
        status: 'error',
        message: error.message || '連線伺服器失敗，請檢查網路狀態。',
        data: null
      };
    }
  },

  // 1. 登入
  async login(userType, id, password) {
    return this.request('login', {
      user_type: userType,
      id: id,
      password: password
    });
  },

  // 2. 取得評審選單清單
  async getJudgeList() {
    return this.request('getJudgeList');
  },

  // 3. 取得系統與年度設定
  async getSystemConfig(year) {
    return this.request('getSystemConfig', { year: year || window.APP_CONFIG.CURRENT_YEAR });
  },

  // 4. 儲存系統設定
  async saveSystemConfig(configData) {
    return this.request('saveSystemConfig', configData);
  },

  // 5. 取得所有隊伍名單 (支援按年度)
  async getAllTeams(year) {
    return this.request('getAllTeams', { year: year || window.APP_CONFIG.CURRENT_YEAR });
  },

  // 6. 儲存單一隊伍
  async saveTeam(teamData) {
    return this.request('saveTeam', { team: teamData });
  },

  // 7. SheetJS 批次匯入隊伍名單
  async importTeams(teamsArray) {
    return this.request('importTeams', { teams: teamsArray });
  },

  // 8. 取得所有評審名單 (管理端)
  async getAllJudges(year) {
    return this.request('getAllJudges', { year: year || window.APP_CONFIG.CURRENT_YEAR });
  },

  // 9. 儲存評審名單
  async saveJudge(judgeData) {
    return this.request('saveJudge', { judge: judgeData });
  },

  // 10. 刪除評審
  async deleteJudge(judgeCode, year) {
    return this.request('deleteJudge', {
      judge_code: judgeCode,
      competition_year: year || window.APP_CONFIG.CURRENT_YEAR
    });
  },

  // 11. 提交評分數據
  async submitScore(scoreData) {
    return this.request('submitScore', scoreData);
  }
};
