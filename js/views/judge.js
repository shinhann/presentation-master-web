/**
 * 簡報達人評分系統 115學年度 - 評審評分介面模組 (js/views/judge.js)
 */

window.JudgeView = function({ user, onLogout }) {
  const { useState, useEffect } = React;

  const [teams, setTeams] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [activeTeamId, setActiveTeamId] = useState('');
  const [scoresMap, setScoresMap] = useState({}); // { teamId: { score_content, score_expression, score_stage, score_technique, comment, award } }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // 1. 初始化資料
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const res = await window.ApiService.getAllTeams(window.APP_CONFIG.CURRENT_YEAR);
    if (res.status === 'success' && Array.isArray(res.data)) {
      setTeams(res.data);
      if (res.data.length > 0) {
        // 預設選擇第一個組別
        const groups = [...new Set(res.data.map(t => t.group_name || t.Group_Name))].filter(Boolean);
        if (groups.length > 0) setSelectedGroup(groups[0]);
        setActiveTeamId(res.data[0].team_id || res.data[0].Team_ID);
      }
    }
    setLoading(false);
  };

  // 顯示通知
  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  // 目前選取組別的隊伍清單
  const filteredTeams = teams.filter(t => {
    const g = t.group_name || t.Group_Name;
    return !selectedGroup || g === selectedGroup;
  });

  const activeTeam = teams.find(t => (t.team_id || t.Team_ID) === activeTeamId) || filteredTeams[0];

  // 目前隊伍的評分狀態
  const currentScore = (activeTeamId && scoresMap[activeTeamId]) || {
    score_content: 80,
    score_expression: 80,
    score_stage: 80,
    score_technique: 80,
    award: '',
    comment: ''
  };

  // 加權總分計算：內容 40%, 表達 30%, 颱風 20%, 技巧 10%
  const calculateTotal = (s) => {
    const c = Number(s.score_content || 0) * 0.40;
    const e = Number(s.score_expression || 0) * 0.30;
    const st = Number(s.score_stage || 0) * 0.20;
    const t = Number(s.score_technique || 0) * 0.10;
    return (c + e + st + t).toFixed(1);
  };

  // 更新目前評分欄位
  const updateScoreField = (field, val) => {
    if (!activeTeamId) return;
    setScoresMap(prev => ({
      ...prev,
      [activeTeamId]: {
        ...(prev[activeTeamId] || currentScore),
        [field]: val
      }
    }));
  };

  // 儲存/提交評分至後端
  const handleSubmitScore = async () => {
    if (!activeTeam) return;
    setSaving(true);

    const teamId = activeTeam.team_id || activeTeam.Team_ID;
    const total = calculateTotal(currentScore);

    const payload = {
      judge_code: user.judge_code || user.id || 'A',
      competition_year: window.APP_CONFIG.CURRENT_YEAR,
      category: activeTeam.category || activeTeam.Category || '',
      group_name: activeTeam.group_name || activeTeam.Group_Name || '',
      team_id: teamId,
      score_content: currentScore.score_content,
      score_expression: currentScore.score_expression,
      score_stage: currentScore.score_stage,
      score_technique: currentScore.score_technique,
      total_score: total,
      award_recommendation: currentScore.award,
      comment: currentScore.comment
    };

    const res = await window.ApiService.submitScore(payload);
    setSaving(false);

    if (res.status === 'success') {
      showToast('✅ 評分已成功提交至 Google 試算表！');
    } else {
      showToast(`❌ 提交失敗: ${res.message}`);
    }
  };

  // 評分進度統計
  const ratedCount = filteredTeams.filter(t => scoresMap[t.team_id || t.Team_ID]).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <span className="material-icons animate-spin text-4xl text-amber-900 mb-2">sync</span>
          <p className="text-gray-600 font-medium">資料庫載入中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-light)' }}>
      {/* Toast 提示 */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2.5 rounded-lg shadow-lg flex items-center">
          <span className="material-icons text-emerald-400 mr-2">check_circle</span>
          {toastMsg}
        </div>
      )}

      {/* 1. App Bar 頂部列 */}
      <header className="bg-amber-950 text-white px-6 py-3 shadow-md flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <span className="material-icons text-amber-400 text-2xl">workspace_premium</span>
          <div>
            <h1 className="text-lg font-bold">簡報達人評審系統 — {user.name || user.judge_name || '評審'} 老師</h1>
            <p className="text-xs text-amber-200">負責類別: {user.category_short || '全組'}</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <button onClick={() => window.print()} className="hover:text-amber-300 text-sm flex items-center">
            <span className="material-icons text-base mr-1">print</span>列印評分表
          </button>
          <button onClick={loadData} className="hover:text-amber-300 text-sm flex items-center">
            <span className="material-icons text-base mr-1">refresh</span>重新整理
          </button>
          <button onClick={onLogout} className="bg-red-700 hover:bg-red-800 text-xs px-3 py-1.5 rounded-md flex items-center">
            <span className="material-icons text-sm mr-1">logout</span>登出
          </button>
        </div>
      </header>

      {/* 2. 組別切換與進度列 */}
      <div className="bg-white border-b px-6 py-2.5 flex justify-between items-center shadow-sm">
        <div className="flex space-x-2">
          {window.APP_CONFIG.ALL_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedGroup(cat)}
              className={`px-3 py-1.5 text-xs rounded-full font-medium transition ${
                selectedGroup === cat
                  ? 'bg-amber-900 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="text-xs font-semibold text-gray-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
          評分進度: <span className="text-amber-900 font-bold">{ratedCount}</span> / {filteredTeams.length} 隊
        </div>
      </div>

      {/* 3. 主要工作區域 (Split View) */}
      <div className="flex-1 flex overflow-hidden p-4 gap-4">
        {/* 左側：隊伍導覽 Sidebar */}
        <div className="w-80 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col">
          <div className="p-3 border-b bg-gray-50 text-xs font-bold text-gray-700 flex justify-between">
            <span>參賽隊伍列表</span>
            <span>{filteredTeams.length} 隊</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {filteredTeams.map((team, idx) => {
              const tid = team.team_id || team.Team_ID;
              const isRated = !!scoresMap[tid];
              const isActive = tid === activeTeamId;
              return (
                <div
                  key={tid}
                  onClick={() => setActiveTeamId(tid)}
                  className={`p-3 cursor-pointer transition flex justify-between items-start ${
                    isActive ? 'bg-amber-50 border-l-4 border-amber-900' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-xs font-bold text-gray-400">#{idx + 1}</span>
                      <h4 className="text-sm font-semibold text-gray-900 line-clamp-1">
                        {team.work_title || team.Work_Title || '無標題'}
                      </h4>
                    </div>
                    <p className="text-xs text-gray-500">{team.school || team.School}</p>
                  </div>
                  <div>
                    {isRated ? (
                      <span className="inline-block px-2 py-0.5 text-[10px] font-semibold rounded bg-emerald-100 text-emerald-800">
                        🟢 完稿
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 text-[10px] font-semibold rounded bg-gray-100 text-gray-600">
                        ⚪ 未評
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 右側：評分與作品細節區 */}
        {activeTeam ? (
          <div className="flex-1 overflow-y-auto space-y-4">
            {/* 卡片 1: 作品資訊與影音 */}
            <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{activeTeam.work_title || activeTeam.Work_Title}</h2>
                  <p className="text-sm text-gray-600 font-medium">{activeTeam.school || activeTeam.School} | 組別: {activeTeam.group_name || activeTeam.Group_Name}</p>
                </div>
              </div>

              {/* 作品說明 */}
              <p className="text-xs text-gray-700 bg-gray-50 p-3 rounded-lg border">
                {activeTeam.description || activeTeam.Description || '尚無作品說明'}
              </p>

              {/* 外部檔案與檢視按鈕 (含 115 校訂課程計畫 PDF) */}
              <div className="flex flex-wrap gap-2 text-xs">
                {activeTeam.MindMap_Link && (
                  <a href={activeTeam.MindMap_Link} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-sky-50 text-sky-700 rounded-md border border-sky-200 hover:bg-sky-100 flex items-center">
                    🧠 心智圖
                  </a>
                )}
                {activeTeam.Slides_Link && (
                  <a href={activeTeam.Slides_Link} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-md border border-amber-200 hover:bg-amber-100 flex items-center">
                    📊 簡報檔案
                  </a>
                )}
                {activeTeam.Consent_Link && (
                  <a href={activeTeam.Consent_Link} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-200 hover:bg-emerald-100 flex items-center">
                    📄 授權同意書
                  </a>
                )}
                {activeTeam.Course_Plan_Link && (
                  <a href={activeTeam.Course_Plan_Link} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-md border border-purple-200 hover:bg-purple-100 flex items-center">
                    📘 校訂課程計畫 (115新)
                  </a>
                )}
              </div>
            </div>

            {/* 卡片 2: 四大權重評分滑桿 */}
            <div className="bg-white p-5 rounded-xl border shadow-sm space-y-5">
              <div className="flex justify-between items-center border-b pb-3">
                <h3 className="font-bold text-gray-800 text-base">四項指標權重評分 (100% 滿分制)</h3>
                <div className="text-right">
                  <span className="text-xs text-gray-500">即時加權總分</span>
                  <div className="text-2xl font-black text-amber-900">{calculateTotal(currentScore)} <span className="text-xs text-gray-400">分</span></div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. 簡報內容 (40%) */}
                <div className="p-3 bg-gray-50 rounded-lg space-y-2">
                  <div className="flex justify-between text-xs font-bold text-gray-700">
                    <span>1. 簡報內容 (權重 40%)</span>
                    <span className="text-amber-900 font-extrabold">{currentScore.score_content} 分</span>
                  </div>
                  <input
                    type="range" min="50" max="100" step="1"
                    value={currentScore.score_content}
                    onChange={(e) => updateScoreField('score_content', e.target.value)}
                    className="w-full"
                  />
                </div>

                {/* 2. 表達能力 (30%) */}
                <div className="p-3 bg-gray-50 rounded-lg space-y-2">
                  <div className="flex justify-between text-xs font-bold text-gray-700">
                    <span>2. 表達能力 (權重 30%)</span>
                    <span className="text-amber-900 font-extrabold">{currentScore.score_expression} 分</span>
                  </div>
                  <input
                    type="range" min="50" max="100" step="1"
                    value={currentScore.score_expression}
                    onChange={(e) => updateScoreField('score_expression', e.target.value)}
                    className="w-full"
                  />
                </div>

                {/* 3. 臺風表現 (20%) */}
                <div className="p-3 bg-gray-50 rounded-lg space-y-2">
                  <div className="flex justify-between text-xs font-bold text-gray-700">
                    <span>3. 臺風表現 (權重 20%)</span>
                    <span className="text-amber-900 font-extrabold">{currentScore.score_stage} 分</span>
                  </div>
                  <input
                    type="range" min="50" max="100" step="1"
                    value={currentScore.score_stage}
                    onChange={(e) => updateScoreField('score_stage', e.target.value)}
                    className="w-full"
                  />
                </div>

                {/* 4. 製作技巧 (10%) */}
                <div className="p-3 bg-gray-50 rounded-lg space-y-2">
                  <div className="flex justify-between text-xs font-bold text-gray-700">
                    <span>4. 製作技巧 (權重 10%)</span>
                    <span className="text-amber-900 font-extrabold">{currentScore.score_technique} 分</span>
                  </div>
                  <input
                    type="range" min="50" max="100" step="1"
                    value={currentScore.score_technique}
                    onChange={(e) => updateScoreField('score_technique', e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* 卡片 3: 特色推薦與評語 */}
            <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
              <h3 className="font-bold text-gray-800 text-sm">質性評量與特色推薦 (115學年度)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">特色表現獎推薦</label>
                  <select
                    value={currentScore.award}
                    onChange={(e) => updateScoreField('award', e.target.value)}
                    className="w-full p-2 text-xs border rounded-lg bg-white"
                  >
                    <option value="">-- 無推薦 --</option>
                    <option value="簡報之星">✨ 簡報之星 (2000e幣)</option>
                    <option value="學習之星">✨ 學習之星 (500e幣)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">評語 (評審寶貴建議)</label>
                  <textarea
                    rows="3"
                    value={currentScore.comment}
                    onChange={(e) => updateScoreField('comment', e.target.value)}
                    placeholder="請輸入給參賽團隊的鼓勵與建議..."
                    className="w-full p-2 text-xs border rounded-lg"
                  />
                </div>
              </div>

              {/* 提交按鈕 */}
              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleSubmitScore}
                  disabled={saving}
                  className="px-6 py-2.5 rounded-lg text-white font-bold text-sm shadow-md transition"
                  style={{ backgroundColor: 'var(--secondary)' }}
                >
                  {saving ? '存檔中...' : '提交隊伍評分數據'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-white rounded-xl flex items-center justify-center text-gray-400">
            請點選左側隊伍開始評分
          </div>
        )}
      </div>
    </div>
  );
};
