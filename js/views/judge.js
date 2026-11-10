/**
 * 簡報達人評分系統 115學年度 - 評審評分核心工作台 (js/views/judge.js)
 * 升級版：
 * 1. 嚴格鎖定評審負責組別 (不顯示未授權組別)
 * 2. 長者友善大字體設計 (全介面 >= 14px，重點 16px~32px)
 * 3. 影片播放雙重保險 (YouTube/Drive 智慧內嵌 + 醒目大按鈕外連)
 * 4. 40 / 30 / 20 / 10 配分直觀制 (滑桿拉到底即為該項滿分，直接相加 = 100)
 * 5. 115 評分規準側邊抽屜 (內建多元評量表 + 連動後台 Rubric_Link)
 * 6. 三重防遺失機制 (LocalStorage 秒級草稿 + 切換攔截自動存檔 + 關閉視窗提醒)
 */

window.JudgeView = function({ user, onLogout }) {
  const { useState, useEffect, useMemo } = React;

  const judgeCode = user.judge_code || user.id || 'A';
  const judgeName = user.name || user.judge_name || `評審 ${judgeCode}`;
  const allowedCategoriesStr = String(user.category_short || user.Category_Short || '').trim();
  const draftStorageKey = `pm115_draft_${judgeCode}`;

  const [teams, setTeams] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [activeTeamId, setActiveTeamId] = useState('');
  const [scoresMap, setScoresMap] = useState({});
  const [rubricUrl, setRubricUrl] = useState('');
  const [rulesUrl, setRulesUrl] = useState('');
  const [rubricDrawerOpen, setRubricDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [descExpanded, setDescExpanded] = useState(false);

  // 解析評審被授權的組別清單
  const allowedGroupList = useMemo(() => {
    if (!allowedCategoriesStr || allowedCategoriesStr === '全部') {
      return window.APP_CONFIG.ALL_CATEGORIES;
    }
    const rawList = allowedCategoriesStr.split(/[,，、;；]/).map(s => s.trim()).filter(Boolean);
    // 與標準 6 大組別進行比對
    const matched = window.APP_CONFIG.ALL_CATEGORIES.filter(stdCat =>
      rawList.some(r => stdCat === r || stdCat.includes(r) || r.includes(stdCat))
    );
    return matched.length > 0 ? matched : rawList;
  }, [allowedCategoriesStr]);

  // 1. 初始化載入：隊伍、評審雲端分數、系統設定 (Rubric_Link)、本機草稿
  useEffect(() => {
    loadData();
  }, []);

  // 第三重防護：若有任何未儲存至雲端的草稿，關閉瀏覽器分頁時攔截提醒
  useEffect(() => {
    const hasUnsaved = Object.values(scoresMap).some(s => s && (s.status === 'draft' || s.status === 'modified'));
    const handleBeforeUnload = (e) => {
      if (hasUnsaved) {
        e.preventDefault();
        e.returnValue = '您有尚未儲存至雲端試算表的評分草稿，確定要離開嗎？';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [scoresMap]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [teamsRes, scoresRes, configRes] = await Promise.all([
        window.ApiService.getAllTeams(window.APP_CONFIG.CURRENT_YEAR),
        window.ApiService.getJudgeScores(judgeCode, window.APP_CONFIG.CURRENT_YEAR),
        window.ApiService.getSystemConfig(window.APP_CONFIG.CURRENT_YEAR)
      ]);

      // A. 取得後台設定的評分規準連結 (Rubric_Link)
      if (configRes.status === 'success' && configRes.data) {
        setRubricUrl(configRes.data.rubric_link || '');
        setRulesUrl(configRes.data.rules_link || '');
      }

      // B. 嚴格過濾出該評審負責組別的隊伍
      let authorizedTeams = [];
      if (teamsRes.status === 'success' && Array.isArray(teamsRes.data)) {
        authorizedTeams = teamsRes.data.filter(t => {
          const cat = String(t.category || t.Category || t.group_name || t.Group_Name || '').trim();
          return allowedGroupList.some(allowed => cat === allowed || cat.includes(allowed) || allowed.includes(cat));
        });
        setTeams(authorizedTeams);
      }

      // C. 合併「雲端已存分數」與「本機 LocalStorage 暫存草稿」
      const mergedMap = {};
      if (scoresRes.status === 'success' && Array.isArray(scoresRes.data)) {
        scoresRes.data.forEach(s => {
          // 若舊資料是 0~100 制 (>40)，自動按比例轉為 40/30/20/10 配分制
          let c = Number(s.score_content ?? 32);
          let e = Number(s.score_expression ?? 24);
          let st = Number(s.score_stage ?? 16);
          let t = Number(s.score_technique ?? 8);
          if (c > 40 || e > 30 || st > 20 || t > 10) {
            c = Math.round(c * 0.40);
            e = Math.round(e * 0.30);
            st = Math.round(st * 0.20);
            t = Math.round(t * 0.10);
          }
          mergedMap[s.team_id] = {
            score_content: c,
            score_expression: e,
            score_stage: st,
            score_technique: t,
            award: s.award || s.award_recommendation || '',
            comment: s.comment || '',
            status: 'saved',
            last_updated: s.last_updated
          };
        });
      }

      // 讀取本機未送出草稿 (第一重防護回存)
      try {
        const localDraftRaw = localStorage.getItem(draftStorageKey);
        if (localDraftRaw) {
          const localDrafts = JSON.parse(localDraftRaw);
          Object.entries(localDrafts).forEach(([tid, draftObj]) => {
            if (draftObj && (draftObj.status === 'draft' || draftObj.status === 'modified')) {
              mergedMap[tid] = draftObj;
            }
          });
        }
      } catch (e) {
        console.warn('讀取本機草稿失敗:', e);
      }

      setScoresMap(mergedMap);

      // D. 預設選取第一個授權組別與第一支隊伍
      if (allowedGroupList.length > 0) {
        const defaultGroup = selectedGroup && allowedGroupList.includes(selectedGroup) ? selectedGroup : allowedGroupList[0];
        setSelectedGroup(defaultGroup);
        const firstInGroup = authorizedTeams.find(t => {
          const cat = String(t.category || t.Category || t.group_name || t.Group_Name || '').trim();
          return cat === defaultGroup || cat.includes(defaultGroup);
        }) || authorizedTeams[0];
        if (firstInGroup) {
          setActiveTeamId(firstInGroup.team_id || firstInGroup.Team_ID);
        }
      }
    } catch (err) {
      console.error('載入評審資料失敗:', err);
    }
    setLoading(false);
  };

  // 將草稿同步寫入 LocalStorage
  const syncDraftToLocal = (updatedMap) => {
    try {
      const onlyDrafts = {};
      Object.entries(updatedMap).forEach(([tid, sc]) => {
        if (sc && (sc.status === 'draft' || sc.status === 'modified')) {
          onlyDrafts[tid] = sc;
        }
      });
      localStorage.setItem(draftStorageKey, JSON.stringify(onlyDrafts));
    } catch (e) {
      console.warn('寫入本機草稿失敗:', e);
    }
  };

  // 顯示通知 Toast
  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  };

  // 直接相加總分計算：內容(40) + 表達(30) + 台風(20) + 技巧(10) = 100分
  const calculateTotal = (s) => {
    if (!s) return 80;
    const c = Number(s.score_content ?? 32);
    const e = Number(s.score_expression ?? 24);
    const st = Number(s.score_stage ?? 16);
    const t = Number(s.score_technique ?? 8);
    return Number((c + e + st + t).toFixed(1));
  };

  // 當前組別隊伍清單 (僅限該評審授權範圍)
  const filteredTeams = useMemo(() => {
    return teams.filter(t => {
      const cat = String(t.category || t.Category || t.group_name || t.Group_Name || '').trim();
      return !selectedGroup || cat === selectedGroup || cat.includes(selectedGroup);
    });
  }, [teams, selectedGroup]);

  // 計算當前組別各隊伍在該評審心中的即時排名 (Rank)
  const rankMap = useMemo(() => {
    const scoredList = [];
    filteredTeams.forEach(t => {
      const tid = t.team_id || t.Team_ID;
      const sc = scoresMap[tid];
      if (sc) {
        scoredList.push({ tid, total: calculateTotal(sc) });
      }
    });
    scoredList.sort((a, b) => b.total - a.total);
    const map = {};
    scoredList.forEach((item, idx) => {
      if (idx > 0 && item.total === scoredList[idx - 1].total) {
        map[item.tid] = map[scoredList[idx - 1].tid];
      } else {
        map[item.tid] = idx + 1;
      }
    });
    return map;
  }, [filteredTeams, scoresMap]);

  const activeTeam = teams.find(t => (t.team_id || t.Team_ID) === activeTeamId) || filteredTeams[0];

  // 目前隊伍的評分狀態 (預設約 8 成基準分：32 + 24 + 16 + 8 = 80)
  const currentScore = (activeTeam && scoresMap[activeTeam.team_id || activeTeam.Team_ID]) || {
    score_content: 32,
    score_expression: 24,
    score_stage: 16,
    score_technique: 8,
    award: '',
    comment: '',
    status: 'unrated'
  };

  // 各指標滿分上限表
  const MAX_SCORES = {
    score_content: 40,
    score_expression: 30,
    score_stage: 20,
    score_technique: 10
  };

  // 更新目前評分欄位 + 第一重防護：立即寫入 LocalStorage
  const updateScoreField = (field, val) => {
    if (!activeTeam) return;
    const tid = activeTeam.team_id || activeTeam.Team_ID;
    let processedVal = val;
    if (MAX_SCORES[field] !== undefined) {
      const maxVal = MAX_SCORES[field];
      processedVal = Math.min(maxVal, Math.max(0, Number(val) || 0));
    }

    setScoresMap(prev => {
      const existing = prev[tid] || {
        score_content: 32,
        score_expression: 24,
        score_stage: 16,
        score_technique: 8,
        award: '',
        comment: ''
      };
      const nextStatus = existing.status === 'saved' ? 'modified' : 'draft';
      const nextMap = {
        ...prev,
        [tid]: {
          ...existing,
          [field]: processedVal,
          status: nextStatus
        }
      };
      syncDraftToLocal(nextMap);
      return nextMap;
    });
  };

  // 儲存/提交評分至後端試算表
  const handleSubmitScore = async (silent = false) => {
    if (!activeTeam) return false;
    const tid = activeTeam.team_id || activeTeam.Team_ID;

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
      setScoresMap(prev => {
        const nextMap = {
          ...prev,
          [tid]: {
            ...currentScore,
            status: 'saved',
            last_updated: new Date().toLocaleTimeString()
          }
        };
        syncDraftToLocal(nextMap);
        return nextMap;
      });
      if (!silent) {
        showToast(`✅ 【${activeTeam.work_title || activeTeam.Work_Title}】評分 (${total}分) 已成功存入雲端試算表！`);
      }
      return true;
    } else {
      alert(`❌ 儲存失敗: ${res.message}`);
      return false;
    }
  };

  // 第二重防護：切換隊伍或組別時，若當前隊伍有未儲存草稿，主動詢問是否先幫評審存檔
  const handleSafeSwitchTeam = async (targetTeamId, targetGroup = null) => {
    if (activeTeam) {
      const currentTid = activeTeam.team_id || activeTeam.Team_ID;
      const sc = scoresMap[currentTid];
      if (sc && (sc.status === 'draft' || sc.status === 'modified') && currentTid !== targetTeamId) {
        const wantSave = confirm(
          `⚠️ 提醒您：\n您剛才修改了【${activeTeam.work_title || activeTeam.Work_Title}】的評分，但尚未存入雲端試算表！\n\n按「確定」立即幫您儲存至雲端並切換；\n按「取消」則保留本機草稿稍後再存。`
        );
        if (wantSave) {
          await handleSubmitScore(false);
        }
      }
    }
    if (targetGroup) setSelectedGroup(targetGroup);
    if (targetTeamId) setActiveTeamId(targetTeamId);
    setDescExpanded(false);
  };

  // 增強版影片嵌入網址解析 (支援 YouTube 各種格式與 Google Drive 各種共用連結)
  const getEmbedVideoUrl = (url) => {
    if (!url) return null;
    const str = String(url).trim();
    if (!str) return null;

    // 1. YouTube (watch?v=, youtu.be/, embed/, shorts/, live/)
    const ytMatch = str.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch && ytMatch[1]) {
      return `https://www.youtube.com/embed/${ytMatch[1]}?rel=0`;
    }

    // 2. Google Drive (/file/d/ID/view or ?id=ID)
    const driveFileMatch = str.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || str.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (driveFileMatch && driveFileMatch[1]) {
      return `https://drive.google.com/file/d/${driveFileMatch[1]}/preview`;
    }

    // 3. 若本身已是 http 開頭的 mp4 或可嵌入連結
    if (str.startsWith('http')) {
      return str;
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
        <div className="text-center space-y-2">
          <span className="material-icons animate-spin text-5xl text-amber-900">sync</span>
          <p className="text-gray-800 font-bold text-lg">正在同步雲端隊伍與評審評分紀錄...</p>
        </div>
      </div>
    );
  }

  const rawVideoUrl = activeTeam ? (activeTeam.Video_Link || activeTeam.video_link || '') : '';
  const embedUrl = getEmbedVideoUrl(rawVideoUrl);
  const activeDesc = activeTeam ? String(activeTeam.description || activeTeam.Description || '').trim() : '';

  return (
    <div className="min-h-screen flex flex-col text-base" style={{ backgroundColor: 'var(--bg-light)' }}>
      {/* Toast 浮動提示 (加大字體) */}
      {toastMsg && (
        <div className="fixed top-5 right-5 z-50 bg-gray-900 text-white px-5 py-3.5 rounded-xl shadow-2xl flex items-center text-base font-bold border border-gray-700">
          <span className="material-icons text-emerald-400 mr-2 text-xl">check_circle</span>
          {toastMsg}
        </div>
      )}

      {/* 1. App Bar 頂部導覽列 */}
      <header className="bg-amber-950 text-white px-6 py-3.5 shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex items-center space-x-3">
          <span className="material-icons text-amber-400 text-3xl">workspace_premium</span>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-wide">
              115學年度 簡報達人評分系統 — {judgeName} (代號 {judgeCode})
            </h1>
            <p className="text-sm text-amber-200 font-medium">
              負責評審組別：{allowedGroupList.join('、')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setRubricDrawerOpen(true)}
            className="bg-amber-500 hover:bg-amber-400 text-amber-950 font-black text-sm px-4 py-2 rounded-lg flex items-center shadow-sm transition cursor-pointer"
          >
            <span className="material-icons text-base mr-1.5">menu_book</span>
            📋 查看評分標準規準
          </button>
          <button
            onClick={loadData}
            className="bg-amber-900 hover:bg-amber-800 text-amber-100 text-sm px-3.5 py-2 rounded-lg flex items-center font-semibold transition cursor-pointer"
          >
            <span className="material-icons text-base mr-1">refresh</span>同步雲端
          </button>
          <button
            onClick={onLogout}
            className="bg-red-700 hover:bg-red-800 text-white text-sm px-3.5 py-2 rounded-lg flex items-center font-bold transition shadow-xs cursor-pointer"
          >
            <span className="material-icons text-base mr-1">logout</span>登出
          </button>
        </div>
      </header>

      {/* 2. 組別切換與進度條 (嚴格只顯示該評審被授權的組別！) */}
      <div className="bg-white border-b px-6 py-3 flex flex-wrap justify-between items-center gap-4 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-sm font-bold text-gray-700 flex items-center">
            <span className="material-icons text-base mr-1 text-amber-900">folder_special</span>
            您的負責組別：
          </span>
          {allowedGroupList.map(g => (
            <button
              key={g}
              onClick={() => {
                const firstInGroup = teams.find(t => {
                  const cat = String(t.category || t.Category || t.group_name || t.Group_Name || '').trim();
                  return cat === g || cat.includes(g);
                });
                handleSafeSwitchTeam(firstInGroup ? (firstInGroup.team_id || firstInGroup.Team_ID) : '', g);
              }}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition cursor-pointer ${
                selectedGroup === g
                  ? 'bg-amber-900 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        {/* 進度統計 */}
        <div className="flex items-center space-x-3 text-sm">
          <span className="text-gray-700 font-bold">
            本組完稿進度：<strong className="text-emerald-700 text-base font-black">{savedCount}</strong> / {filteredTeams.length} 隊
          </span>
          <div className="w-32 h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 transition-all duration-300"
              style={{ width: `${filteredTeams.length > 0 ? (savedCount / filteredTeams.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* 3. 主工作台：左右雙欄 Split-Screen */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden p-4 gap-5 max-w-[1680px] w-full mx-auto">
        
        {/* 左側欄：隊伍清單與即時序位 (字體放大 >= 14px) */}
        <div className="w-full lg:w-96 bg-white rounded-xl border shadow-xs flex flex-col overflow-hidden shrink-0">
          <div className="p-3.5 bg-gray-50 border-b flex justify-between items-center">
            <span className="text-sm font-bold text-gray-800">
              {selectedGroup} 隊伍列表 ({filteredTeams.length}隊)
            </span>
            <span className="text-xs text-gray-500 font-medium">點選切換評分</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 max-h-[340px] lg:max-h-none">
            {filteredTeams.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">此組別目前尚無參賽隊伍</div>
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
                    onClick={() => handleSafeSwitchTeam(tid)}
                    className={`p-4 cursor-pointer transition flex justify-between items-center ${
                      isSelected
                        ? 'bg-amber-50 border-l-4 border-amber-900'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="space-y-1.5 pr-3 min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-mono font-bold px-2 py-0.5 bg-gray-200 text-gray-800 rounded">
                          #{idx + 1}
                        </span>
                        <p className="font-bold text-base text-gray-900 truncate">
                          {team.work_title || team.Work_Title}
                        </p>
                      </div>
                      <p className="text-sm text-gray-600 font-medium truncate pl-1">
                        🏫 {team.school || team.School}
                      </p>
                      {sc && sc.award && (
                        <span className="inline-block text-xs px-2 py-0.5 bg-amber-100 text-amber-900 rounded font-bold">
                          ✨ 推薦：{sc.award}
                        </span>
                      )}
                    </div>

                    {/* 右側：分數、即時序位與狀態燈號 */}
                    <div className="text-right shrink-0 space-y-1">
                      {teamTotal !== null ? (
                        <div>
                          <span className="text-lg font-black text-amber-900">{teamTotal}</span>
                          <span className="text-xs text-gray-500 ml-0.5">分</span>
                          {rank && (
                            <div className="text-xs font-bold text-blue-700">
                              暫居第 {rank}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-400 font-mono">-- 分</div>
                      )}

                      <div>
                        {!sc ? (
                          <span className="inline-block px-2.5 py-0.5 text-xs font-bold rounded-full bg-gray-100 text-gray-600">
                            ⚪ 未評
                          </span>
                        ) : sc.status === 'saved' ? (
                          <span className="inline-block px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800">
                            🟢 完稿
                          </span>
                        ) : (
                          <span className="inline-block px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-900">
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
          <div className="flex-1 overflow-y-auto space-y-5 pr-1">
            
            {/* 卡片 1: 作品基本資料、外部檔案按鈕與影片播放器 */}
            <div className="bg-white p-6 rounded-xl border shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b pb-3.5">
                <div>
                  <div className="flex items-center space-x-2.5">
                    <span className="px-3 py-1 bg-amber-100 text-amber-900 rounded-lg text-sm font-bold">
                      {activeTeam.category || activeTeam.Category || activeTeam.group_name || activeTeam.Group_Name}
                    </span>
                    <span className="text-base font-bold text-gray-700">
                      🏫 {activeTeam.school || activeTeam.School}
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-gray-900 mt-1.5">
                    {activeTeam.work_title || activeTeam.Work_Title}
                  </h2>
                </div>

                {/* 當前隊伍存檔狀態標示 */}
                <div className="text-right">
                  {currentScore.status === 'saved' ? (
                    <span className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800 font-bold flex items-center">
                      <span className="material-icons text-base mr-1">cloud_done</span>
                      已儲存於雲端試算表
                    </span>
                  ) : (currentScore.status === 'draft' || currentScore.status === 'modified') ? (
                    <span className="px-3 py-1.5 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-900 font-bold flex items-center">
                      <span className="material-icons text-base mr-1">edit_note</span>
                      本機已自動暫存 (請記得點下方儲存至雲端)
                    </span>
                  ) : null}
                </div>
              </div>

              {/* 作品說明 (手風琴展開/收合，字體 15px) */}
              {activeDesc ? (
                <div className="bg-gray-50 p-4 rounded-xl border text-sm sm:text-base space-y-1.5">
                  <div className={`text-gray-800 leading-relaxed ${descExpanded ? '' : 'line-clamp-2'}`}>
                    <strong className="text-gray-900 mr-1">📝 作品說明：</strong>
                    {activeDesc}
                  </div>
                  {activeDesc.length > 50 && (
                    <button
                      type="button"
                      onClick={() => setDescExpanded(!descExpanded)}
                      className="text-sm text-amber-900 font-bold flex items-center pt-1 hover:underline cursor-pointer"
                    >
                      <span className="material-icons text-base mr-0.5">
                        {descExpanded ? 'expand_less' : 'expand_more'}
                      </span>
                      {descExpanded ? '收合作品說明' : '展開完整說明'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-400 italic">無提供作品說明文字</div>
              )}

              {/* 參賽檔案連結按鈕列 (加大按鈕與 14px 字體) */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <span className="text-sm font-bold text-gray-700 mr-1">📂 作品檔案檢視：</span>
                
                {activeTeam.MindMap_Link ? (
                  <a
                    href={activeTeam.MindMap_Link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-sky-50 text-sky-900 rounded-xl border border-sky-300 hover:bg-sky-100 text-sm font-bold flex items-center transition shadow-2xs"
                  >
                    🧠 Mindomo 心智圖 ↗
                  </a>
                ) : (
                  <span className="px-3 py-1.5 bg-gray-100 text-gray-400 rounded-lg text-sm">無心智圖</span>
                )}

                {activeTeam.Slides_Link ? (
                  <a
                    href={activeTeam.Slides_Link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-amber-50 text-amber-900 rounded-xl border border-amber-300 hover:bg-amber-100 text-sm font-bold flex items-center transition shadow-2xs"
                  >
                    📊 簡報檔案 ↗
                  </a>
                ) : (
                  <span className="px-3 py-1.5 bg-gray-100 text-gray-400 rounded-lg text-sm">無簡報檔</span>
                )}

                {activeTeam.Consent_Link && (
                  <a
                    href={activeTeam.Consent_Link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-emerald-50 text-emerald-900 rounded-xl border border-emerald-300 hover:bg-emerald-100 text-sm font-bold flex items-center transition shadow-2xs"
                  >
                    📄 授權同意書 ↗
                  </a>
                )}

                {activeTeam.Course_Plan_Link ? (
                  <a
                    href={activeTeam.Course_Plan_Link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-purple-50 text-purple-900 rounded-xl border border-purple-300 hover:bg-purple-100 text-sm font-bold flex items-center transition shadow-2xs"
                  >
                    📑 校訂課程計畫 PDF ↗
                  </a>
                ) : (
                  String(activeTeam.category || activeTeam.group_name || '').includes('校訂課程') && (
                    <span className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-bold">⚠️ 未附校訂課程計畫</span>
                  )
                )}
              </div>

              {/* 影片播放區：雙重保險 (大按鈕外連 + 內嵌播放視窗) */}
              <div className="pt-2 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-red-50/70 p-3.5 rounded-xl border border-red-200">
                  <div className="flex items-center space-x-2">
                    <span className="material-icons text-red-600 text-2xl">smart_display</span>
                    <div>
                      <span className="text-sm font-bold text-gray-900 block">參賽作品發表影片 (5~8分鐘)</span>
                      <span className="text-xs text-gray-600">若下方內嵌畫面因雲端權限無法直接播放，請點擊右側紅色按鈕於新視窗全螢幕觀看</span>
                    </div>
                  </div>
                  {rawVideoUrl ? (
                    <a
                      href={rawVideoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-black flex items-center justify-center shadow-sm transition shrink-0"
                    >
                      🎬 點此另開大視窗全螢幕看影片 ↗
                    </a>
                  ) : (
                    <span className="px-4 py-2 bg-gray-200 text-gray-600 rounded-lg text-sm font-bold">
                      ⚠️ 此隊伍未提供影片連結
                    </span>
                  )}
                </div>

                {embedUrl && (
                  <div className="aspect-video w-full max-w-4xl bg-black rounded-xl overflow-hidden shadow-md border border-gray-300">
                    <iframe
                      src={embedUrl}
                      title="參賽作品發表影片"
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                      allowFullScreen
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 卡片 2: 四大指標配分直觀制 (40 / 30 / 20 / 10 = 100分) */}
            <div className="bg-white p-6 rounded-xl border shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b pb-4">
                <div>
                  <div className="flex items-center space-x-3">
                    <h3 className="font-black text-gray-900 text-lg sm:text-xl flex items-center">
                      <span className="material-icons text-amber-900 mr-1.5 text-2xl">tune</span>
                      四項指標配分評量 (滿分 100 分)
                    </h3>
                    <button
                      type="button"
                      onClick={() => setRubricDrawerOpen(true)}
                      className="px-3 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-sm font-bold flex items-center transition cursor-pointer"
                    >
                      <span className="material-icons text-base mr-1">help_outline</span>
                      對照評分規準細項
                    </button>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    各項滑桿拉到最右即為該項最高滿分（40分 + 30分 + 20分 + 10分 = 100分）
                  </p>
                </div>

                <div className="text-right bg-amber-50 px-5 py-2.5 rounded-xl border-2 border-amber-300 shrink-0">
                  <span className="text-xs font-bold text-amber-900 block">目前合計總分</span>
                  <div className="text-3xl font-black text-amber-900">
                    {calculateTotal(currentScore)} <span className="text-sm font-bold">/ 100 分</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {[
                  {
                    key: 'score_content',
                    label: '一、簡報內容 (最高 40 分)',
                    max: 40,
                    ticks: [0, 10, 20, 30, 40],
                    desc: '輔助材料完整性(10%)、資料考證與邏輯(10%)、觀點獨特性與創新(10%)、主題切合度(5%)、心智圖解說運用(5%)'
                  },
                  {
                    key: 'score_expression',
                    label: '二、表達能力 (最高 30 分)',
                    max: 30,
                    ticks: [0, 10, 15, 20, 25, 30],
                    desc: '內容內化程度與情感渲染力(10%)、口語流暢度與語速節奏(10%)、敘事架構與邏輯技巧(10%)'
                  },
                  {
                    key: 'score_stage',
                    label: '三、台風表現 (最高 20 分)',
                    max: 20,
                    ticks: [0, 5, 10, 15, 20],
                    desc: '自信與說服力、鏡頭眼神交流、肢體語言與團隊合作默契(15%)、時間掌控 5~8 分鐘(5%)'
                  },
                  {
                    key: 'score_technique',
                    label: '四、製作技巧 (最高 10 分)',
                    max: 10,
                    ticks: [0, 2, 4, 6, 8, 10],
                    desc: '影片剪輯流暢度、鏡頭運用、簡報排版視覺美感，以及資料引用出處、CC授權與AI標示規範(10%)'
                  }
                ].map(item => {
                  const val = Number(currentScore[item.key] ?? 0);
                  return (
                    <div key={item.key} className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
                      <div className="flex justify-between items-start gap-2">
                        <div className="space-y-1">
                          <div className="text-base font-black text-gray-900">{item.label}</div>
                          <div className="text-sm text-gray-600 leading-snug">{item.desc}</div>
                        </div>
                        <div className="flex items-center space-x-1.5 shrink-0 bg-white p-1 rounded-lg border shadow-2xs">
                          <button
                            type="button"
                            onClick={() => updateScoreField(item.key, val - 1)}
                            className="w-8 h-8 rounded-md bg-gray-100 hover:bg-gray-200 text-base font-black flex items-center justify-center cursor-pointer"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            max={item.max}
                            step="0.5"
                            value={val}
                            onChange={(e) => updateScoreField(item.key, e.target.value)}
                            className="w-16 text-center font-black text-xl text-amber-900 bg-white focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => updateScoreField(item.key, val + 1)}
                            className="w-8 h-8 rounded-md bg-gray-100 hover:bg-gray-200 text-base font-black flex items-center justify-center cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <input
                        type="range"
                        min="0"
                        max={item.max}
                        step="0.5"
                        value={val}
                        onChange={(e) => updateScoreField(item.key, e.target.value)}
                        className="w-full h-2.5 accent-amber-900 cursor-pointer"
                      />
                      <div className="flex justify-between text-xs text-gray-500 font-bold font-mono px-0.5">
                        {item.ticks.map(tk => (
                          <span key={tk}>{tk}分</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 卡片 3: 質性評語與特色推薦 + 儲存區 */}
            <div className="bg-white p-6 rounded-xl border shadow-xs space-y-4">
              <h3 className="font-black text-gray-900 text-lg flex items-center">
                <span className="material-icons text-amber-900 mr-1.5 text-2xl">rate_review</span>
                質性評語與 115 特色表現獎推薦
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="md:col-span-1 space-y-2">
                  <label className="block text-sm font-bold text-gray-800">
                    ✨ 特色表現獎推薦 (選填)
                  </label>
                  <select
                    value={currentScore.award || ''}
                    onChange={(e) => updateScoreField('award', e.target.value)}
                    className="w-full p-3 text-base border rounded-xl bg-white font-bold text-gray-900 shadow-2xs"
                  >
                    <option value="">-- 無特別推薦 --</option>
                    <option value="簡報之星">✨ 簡報之星 (2,000點e幣)</option>
                    <option value="學習之星">✨ 學習之星 (500點e幣)</option>
                  </select>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    若該隊伍未獲特優/優等，但簡報表現亮眼或達良好水平，可推薦角逐特色表現獎。
                  </p>
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="block text-sm font-bold text-gray-800">
                    💬 評審評語與寶貴建議 <span className="text-gray-500 font-normal">(將匿名提供參賽學生參考)</span>
                  </label>
                  <textarea
                    rows="3"
                    value={currentScore.comment || ''}
                    onChange={(e) => updateScoreField('comment', e.target.value)}
                    placeholder="請輸入對參賽學生的鼓勵、作品亮點或具體改進建議..."
                    className="w-full p-3 text-base border rounded-xl focus:ring-2 focus:ring-amber-900 focus:outline-none leading-relaxed"
                  />
                </div>
              </div>

              {/* 底部提交操作列 */}
              <div className="pt-4 border-t flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="text-sm">
                  {currentScore.status === 'saved' ? (
                    <span className="text-emerald-700 font-bold flex items-center">
                      🟢 此隊伍分數已安全儲存於雲端試算表 (總分：{calculateTotal(currentScore)} 分)
                    </span>
                  ) : (
                    <span className="text-amber-800 font-bold flex items-center">
                      🟡 您已調整評分 (已自動暫存於本機)，請點擊右側按鈕正式寫入雲端試算表！
                    </span>
                  )}
                </div>

                <button
                  onClick={() => handleSubmitScore(false)}
                  disabled={saving}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-xl text-white font-black text-base shadow-lg hover:opacity-95 transition flex items-center justify-center cursor-pointer"
                  style={{ backgroundColor: 'var(--secondary)' }}
                >
                  <span className={`material-icons text-xl mr-2 ${saving ? 'animate-spin' : ''}`}>
                    {saving ? 'sync' : 'cloud_upload'}
                  </span>
                  {saving ? '正在寫入雲端試算表...' : '儲存並提交本隊評分'}
                </button>
              </div>
            </div>

          </div>
        ) : (
          <div className="flex-1 bg-white rounded-xl border flex items-center justify-center text-gray-500 text-base font-bold">
            請從左側列表點選參賽隊伍開始評分
          </div>
        )}
      </div>

      {/* 4. 115 評分規準側邊抽屜 Modal (內建多元評量表 + 後台 Rubric_Link 按鈕) */}
      {rubricDrawerOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-end">
          <div className="bg-white w-full max-w-4xl h-full flex flex-col shadow-2xl overflow-hidden animate-fade-in">
            {/* 抽屜頂部 */}
            <div className="bg-amber-950 text-white px-6 py-4 flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-lg sm:text-xl font-bold flex items-center">
                  <span className="material-icons text-amber-400 mr-2">menu_book</span>
                  115宜蘭縣瘋學習簡報達人擂台賽 — 評分規準多元評量表
                </h2>
                <p className="text-xs text-amber-200 mt-0.5">評審可隨時對照各等級給分標準，關閉視窗不會影響正在填寫的分數</p>
              </div>
              <div className="flex items-center space-x-2">
                {rubricUrl && (
                  <a
                    href={rubricUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-amber-950 rounded-lg text-sm font-black flex items-center"
                  >
                    開啟官方評分規準文件 ↗
                  </a>
                )}
                {rulesUrl && (
                  <a
                    href={rulesUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 bg-amber-800 hover:bg-amber-700 text-white rounded-lg text-sm font-bold flex items-center"
                  >
                    比賽簡章 ↗
                  </a>
                )}
                <button
                  onClick={() => setRubricDrawerOpen(false)}
                  className="p-2 bg-red-700 hover:bg-red-800 text-white rounded-lg font-bold flex items-center text-sm cursor-pointer"
                >
                  <span className="material-icons text-lg mr-1">close</span>關閉
                </button>
              </div>
            </div>

            {/* 抽屜內容區 */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm sm:text-base bg-gray-50">
              {/* 量表 5~0 級距總說明 */}
              <div className="bg-white p-5 rounded-xl border shadow-2xs space-y-3">
                <h3 className="font-black text-gray-900 text-base border-b pb-2">📌 評分量表級距說明 (5 卓越 ～ 0 未呈現)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-sm">
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <strong className="text-emerald-900">5 (卓越 - 90%~100%配分)：</strong>遠超預期。具備極具巧思或獨創性見解。
                  </div>
                  <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                    <strong className="text-blue-900">4 (優異 - 80%~89%配分)：</strong>超出預期。內容深入且具清晰邏輯與高水準執行力。
                  </div>
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                    <strong className="text-amber-900">3 (良好 - 70%~79%配分)：</strong>符合預期。達到「學習之星」所要求的良好水平。
                  </div>
                  <div className="p-2.5 bg-gray-100 border border-gray-300 rounded-lg">
                    <strong className="text-gray-800">2 (尚可 - 60%~69%配分)：</strong>勉強符合。僅達到最基本要求，部分環節需加強。
                  </div>
                  <div className="p-2.5 bg-orange-50 border border-orange-200 rounded-lg">
                    <strong className="text-orange-900">1 (不足 - 1%~59%配分)：</strong>未達標準。未能完成該細項的基本要求。
                  </div>
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg">
                    <strong className="text-red-900">0 (未呈現 - 0分)：</strong>完全缺乏核心要素，或嚴重違反規範。
                  </div>
                </div>
              </div>

              {/* 一、簡報內容 (40%) */}
              <div className="bg-white p-5 rounded-xl border shadow-2xs space-y-3">
                <h3 className="font-black text-amber-900 text-base border-b pb-2">一、簡報內容（最高 40 分）</h3>
                <ul className="space-y-2 text-sm text-gray-800 list-disc list-inside">
                  <li><strong>輔助材料完整性 (10分)：</strong>照片、影片等輔助材料展示巧妙、完整深入，有效強化並支持主題論述。</li>
                  <li><strong>資料正確性與考證、結構邏輯 (10分)：</strong>論述邏輯嚴謹、結構化高，對問題展現深度探討。</li>
                  <li><strong>觀點獨特性與創新表現 (10分)：</strong>具備極具巧思的獨創性見解、方法或解決方案，不落俗套。</li>
                  <li><strong>主題切合度 (5分)：</strong>緊密切合所選主題組別，清晰展現學生主動發現問題的能力。</li>
                  <li><strong>心智圖解說運用 (5分)：</strong>Mindomo 心智圖架構極為清晰，解說精準展現思考脈絡（校訂課程組需說明與校訂課程之關連；在地/永續組需說明研究問題發想歷程）。</li>
                </ul>
              </div>

              {/* 二、表達能力 (30%) */}
              <div className="bg-white p-5 rounded-xl border shadow-2xs space-y-3">
                <h3 className="font-black text-amber-900 text-base border-b pb-2">二、表達能力（最高 30 分）</h3>
                <ul className="space-y-2 text-sm text-gray-800 list-disc list-inside">
                  <li><strong>內容內化程度與情感渲染力 (10分)：</strong>內容完全內化（非死背或照稿宣讀），講述具情感感染力與吸引力，能引發共鳴。</li>
                  <li><strong>口語流暢度 (10分)：</strong>表達流暢、語速適中、節奏掌握佳，少有停頓或口誤，極具說服力。</li>
                  <li><strong>敘事技巧 (10分)：</strong>善用敘事技巧安排簡報順序，故事性或邏輯堆疊引人入勝，強化聽眾對主題理解。</li>
                </ul>
              </div>

              {/* 三、台風表現 (20%) */}
              <div className="bg-white p-5 rounded-xl border shadow-2xs space-y-3">
                <h3 className="font-black text-amber-900 text-base border-b pb-2">三、台風表現（最高 20 分）</h3>
                <ul className="space-y-2 text-sm text-gray-800 list-disc list-inside">
                  <li><strong>自信、眼神交流、肢體語言與團隊默契 (15分)：</strong>展現高度自信與說服力，鏡頭眼神交流自然，肢體語言得體，團隊合作默契無間。</li>
                  <li><strong>時間掌控 (5分)：</strong>
                    <span className="text-emerald-800 font-bold">標準時間為 5:00 ～ 8:00</span>（完全符合且節奏完美得滿分；4:00~4:59 或 8:01~9:00 為輕微不符；低於 4:00 或超過 9:00 為嚴重不符）。
                  </li>
                </ul>
              </div>

              {/* 四、製作技巧 (10%) */}
              <div className="bg-white p-5 rounded-xl border shadow-2xs space-y-3">
                <h3 className="font-black text-amber-900 text-base border-b pb-2">四、製作技巧（最高 10 分）</h3>
                <ul className="space-y-2 text-sm text-gray-800 list-disc list-inside">
                  <li><strong>鏡頭、剪輯、排版、視覺呈現與授權規範 (10分)：</strong>影片剪輯流暢、鏡頭運用專業，排版精緻易讀；且<strong>完全符合著作權引述出處、創用 CC 授權標示與生成式 AI 輔助標示規範</strong>。</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
