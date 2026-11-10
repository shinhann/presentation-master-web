/**
 * 簡報達人評分系統 115學年度 - 評審評分核心工作台 (js/views/judge.js)
 * 第一回合：雙欄佈局、權限組別篩選、歷史評分回存、即時排名計算、滑桿微調與雲端儲存
 */

window.JudgeView = function({ user, onLogout }) {
  const { useState, useEffect, useMemo } = React;

  const [teams, setTeams] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [activeTeamId, setActiveTeamId] = useState('');
  const [scoresMap, setScoresMap] = useState({}); // { [teamId]: { score_content, score_expression, score_stage, score_technique, comment, award, status: 'saved' | 'draft' } }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [descExpanded, setDescExpanded] = useState(false);

  const judgeCode = user.judge_code || user.id || 'A';
  const judgeName = user.name || user.judge_name || `評審 ${judgeCode}`;
  const allowedCategoriesStr = String(user.category_short || user.Category_Short || '').trim();

  // 1. 初始化載入隊伍與該評審歷史評分紀錄
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [teamsRes, scoresRes] = await Promise.all([
        window.ApiService.getAllTeams(window.APP_CONFIG.CURRENT_YEAR),
        window.ApiService.getJudgeScores(judgeCode, window.APP_CONFIG.CURRENT_YEAR)
      ]);

      // A. 整理評審負責的隊伍
      let loadedTeams = [];
      if (teamsRes.status === 'success' && Array.isArray(teamsRes.data)) {
        loadedTeams = teamsRes.data;
        // 若評審設定有指定負責組別 (例如 "宜蘭在地國中組,宜蘭在地國小組")，進行過濾
        if (allowedCategoriesStr && allowedCategoriesStr !== '全部') {
          const allowedList = allowedCategoriesStr.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
          if (allowedList.length > 0) {
            const filteredByRole = loadedTeams.filter(t => {
              const cat = String(t.category || t.Category || t.group_name || t.Group_Name || '').trim();
              return allowedList.some(allowed => cat.includes(allowed) || allowed.includes(cat));
            });
            if (filteredByRole.length > 0) {
              loadedTeams = filteredByRole;
            }
          }
        }
        setTeams(loadedTeams);
      }

      // B. 載入歷史評分至 scoresMap
      if (scoresRes.status === 'success' && Array.isArray(scoresRes.data)) {
        const initialMap = {};
        scoresRes.data.forEach(s => {
          initialMap[s.team_id] = {
            score_content: Number(s.score_content ?? 80),
            score_expression: Number(s.score_expression ?? 80),
            score_stage: Number(s.score_stage ?? 80),
            score_technique: Number(s.score_technique ?? 80),
            award: s.award || s.award_recommendation || '',
            comment: s.comment || '',
            status: 'saved',
            last_updated: s.last_updated
          };
        });
        setScoresMap(initialMap);
      }

      // C. 預設選取第一個組別與第一支隊伍
      if (loadedTeams.length > 0) {
        const groups = [...new Set(loadedTeams.map(t => t.category || t.Category || t.group_name || t.Group_Name))].filter(Boolean);
        if (groups.length > 0) {
          const defaultGroup = selectedGroup && groups.includes(selectedGroup) ? selectedGroup : groups[0];
          setSelectedGroup(defaultGroup);
          const firstTeamInGroup = loadedTeams.find(t => (t.category || t.Category || t.group_name || t.Group_Name) === defaultGroup) || loadedTeams[0];
          setActiveTeamId(firstTeamInGroup.team_id || firstTeamInGroup.Team_ID);
        }
      }
    } catch (err) {
      console.error('載入評審資料失敗:', err);
    }
    setLoading(false);
  };

  // 顯示通知 Toast
  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3200);
  };

  // 加權總分計算：內容 40%, 表達 30%, 臺風 20%, 技巧 10%
  const calculateTotal = (s) => {
    if (!s) return '80.0';
    const c = Number(s.score_content ?? 80) * 0.40;
    const e = Number(s.score_expression ?? 80) * 0.30;
    const st = Number(s.score_stage ?? 80) * 0.20;
    const t = Number(s.score_technique ?? 80) * 0.10;
    return (c + e + st + t).toFixed(1);
  };

  // 所有可用組別
  const availableGroups = useMemo(() => {
    return [...new Set(teams.map(t => t.category || t.Category || t.group_name || t.Group_Name))].filter(Boolean);
  }, [teams]);

  // 當前組別隊伍清單
  const filteredTeams = useMemo(() => {
    return teams.filter(t => {
      const cat = t.category || t.Category || t.group_name || t.Group_Name;
      return !selectedGroup || cat === selectedGroup;
    });
  }, [teams, selectedGroup]);

  // 計算當前組別各隊伍在該評審心中的即時排名 (Rank)
  const rankMap = useMemo(() => {
    const scoredList = [];
    filteredTeams.forEach(t => {
      const tid = t.team_id || t.Team_ID;
      const sc = scoresMap[tid];
      if (sc) {
        scoredList.push({ tid, total: parseFloat(calculateTotal(sc)) });
      }
    });
    scoredList.sort((a, b) => b.total - a.total);
    const map = {};
    scoredList.forEach((item, idx) => {
      // 同分同名次處理
      if (idx > 0 && item.total === scoredList[idx - 1].total) {
        map[item.tid] = map[scoredList[idx - 1].tid];
      } else {
        map[item.tid] = idx + 1;
      }
    });
    return map;
  }, [filteredTeams, scoresMap]);

  const activeTeam = teams.find(t => (t.team_id || t.Team_ID) === activeTeamId) || filteredTeams[0];

  // 目前隊伍的評分狀態
  const currentScore = (activeTeam && scoresMap[activeTeam.team_id || activeTeam.Team_ID]) || {
    score_content: 80,
    score_expression: 80,
    score_stage: 80,
    score_technique: 80,
    award: '',
    comment: '',
    status: 'unrated'
  };

  // 更新目前評分欄位 (標記為 draft 暫存未送出)
  const updateScoreField = (field, val) => {
    if (!activeTeam) return;
    const tid = activeTeam.team_id || activeTeam.Team_ID;
    let processedVal = val;
    if (field.startsWith('score_')) {
      processedVal = Math.min(100, Math.max(0, Number(val) || 0));
    }
    setScoresMap(prev => {
      const existing = prev[tid] || {
        score_content: 80,
        score_expression: 80,
        score_stage: 80,
        score_technique: 80,
        award: '',
        comment: ''
      };
      return {
        ...prev,
        [tid]: {
          ...existing,
          [field]: processedVal,
          status: existing.status === 'saved' ? 'modified' : 'draft'
        }
      };
    });
  };

  // 儲存/提交評分至後端試算表
  const handleSubmitScore = async () => {
    if (!activeTeam) return;
    const tid = activeTeam.team_id || activeTeam.Team_ID;

    if (!currentScore.comment || String(currentScore.comment).trim().length < 2) {
      if (!confirm('您尚未填寫評語建議，確定要直接儲存評分嗎？')) {
        return;
      }
    }

    setSaving(true);
    const total = calculateTotal(currentScore);
    const cat = activeTeam.category || activeTeam.Category || activeTeam.group_name || activeTeam.Group_Name || '';

    const payload = {
      judge_code: judgeCode,
      competition_year: window.APP_CONFIG.CURRENT_YEAR,
      category: cat,
      group_name: cat,
      team_id: tid,
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
      setScoresMap(prev => ({
        ...prev,
        [tid]: {
          ...currentScore,
          status: 'saved',
          last_updated: new Date().toLocaleTimeString()
        }
      }));
      showToast(`✅ 【${activeTeam.work_title || activeTeam.Work_Title}】評分已成功寫入雲端試算表！`);
    } else {
      alert(`❌ 提交失敗: ${res.message}`);
    }
  };

  // 解析影片嵌入網址 (支援 YouTube 與 Google Drive 預覽)
  const getEmbedVideoUrl = (url) => {
    if (!url) return null;
    const str = String(url).trim();
    // YouTube
    const ytMatch = str.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch && ytMatch[1]) {
      return `https://www.youtube.com/embed/${ytMatch[1]}`;
    }
    // Google Drive 影片檔案
    const driveMatch = str.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1]) {
      return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
    }
    return null;
  };

  const savedCount = filteredTeams.filter(t => {
    const sc = scoresMap[t.team_id || t.Team_ID];
    return sc && sc.status === 'saved';
  }).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-light)' }}>
        <div className="text-center">
          <span className="material-icons animate-spin text-4xl text-amber-900 mb-2">sync</span>
          <p className="text-gray-700 font-bold text-sm">正在同步雲端隊伍與評審歷史評分紀錄...</p>
        </div>
      </div>
    );
  }

  const embedUrl = activeTeam ? getEmbedVideoUrl(activeTeam.Video_Link || activeTeam.video_link) : null;
  const activeDesc = activeTeam ? String(activeTeam.description || activeTeam.Description || '').trim() : '';

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-light)' }}>
      {/* Toast 浮動提示 */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center text-xs font-bold border border-gray-700">
          <span className="material-icons text-emerald-400 mr-2 text-base">check_circle</span>
          {toastMsg}
        </div>
      )}

      {/* 1. App Bar 頂部導覽列 */}
      <header className="bg-amber-950 text-white px-6 py-3 shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div className="flex items-center space-x-3">
          <span className="material-icons text-amber-400 text-2xl">workspace_premium</span>
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-wide">
              115學年度 簡報達人評分系統 — {judgeName} (代號 {judgeCode})
            </h1>
            <p className="text-[11px] text-amber-200">
              負責評審組別：{allowedCategoriesStr || '全部組別'}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={loadData}
            className="bg-amber-900 hover:bg-amber-800 text-amber-100 text-xs px-3 py-1.5 rounded-lg flex items-center transition"
            title="重新同步雲端資料"
          >
            <span className="material-icons text-sm mr-1">refresh</span>同步資料
          </button>
          <button
            onClick={onLogout}
            className="bg-red-700 hover:bg-red-800 text-white text-xs px-3 py-1.5 rounded-lg flex items-center font-bold transition shadow-xs"
          >
            <span className="material-icons text-sm mr-1">logout</span>登出
          </button>
        </div>
      </header>

      {/* 2. 組別切換與進度條 */}
      <div className="bg-white border-b px-6 py-2.5 flex flex-wrap justify-between items-center gap-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-gray-600 flex items-center">
            <span className="material-icons text-sm mr-1 text-amber-900">folder_special</span>切換評分組別：
          </span>
          {availableGroups.map(g => (
            <button
              key={g}
              onClick={() => {
                setSelectedGroup(g);
                const firstInGroup = teams.find(t => (t.category || t.Category || t.group_name || t.Group_Name) === g);
                if (firstInGroup) setActiveTeamId(firstInGroup.team_id || firstInGroup.Team_ID);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                selectedGroup === g
                  ? 'bg-amber-900 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        {/* 進度統計 */}
        <div className="flex items-center space-x-3 text-xs">
          <span className="text-gray-600 font-medium">
            本組完稿進度：<strong className="text-emerald-700 font-black">{savedCount}</strong> / {filteredTeams.length} 隊
          </span>
          <div className="w-28 h-2.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 transition-all duration-300"
              style={{ width: `${filteredTeams.length > 0 ? (savedCount / filteredTeams.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* 3. 主工作台：左右雙欄 Split-Screen */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden p-4 gap-4 max-w-[1600px] w-full mx-auto">
        
        {/* 左側欄：隊伍清單與即時序位 (寬度固定) */}
        <div className="w-full lg:w-80 bg-white rounded-xl border shadow-xs flex flex-col overflow-hidden shrink-0">
          <div className="p-3 bg-gray-50 border-b flex justify-between items-center">
            <span className="text-xs font-bold text-gray-700">參賽隊伍列表 ({filteredTeams.length}隊)</span>
            <span className="text-[11px] text-gray-400">點選切換隊伍</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 max-h-[320px] lg:max-h-none">
            {filteredTeams.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-400">此組別尚無隊伍資料</div>
            ) : (
              filteredTeams.map((team, idx) => {
                const tid = team.team_id || team.Team_ID;
                const sc = scoresMap[tid];
                const isSelected = activeTeam && (activeTeam.team_id || activeTeam.Team_ID) === tid;
                const rank = rankMap[tid];
                const teamTotal = sc ? calculateTotal(sc) : null;

                return (
                  <div
                    key={tid}
                    onClick={() => {
                      setActiveTeamId(tid);
                      setDescExpanded(false);
                    }}
                    className={`p-3.5 cursor-pointer transition flex justify-between items-center ${
                      isSelected
                        ? 'bg-amber-50/90 border-l-4 border-amber-900'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="space-y-1 pr-2 min-w-0 flex-1">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-[11px] font-mono font-bold px-1.5 py-0.2 bg-gray-200 text-gray-700 rounded">
                          #{idx + 1}
                        </span>
                        <p className="font-bold text-xs text-gray-900 truncate">
                          {team.work_title || team.Work_Title}
                        </p>
                      </div>
                      <p className="text-[11px] text-gray-500 truncate pl-1">
                        🏫 {team.school || team.School}
                      </p>
                      {sc && sc.award && (
                        <span className="inline-block text-[10px] px-1.5 py-0.2 bg-amber-100 text-amber-900 rounded font-bold">
                          ✨ 推薦：{sc.award}
                        </span>
                      )}
                    </div>

                    {/* 右側：分數、即時序位與狀態燈號 */}
                    <div className="text-right shrink-0 space-y-1">
                      {teamTotal ? (
                        <div>
                          <span className="text-sm font-black text-amber-900">{teamTotal}</span>
                          <span className="text-[10px] text-gray-400 ml-0.5">分</span>
                          {rank && (
                            <div className="text-[10px] font-bold text-blue-700">
                              暫居第 {rank}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-300 font-mono">-- 分</div>
                      )}

                      <div>
                        {!sc ? (
                          <span className="inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full bg-gray-100 text-gray-500">
                            ⚪ 未評
                          </span>
                        ) : sc.status === 'saved' ? (
                          <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800">
                            🟢 完稿
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800">
                            🟡 暫存未送出
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 右側欄：作品檢視與評分面板 */}
        {activeTeam ? (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            
            {/* 卡片 1: 作品基本資料、外部檔案按鈕與影片播放器 */}
            <div className="bg-white p-5 rounded-xl border shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b pb-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded text-xs font-bold">
                      {activeTeam.category || activeTeam.Category || activeTeam.group_name || activeTeam.Group_Name}
                    </span>
                    <span className="text-xs font-bold text-gray-600">
                      🏫 {activeTeam.school || activeTeam.School}
                    </span>
                  </div>
                  <h2 className="text-lg font-black text-gray-900 mt-1">
                    {activeTeam.work_title || activeTeam.Work_Title}
                  </h2>
                </div>

                {/* 當前隊伍狀態 */}
                <div className="text-right">
                  {currentScore.status === 'saved' && (
                    <span className="text-xs text-emerald-700 font-bold flex items-center">
                      <span className="material-icons text-sm mr-1">cloud_done</span>
                      已儲存於雲端
                    </span>
                  )}
                </div>
              </div>

              {/* 作品說明 (手風琴展開/收合) */}
              {activeDesc ? (
                <div className="bg-gray-50 p-3 rounded-lg border text-xs space-y-1">
                  <div className={`text-gray-700 leading-relaxed ${descExpanded ? '' : 'line-clamp-2'}`}>
                    <strong className="text-gray-900 mr-1">📝 作品說明：</strong>
                    {activeDesc}
                  </div>
                  {activeDesc.length > 60 && (
                    <button
                      type="button"
                      onClick={() => setDescExpanded(!descExpanded)}
                      className="text-[11px] text-amber-900 font-bold flex items-center pt-0.5 hover:underline"
                    >
                      <span className="material-icons text-xs mr-0.5">
                        {descExpanded ? 'expand_less' : 'expand_more'}
                      </span>
                      {descExpanded ? '收合作品說明' : '展開完整說明'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-xs text-gray-400 italic">無提供作品說明文字</div>
              )}

              {/* 參賽檔案連結按鈕列 */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs font-bold text-gray-600 mr-1">📂 作品附件檢視：</span>
                
                {activeTeam.MindMap_Link ? (
                  <a
                    href={activeTeam.MindMap_Link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-sky-50 text-sky-800 rounded-lg border border-sky-300 hover:bg-sky-100 text-xs font-bold flex items-center transition shadow-2xs"
                  >
                    🧠 Mindomo 心智圖 ↗
                  </a>
                ) : (
                  <span className="px-2.5 py-1 bg-gray-100 text-gray-400 rounded-lg text-xs">無心智圖</span>
                )}

                {activeTeam.Slides_Link ? (
                  <a
                    href={activeTeam.Slides_Link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-amber-50 text-amber-800 rounded-lg border border-amber-300 hover:bg-amber-100 text-xs font-bold flex items-center transition shadow-2xs"
                  >
                    📊 簡報檔案 ↗
                  </a>
                ) : (
                  <span className="px-2.5 py-1 bg-gray-100 text-gray-400 rounded-lg text-xs">無簡報檔</span>
                )}

                {activeTeam.Video_Link && (
                  <a
                    href={activeTeam.Video_Link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-red-50 text-red-800 rounded-lg border border-red-300 hover:bg-red-100 text-xs font-bold flex items-center transition shadow-2xs"
                  >
                    🎬 另開視窗看影片 ↗
                  </a>
                )}

                {activeTeam.Consent_Link && (
                  <a
                    href={activeTeam.Consent_Link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-300 hover:bg-emerald-100 text-xs font-bold flex items-center transition shadow-2xs"
                  >
                    📄 授權同意書 ↗
                  </a>
                )}

                {activeTeam.Course_Plan_Link ? (
                  <a
                    href={activeTeam.Course_Plan_Link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-purple-50 text-purple-800 rounded-lg border border-purple-300 hover:bg-purple-100 text-xs font-bold flex items-center transition shadow-2xs"
                  >
                    📑 校訂課程計畫 PDF ↗
                  </a>
                ) : (
                  String(activeTeam.category || activeTeam.group_name || '').includes('校訂課程') && (
                    <span className="px-2.5 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-bold">⚠️ 未附校訂課程計畫</span>
                  )
                )}
              </div>

              {/* 內嵌影片播放區 (若可解析為 YouTube 或 Drive Preview) */}
              {embedUrl && (
                <div className="pt-2">
                  <div className="aspect-video w-full max-w-3xl bg-black rounded-xl overflow-hidden shadow-inner border">
                    <iframe
                      src={embedUrl}
                      title="參賽作品發表影片"
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 卡片 2: 四大指標加權評分區 */}
            <div className="bg-white p-5 rounded-xl border shadow-xs space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <div>
                  <h3 className="font-bold text-gray-800 text-sm sm:text-base flex items-center">
                    <span className="material-icons text-amber-900 mr-1.5 text-lg">tune</span>
                    量化指標評分 (0 ~ 100 分)
                  </h3>
                  <p className="text-[11px] text-gray-500">可使用滑桿拖曳、點擊 +/- 微調或直接輸入數字</p>
                </div>
                <div className="text-right bg-amber-50 px-4 py-2 rounded-xl border border-amber-200">
                  <span className="text-[11px] font-bold text-amber-900 block">即時加權總分</span>
                  <div className="text-2xl font-black text-amber-900">
                    {calculateTotal(currentScore)} <span className="text-xs font-normal">分</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: 'score_content', label: '1. 簡報內容 (權重 40%)', desc: '資料考證、主題切合、觀點獨特性、心智圖解說運用' },
                  { key: 'score_expression', label: '2. 表達能力 (權重 30%)', desc: '內容內化程度、情感渲染力、口語流暢度、敘事技巧' },
                  { key: 'score_stage', label: '3. 臺風表現 (權重 20%)', desc: '自信說服力、鏡頭眼神交流、肢體語言、團隊默契與時間' },
                  { key: 'score_technique', label: '4. 製作技巧 (權重 10%)', desc: '鏡頭運鏡、剪輯流暢度、簡報排版與視覺美感' }
                ].map(item => {
                  const val = Number(currentScore[item.key] ?? 80);
                  return (
                    <div key={item.key} className="p-3.5 bg-gray-50 rounded-xl border space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-xs font-bold text-gray-800">{item.label}</div>
                          <div className="text-[11px] text-gray-500">{item.desc}</div>
                        </div>
                        <div className="flex items-center space-x-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => updateScoreField(item.key, val - 1)}
                            className="w-6 h-6 rounded bg-white border hover:bg-gray-100 text-xs font-bold flex items-center justify-center"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={val}
                            onChange={(e) => updateScoreField(item.key, e.target.value)}
                            className="w-14 text-center font-black text-sm text-amber-900 bg-white border rounded py-0.5"
                          />
                          <button
                            type="button"
                            onClick={() => updateScoreField(item.key, val + 1)}
                            className="w-6 h-6 rounded bg-white border hover:bg-gray-100 text-xs font-bold flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="100"
                        step="1"
                        value={val}
                        onChange={(e) => updateScoreField(item.key, e.target.value)}
                        className="w-full accent-amber-900 cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                        <span>50</span>
                        <span>60</span>
                        <span>70</span>
                        <span>80</span>
                        <span>90</span>
                        <span>100</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 卡片 3: 質性評語與特色推薦 + 儲存區 */}
            <div className="bg-white p-5 rounded-xl border shadow-xs space-y-4">
              <h3 className="font-bold text-gray-800 text-sm flex items-center">
                <span className="material-icons text-amber-900 mr-1.5 text-lg">rate_review</span>
                質性評量與 115 特色表現獎推薦
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-1 space-y-1.5">
                  <label className="block text-xs font-bold text-gray-700">
                    ✨ 特色表現獎推薦 (選填)
                  </label>
                  <select
                    value={currentScore.award || ''}
                    onChange={(e) => updateScoreField('award', e.target.value)}
                    className="w-full p-2.5 text-xs border rounded-lg bg-white font-semibold text-gray-800"
                  >
                    <option value="">-- 無推薦 --</option>
                    <option value="簡報之星">✨ 簡報之星 (每名學生 2,000點e幣)</option>
                    <option value="學習之星">✨ 學習之星 (每名學生 500點e幣)</option>
                  </select>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    若該隊伍未獲特優/優等，但具備特殊亮點，可推薦角逐特色表現獎。
                  </p>
                </div>

                <div className="md:col-span-2 space-y-1.5">
                  <label className="block text-xs font-bold text-gray-700">
                    💬 評審評語與建議 <span className="text-gray-400 font-normal">(將匿名提供參賽隊伍參考)</span>
                  </label>
                  <textarea
                    rows="3"
                    value={currentScore.comment || ''}
                    onChange={(e) => updateScoreField('comment', e.target.value)}
                    placeholder="請輸入對參賽學生的鼓勵、作品亮點或具體改進建議..."
                    className="w-full p-2.5 text-xs border rounded-lg focus:ring-2 focus:ring-amber-900 focus:outline-none"
                  />
                </div>
              </div>

              {/* 底部提交操作列 */}
              <div className="pt-3 border-t flex flex-col sm:flex-row justify-between items-center gap-3">
                <div className="text-xs text-gray-500">
                  {currentScore.status === 'saved' ? (
                    <span className="text-emerald-700 font-semibold">
                      🟢 此隊伍分數已存入雲端試算表 (總分：{calculateTotal(currentScore)})
                    </span>
                  ) : (
                    <span className="text-amber-700 font-semibold">
                      🟡 分數尚未儲存至雲端，請點擊右側按鈕完成存檔
                    </span>
                  )}
                </div>

                <button
                  onClick={handleSubmitScore}
                  disabled={saving}
                  className="w-full sm:w-auto px-8 py-3 rounded-xl text-white font-bold text-sm shadow-md hover:opacity-95 transition flex items-center justify-center cursor-pointer"
                  style={{ backgroundColor: 'var(--secondary)' }}
                >
                  <span className={`material-icons text-base mr-1.5 ${saving ? 'animate-spin' : ''}`}>
                    {saving ? 'sync' : 'cloud_upload'}
                  </span>
                  {saving ? '正在寫入雲端試算表...' : '儲存並提交本隊評分'}
                </button>
              </div>
            </div>

          </div>
        ) : (
          <div className="flex-1 bg-white rounded-xl border flex items-center justify-center text-gray-400 text-sm">
            請從左側列表點選參賽隊伍開始評分
          </div>
        )}
      </div>
    </div>
  );
};
