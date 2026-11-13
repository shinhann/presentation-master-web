/**
 * 簡報達人評分系統 115學年度 - 評審評分核心工作台 (js/views/judge.js)
 * 升級版 (v76.1-115)：
 * 1. 嚴格鎖定評審負責組別 (不顯示未授權組別)
 * 2. 簡潔三段字體大小切換：【小】/【中】/【大】 + 左側隊伍列表全面放大
 * 3. 影片播放雙重保險 (YouTube/Drive 智慧內嵌 + 醒目大按鈕外連)
 * 4. 40 / 30 / 20 / 10 配分直觀制 (滑桿拉到底即為該項滿分，直接相加 = 100)
 * 5. 115 評分規準側邊抽屜 (內建多元評量表 + 連動後台 Rubric_Link)
 * 6. 三重防遺失機制 (LocalStorage 秒級草稿 + 切換攔截自動存檔 + 關閉視窗提醒)
 * 7. 單一清晰入口「本組評分總表 (簽名單)」(A4 橫向跨頁表頭重複、斑馬紋、以下空白、簽名處 + 雲端 Google 試算表自動排版產生)
 * 8. 完評下一步操作導引說明 (進度達 100% 時自動提示列印與簽名流程)
 */

window.JudgeView = function({ user, onLogout }) {
  const { useState, useEffect, useMemo } = React;

  const judgeCode = user.judge_code || user.id || 'A';
  const judgeName = user.name || user.judge_name || `評審 ${judgeCode}`;
  const allowedCategoriesStr = String(user.category_short || user.Category_Short || '').trim();
  const draftStorageKey = `pm115_draft_${judgeCode}`;
  const fontScaleStorageKey = `pm115_font_scale_${judgeCode}`;

  const [teams, setTeams] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [activeTeamId, setActiveTeamId] = useState('');
  const [scoresMap, setScoresMap] = useState({});
  const [rubricUrl, setRubricUrl] = useState('');
  const [rulesUrl, setRulesUrl] = useState('');
  const [rubricDrawerOpen, setRubricDrawerOpen] = useState(false);
  const [printSheetOpen, setPrintSheetOpen] = useState(false);
  const [exportingSheet, setExportingSheet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [descExpanded, setDescExpanded] = useState(false);

  // 字體大小狀態：'sm' (小) | 'md' (中 - 預設) | 'lg' (大)
  const [fontScale, setFontScale] = useState(() => {
    try {
      const saved = localStorage.getItem(fontScaleStorageKey);
      if (saved === 'xl') return 'lg';
      if (saved === 'sm' || saved === 'md' || saved === 'lg') return saved;
      return 'md';
    } catch (e) {
      return 'md';
    }
  });

  const handleChangeFontScale = (newScale) => {
    setFontScale(newScale);
    try {
      localStorage.setItem(fontScaleStorageKey, newScale);
    } catch (e) {
      // ignore storage error
    }
  };

  // 字級對應樣式映射表 (小 / 中 / 大)
  const uiScale = useMemo(() => {
    if (fontScale === 'lg') {
      return {
        sidebarWidth: 'w-full lg:w-[470px] xl:w-[500px]',
        sidebarHeader: 'text-lg',
        teamIdxBadge: 'text-base px-2.5 py-0.5',
        teamTitle: 'text-xl leading-snug',
        teamSchool: 'text-lg',
        teamScore: 'text-3xl',
        teamRank: 'text-base',
        teamStatus: 'text-sm px-3 py-1',
        cardTitle: 'text-2xl sm:text-3xl',
        cardBody: 'text-lg leading-relaxed',
        sliderLabel: 'text-xl',
        sliderDesc: 'text-base leading-relaxed',
        sliderInput: 'text-2xl w-20',
        commentText: 'text-xl leading-relaxed'
      };
    }
    if (fontScale === 'sm') {
      return {
        sidebarWidth: 'w-full lg:w-96',
        sidebarHeader: 'text-sm',
        teamIdxBadge: 'text-xs px-2 py-0.5',
        teamTitle: 'text-base leading-snug',
        teamSchool: 'text-sm',
        teamScore: 'text-xl',
        teamRank: 'text-xs',
        teamStatus: 'text-xs px-2.5 py-0.5',
        cardTitle: 'text-xl sm:text-2xl',
        cardBody: 'text-base leading-relaxed',
        sliderLabel: 'text-base',
        sliderDesc: 'text-sm leading-snug',
        sliderInput: 'text-xl w-16',
        commentText: 'text-base leading-relaxed'
      };
    }
    // 預設 'md' (中 - 舒適易讀大字)
    return {
      sidebarWidth: 'w-full lg:w-[420px] xl:w-[450px]',
      sidebarHeader: 'text-base',
      teamIdxBadge: 'text-sm px-2.5 py-0.5',
      teamTitle: 'text-lg leading-snug',
      teamSchool: 'text-base',
      teamScore: 'text-2xl',
      teamRank: 'text-sm',
      teamStatus: 'text-xs sm:text-sm px-3 py-0.5',
      cardTitle: 'text-xl sm:text-2xl',
      cardBody: 'text-base sm:text-lg leading-relaxed',
      sliderLabel: 'text-lg',
      sliderDesc: 'text-sm sm:text-base leading-snug',
      sliderInput: 'text-xl w-18',
      commentText: 'text-lg leading-relaxed'
    };
  }, [fontScale]);

  // 解析評審被授權的組別清單
  const allowedGroupList = useMemo(() => {
    if (!allowedCategoriesStr || allowedCategoriesStr === '全部') {
      return window.APP_CONFIG.ALL_CATEGORIES;
    }
    const rawList = allowedCategoriesStr.split(/[,，、;；]/).map(s => s.trim()).filter(Boolean);
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

      if (configRes.status === 'success' && configRes.data) {
        setRubricUrl(configRes.data.rubric_link || '');
        setRulesUrl(configRes.data.rules_link || '');
      }

      let authorizedTeams = [];
      if (teamsRes.status === 'success' && Array.isArray(teamsRes.data)) {
        authorizedTeams = teamsRes.data.filter(t => {
          const cat = String(t.category || t.Category || t.group_name || t.Group_Name || '').trim();
          const matchesCategory = allowedGroupList.some(allowed => cat === allowed || cat.includes(allowed) || allowed.includes(cat));
          // 評審端自動過濾：無簡報且無影片者判定為「未繳件」，不列入評審打分
          const slides = (t.slides_link || t.Slides_Link || '').trim();
          const video = (t.video_link || t.Video_Link || '').trim();
          const isSubmitted = !!(slides || video);
          return matchesCategory && isSubmitted;
        });
        setTeams(authorizedTeams);
      }

      const mergedMap = {};
      if (scoresRes.status === 'success' && Array.isArray(scoresRes.data)) {
        scoresRes.data.forEach(s => {
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

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4500);
  };

  const calculateTotal = (s) => {
    if (!s) return 80;
    const c = Number(s.score_content ?? 32);
    const e = Number(s.score_expression ?? 24);
    const st = Number(s.score_stage ?? 16);
    const t = Number(s.score_technique ?? 8);
    return Number((c + e + st + t).toFixed(1));
  };

  const filteredTeams = useMemo(() => {
    return teams.filter(t => {
      const cat = String(t.category || t.Category || t.group_name || t.Group_Name || '').trim();
      return !selectedGroup || cat === selectedGroup || cat.includes(selectedGroup);
    });
  }, [teams, selectedGroup]);

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

  const currentScore = (activeTeam && scoresMap[activeTeam.team_id || activeTeam.Team_ID]) || {
    score_content: 32,
    score_expression: 24,
    score_stage: 16,
    score_technique: 8,
    award: '',
    comment: '',
    status: 'unrated'
  };

  const MAX_SCORES = {
    score_content: 40,
    score_expression: 30,
    score_stage: 20,
    score_technique: 10
  };

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
      let nextSavedCount = 0;
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
        nextSavedCount = filteredTeams.filter(t => {
          const s = nextMap[t.team_id || t.Team_ID];
          return s && s.status === 'saved';
        }).length;
        return nextMap;
      });
      if (!silent) {
        if (filteredTeams.length > 0 && nextSavedCount === filteredTeams.length) {
          showToast(`🎉 恭喜！本組 (${selectedGroup}) 所有隊伍已全數評分完畢！請點選上方「本組評分總表 (簽名單)」列印並簽名。`);
        } else {
          showToast(`✅ 【${activeTeam.work_title || activeTeam.Work_Title}】評分 (${total}分) 已成功存入雲端試算表！`);
        }
      }
      return true;
    } else {
      alert(`❌ 儲存失敗: ${res.message}`);
      return false;
    }
  };

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

  const getEmbedVideoUrl = (url) => {
    if (!url) return null;
    const str = String(url).trim();
    if (!str) return null;

    const ytMatch = str.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch && ytMatch[1]) {
      return `https://www.youtube.com/embed/${ytMatch[1]}?rel=0`;
    }

    const driveFileMatch = str.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || str.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (driveFileMatch && driveFileMatch[1]) {
      return `https://drive.google.com/file/d/${driveFileMatch[1]}/preview`;
    }

    if (str.startsWith('http')) {
      return str;
    }
    return null;
  };

  // 產生並開啟雲端格式化 Google 試算表評分表
  const handleOpenGoogleSheet = async () => {
    setExportingSheet(true);
    try {
      const rowsPayload = filteredTeams.map((team, idx) => {
        const tid = team.team_id || team.Team_ID;
        const sc = scoresMap[tid];
        return {
          seq_label: `第 ${String(idx + 1).padStart(2, '0')} 隊`,
          school: team.school || team.School || '',
          team_name: team.team_name || team.Team_Name || '',
          work_title: team.work_title || team.Work_Title || '',
          description: String(team.description || team.Description || '').trim(),
          course_link: team.Course_Plan_Link || team.course_plan_link || '',
          slides_link: team.Slides_Link || team.slides_link || '',
          mindmap_link: team.MindMap_Link || team.mindmap_link || '',
          video_link: team.Video_Link || team.video_link || '',
          score_content: sc ? sc.score_content : '',
          score_expression: sc ? sc.score_expression : '',
          score_stage: sc ? sc.score_stage : '',
          score_technique: sc ? sc.score_technique : '',
          total_score: sc ? calculateTotal(sc) : 0,
          rank: sc ? (rankMap[tid] || '') : '',
          comment: sc ? (sc.comment || '') : ''
        };
      });

      const res = await window.ApiService.exportJudgeSheet({
        judge_code: judgeCode,
        judge_name: judgeName,
        category: selectedGroup,
        rows: rowsPayload
      });

      if (res.status === 'success' && res.data && res.data.sheet_url) {
        window.open(res.data.sheet_url, '_blank', 'noopener,noreferrer');
        showToast('✅ 已在雲端試算表自動建立完整排版之評分表，並於新分頁開啟！');
      } else {
        alert(`❌ 產生 Google 試算表失敗：${res.message || '未知錯誤'}`);
      }
    } catch (err) {
      alert(`❌ 產生失敗：${err.message}`);
    }
    setExportingSheet(false);
  };

  const savedCount = filteredTeams.filter(t => {
    const sc = scoresMap[t.team_id || t.Team_ID];
    return sc && sc.status === 'saved';
  }).length;

  const isGroupAllCompleted = filteredTeams.length > 0 && savedCount === filteredTeams.length;

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
  const isCourseGroup = String(selectedGroup || '').includes('校訂課程');

  return (
    <div className="min-h-screen flex flex-col text-base" style={{ backgroundColor: 'var(--bg-light)' }}>
      {/* Toast 浮動提示 */}
      {toastMsg && (
        <div className="no-print fixed top-5 right-5 z-50 bg-gray-900 text-white px-5 py-3.5 rounded-xl shadow-2xl flex items-center text-base font-bold border border-gray-700 max-w-xl">
          <span className="material-icons text-emerald-400 mr-2 text-xl shrink-0">check_circle</span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* =========================================================
          主工作台外層 (當開啟評分表列印時標記 no-print，確保列印只印評分表)
         ========================================================= */}
      <div className="no-print flex-1 flex flex-col min-h-screen">
        {/* 1. App Bar 頂部導覽列 (列印總表按鈕唯一入口，與同步、登出並列) */}
        <header className="bg-amber-950 text-white px-6 py-3.5 shadow-md flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3">
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
            {/* 簡潔三段字體切換器：只顯示「小、中、大」 */}
            <div className="flex items-center bg-amber-900/90 border border-amber-700 rounded-xl p-1 mr-1">
              <span className="text-sm text-amber-200 font-bold px-2 flex items-center">
                <span className="material-icons text-base mr-1">format_size</span>字體：
              </span>
              {[
                { id: 'sm', label: '小' },
                { id: 'md', label: '中' },
                { id: 'lg', label: '大' }
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleChangeFontScale(opt.id)}
                  className={`px-3 py-1 rounded-lg text-sm font-black transition cursor-pointer ${
                    fontScale === opt.id
                      ? 'bg-amber-400 text-amber-950 shadow-xs'
                      : 'text-amber-100 hover:bg-amber-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* 單一列印總表按鈕 (僅保留一個印表機圖示) */}
            <button
              onClick={() => setPrintSheetOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm px-4 py-2 rounded-lg flex items-center shadow-sm transition cursor-pointer"
            >
              <span className="material-icons text-base mr-1.5">print</span>
              本組評分總表 (簽名單)
            </button>

            <button
              onClick={() => setRubricDrawerOpen(true)}
              className="bg-amber-500 hover:bg-amber-400 text-amber-950 font-black text-sm px-4 py-2 rounded-lg flex items-center shadow-sm transition cursor-pointer"
            >
              <span className="material-icons text-base mr-1.5">menu_book</span>
              查看評分標準規準
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

        {/* 2. 組別切換與進度條 */}
        <div className="bg-white border-b px-6 py-3 flex flex-wrap justify-between items-center gap-4 shadow-2xs">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-base font-bold text-gray-800 flex items-center">
              <span className="material-icons text-lg mr-1 text-amber-900">folder_special</span>
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
                className={`px-4 py-2 rounded-xl text-base font-bold transition cursor-pointer ${
                  selectedGroup === g
                    ? 'bg-amber-900 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          {/* 進度統計與下一步簡短提醒 */}
          <div className="flex flex-wrap items-center gap-4 text-sm sm:text-base">
            <div className="flex items-center space-x-3">
              <span className="text-gray-800 font-bold">
                本組完稿進度：<strong className="text-emerald-700 text-lg font-black">{savedCount}</strong> / {filteredTeams.length} 隊
              </span>
              <div className="w-32 h-3.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 transition-all duration-300"
                  style={{ width: `${filteredTeams.length > 0 ? (savedCount / filteredTeams.length) * 100 : 0}%` }}
                />
              </div>
            </div>
            <span className="text-sm text-amber-900 font-bold bg-amber-50 px-3 py-1 rounded-lg border border-amber-200">
              💡 全部評完後，請點選右上角「本組評分總表 (簽名單)」列印並簽名
            </span>
          </div>
        </div>

        {/* 2b. 當本組進度達 100% 時，自動顯示醒目的「完評下一步導引橫幅」 */}
        {isGroupAllCompleted && (
          <div className="mx-4 mt-4 p-4 sm:p-5 bg-emerald-50 border-2 border-emerald-500 rounded-2xl shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 max-w-[1760px] lg:mx-auto w-[calc(100%-2rem)]">
            <div className="flex items-start space-x-3">
              <span className="material-icons text-emerald-600 text-4xl shrink-0 mt-0.5">task_alt</span>
              <div className="space-y-1">
                <h3 className="text-lg sm:text-xl font-black text-emerald-950">
                  🎉 恭喜！您已完成【{selectedGroup}】全數 {filteredTeams.length} 支隊伍的評分！
                </h3>
                <p className="text-sm sm:text-base text-emerald-900 font-bold leading-relaxed">
                  👉 下一步操作指引：(1) 點擊右側或頂部「<strong>本組評分總表 (簽名單)</strong>」核對分數與名次 ➔ (2) 點選「<strong>列印 / 另存為 PDF</strong>」或「<strong>開啟 Google 試算表</strong>」印出紙本 ➔ (3) 於表格最下方「<strong>請評審委員在分數下方簽名</strong>」處親筆簽名後交予工作人員，即完成評審作業！
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPrintSheetOpen(true)}
              className="px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-base font-black flex items-center shadow-md shrink-0 transition cursor-pointer"
            >
              <span className="material-icons text-xl mr-2">print</span>
              立即開啟本組評分總表進行列印簽名
            </button>
          </div>
        )}

        {/* 3. 主工作台：左右雙欄 Split-Screen */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden p-4 gap-5 max-w-[1760px] w-full mx-auto">
          
          {/* 左側欄：隊伍清單與即時序位 */}
          <div className={`${uiScale.sidebarWidth} bg-white rounded-xl border shadow-xs flex flex-col overflow-hidden shrink-0 transition-all duration-200`}>
            <div className="p-4 bg-amber-50/70 border-b flex justify-between items-center">
              <span className={`${uiScale.sidebarHeader} font-black text-amber-950`}>
                {selectedGroup} ({filteredTeams.length} 隊)
              </span>
              <span className="text-sm text-gray-600 font-bold">點選隊伍切換</span>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-200 max-h-[380px] lg:max-h-none">
              {filteredTeams.length === 0 ? (
                <div className="p-8 text-center text-base text-gray-500 font-bold">此組別目前尚無參賽隊伍</div>
              ) : (
                filteredTeams.map((team, idx) => {
                  const tid = team.team_id || team.Team_ID;
                  const sc = scoresMap[tid];
                  const isSelected = activeTeam && (activeTeam.team_id || activeTeam.Team_ID) === tid;
                  const rank = rankMap[tid];
                  const teamTotal = sc ? calculateTotal(sc) : null;
                  const schoolName = team.school || team.School || '';
                  const teamName = team.team_name || team.Team_Name || '';

                  return (
                    <div
                      key={tid}
                      onClick={() => handleSafeSwitchTeam(tid)}
                      className={`p-4 cursor-pointer transition flex justify-between items-start gap-3 ${
                        isSelected
                          ? 'bg-amber-100/80 border-l-8 border-amber-900'
                          : idx % 2 === 1
                          ? 'bg-stone-50/70 hover:bg-amber-50/40'
                          : 'bg-white hover:bg-amber-50/40'
                      }`}
                    >
                      <div className="space-y-1.5 min-w-0 flex-1">
                        {/* 第一行：隊伍序號 + 學校與隊伍名稱 */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`${uiScale.teamIdxBadge} font-mono font-black bg-amber-900 text-white rounded-md shrink-0`}>
                            第 {String(idx + 1).padStart(2, '0')} 隊
                          </span>
                          <span className={`${uiScale.teamSchool} text-gray-700 font-bold break-words`}>
                            {schoolName}{teamName ? `【${teamName}】` : ''}
                          </span>
                        </div>

                        {/* 第二行：作品標題 */}
                        <p className={`font-black ${uiScale.teamTitle} text-gray-950 line-clamp-2 pt-0.5`}>
                          {team.work_title || team.Work_Title}
                        </p>

                        {sc && sc.award && (
                          <span className="inline-block text-sm px-2.5 py-0.5 bg-amber-200 text-amber-950 rounded-md font-black">
                            ✨ 推薦：{sc.award}
                          </span>
                        )}
                      </div>

                      {/* 右側：分數、即時序位與狀態燈號 */}
                      <div className="text-right shrink-0 space-y-1.5 pl-1">
                        {teamTotal !== null ? (
                          <div>
                            <span className={`${uiScale.teamScore} font-black text-amber-900`}>{teamTotal}</span>
                            <span className="text-sm text-gray-600 font-bold ml-0.5">分</span>
                            {rank && (
                              <div className={`${uiScale.teamRank} font-black text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 mt-0.5`}>
                                序位第 {rank}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-base text-gray-400 font-mono font-bold">-- 分</div>
                        )}

                        <div>
                          {!sc ? (
                            <span className={`inline-block ${uiScale.teamStatus} font-bold rounded-full bg-gray-100 text-gray-600 border border-gray-300`}>
                              ⚪ 未評
                            </span>
                          ) : sc.status === 'saved' ? (
                            <span className={`inline-block ${uiScale.teamStatus} font-bold rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300`}>
                              🟢 完稿
                            </span>
                          ) : (
                            <span className={`inline-block ${uiScale.teamStatus} font-bold rounded-full bg-amber-100 text-amber-900 border border-amber-300`}>
                              🟡 暫存
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
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="px-3 py-1 bg-amber-100 text-amber-900 rounded-lg text-base font-bold">
                        {activeTeam.category || activeTeam.Category || activeTeam.group_name || activeTeam.Group_Name}
                      </span>
                      <span className="text-lg font-bold text-gray-800">
                        🏫 {activeTeam.school || activeTeam.School}
                        {(activeTeam.team_name || activeTeam.Team_Name) ? ` 【${activeTeam.team_name || activeTeam.Team_Name}】` : ''}
                      </span>
                    </div>
                    <h2 className={`${uiScale.cardTitle} font-black text-gray-900 mt-2`}>
                      {activeTeam.work_title || activeTeam.Work_Title}
                    </h2>
                  </div>

                  {/* 當前隊伍存檔狀態標示 */}
                  <div className="text-right shrink-0">
                    {currentScore.status === 'saved' ? (
                      <span className="px-3.5 py-2 bg-emerald-50 border border-emerald-300 rounded-xl text-sm sm:text-base text-emerald-900 font-bold flex items-center">
                        <span className="material-icons text-lg mr-1">cloud_done</span>
                        已儲存於雲端試算表
                      </span>
                    ) : (currentScore.status === 'draft' || currentScore.status === 'modified') ? (
                      <span className="px-3.5 py-2 bg-amber-50 border border-amber-300 rounded-xl text-sm sm:text-base text-amber-900 font-bold flex items-center">
                        <span className="material-icons text-lg mr-1">edit_note</span>
                        本機已暫存草稿 (請記得點下方儲存至雲端)
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* 作品說明 (手風琴展開/收合) */}
                {activeDesc ? (
                  <div className={`bg-gray-50 p-4 rounded-xl border ${uiScale.cardBody} space-y-1.5`}>
                    <div className={`text-gray-800 whitespace-pre-wrap ${descExpanded ? '' : 'line-clamp-3'}`}>
                      <strong className="text-gray-900 mr-1">📝 作品說明：</strong>
                      {activeDesc}
                    </div>
                    {activeDesc.length > 60 && (
                      <button
                        type="button"
                        onClick={() => setDescExpanded(!descExpanded)}
                        className="text-base text-amber-900 font-bold flex items-center pt-1 hover:underline cursor-pointer"
                      >
                        <span className="material-icons text-lg mr-0.5">
                          {descExpanded ? 'expand_less' : 'expand_more'}
                        </span>
                        {descExpanded ? '收合作品說明' : '展開完整作品說明'}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-base text-gray-400 italic">無提供作品說明文字</div>
                )}

                {/* 參賽檔案連結按鈕列 */}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <span className="text-base font-bold text-gray-800 mr-1">📂 作品檔案檢視：</span>
                  
                  {(activeTeam.MindMap_Link || activeTeam.mindmap_link) ? (
                    <a
                      href={activeTeam.MindMap_Link || activeTeam.mindmap_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2.5 bg-sky-50 text-sky-900 rounded-xl border border-sky-300 hover:bg-sky-100 text-base font-bold flex items-center transition shadow-2xs"
                    >
                      🧠 Mindomo 心智圖 ↗
                    </a>
                  ) : (
                    <span className="px-3 py-1.5 bg-gray-100 text-gray-400 rounded-lg text-sm">無心智圖</span>
                  )}

                  {(activeTeam.Slides_Link || activeTeam.slides_link) ? (
                    <a
                      href={activeTeam.Slides_Link || activeTeam.slides_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2.5 bg-amber-50 text-amber-900 rounded-xl border border-amber-300 hover:bg-amber-100 text-base font-bold flex items-center transition shadow-2xs"
                    >
                      📊 簡報檔案 ↗
                    </a>
                  ) : (
                    <span className="px-3 py-1.5 bg-gray-100 text-gray-400 rounded-lg text-sm">無簡報檔</span>
                  )}

                  {(activeTeam.Course_Plan_Link || activeTeam.course_plan_link) ? (
                    <a
                      href={activeTeam.Course_Plan_Link || activeTeam.course_plan_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2.5 bg-purple-50 text-purple-900 rounded-xl border border-purple-300 hover:bg-purple-100 text-base font-bold flex items-center transition shadow-2xs"
                    >
                      📑 校訂課程計畫 PDF ↗
                    </a>
                  ) : (
                    String(activeTeam.category || activeTeam.group_name || '').includes('校訂課程') && (
                      <span className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-bold">⚠️ 未附校訂課程計畫</span>
                    )
                  )}
                </div>

                {/* 影片播放區：雙重保險 */}
                <div className="pt-2 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-red-50/70 p-4 rounded-xl border border-red-200">
                    <div className="flex items-center space-x-2.5">
                      <span className="material-icons text-red-600 text-3xl">smart_display</span>
                      <div>
                        <span className="text-base font-bold text-gray-900 block">參賽作品發表影片 (5~8分鐘)</span>
                        <span className="text-sm text-gray-700">若下方內嵌畫面因雲端權限無法直接播放，請點擊右側紅色大按鈕於新視窗全螢幕觀看</span>
                      </div>
                    </div>
                    {rawVideoUrl ? (
                      <a
                        href={rawVideoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-5 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-base font-black flex items-center justify-center shadow-sm transition shrink-0"
                      >
                        🎬 點此另開大視窗全螢幕看影片 ↗
                      </a>
                    ) : (
                      <span className="px-4 py-2 bg-gray-200 text-gray-600 rounded-lg text-base font-bold">
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
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-black text-gray-900 text-xl sm:text-2xl flex items-center">
                        <span className="material-icons text-amber-900 mr-1.5 text-2xl">tune</span>
                        四項指標配分評量 (滿分 100 分)
                      </h3>
                      <button
                        type="button"
                        onClick={() => setRubricDrawerOpen(true)}
                        className="px-3.5 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-base font-bold flex items-center transition cursor-pointer"
                      >
                        <span className="material-icons text-lg mr-1">help_outline</span>
                        對照評分規準細項
                      </button>
                    </div>
                    <p className="text-base text-gray-600 mt-1">
                      各項滑桿拉到最右即為該項最高滿分（40分 + 30分 + 20分 + 10分 = 100分）
                    </p>
                  </div>

                  <div className="text-right bg-amber-50 px-6 py-3 rounded-xl border-2 border-amber-300 shrink-0">
                    <span className="text-sm font-bold text-amber-900 block">目前合計總分</span>
                    <div className="text-3xl sm:text-4xl font-black text-amber-900">
                      {calculateTotal(currentScore)} <span className="text-base font-bold">/ 100 分</span>
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
                            <div className={`${uiScale.sliderLabel} font-black text-gray-900`}>{item.label}</div>
                            <div className={`${uiScale.sliderDesc} text-gray-700`}>{item.desc}</div>
                          </div>
                          <div className="flex items-center space-x-1.5 shrink-0 bg-white p-1 rounded-lg border shadow-2xs">
                            <button
                              type="button"
                              onClick={() => updateScoreField(item.key, val - 1)}
                              className="w-9 h-9 rounded-md bg-gray-100 hover:bg-gray-200 text-lg font-black flex items-center justify-center cursor-pointer"
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
                              className={`${uiScale.sliderInput} text-center font-black text-amber-900 bg-white focus:outline-none`}
                            />
                            <button
                              type="button"
                              onClick={() => updateScoreField(item.key, val + 1)}
                              className="w-9 h-9 rounded-md bg-gray-100 hover:bg-gray-200 text-lg font-black flex items-center justify-center cursor-pointer"
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
                          className="w-full h-3 accent-amber-900 cursor-pointer"
                        />
                        <div className="flex justify-between text-sm text-gray-600 font-bold font-mono px-0.5">
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
                <h3 className="font-black text-gray-900 text-xl flex items-center">
                  <span className="material-icons text-amber-900 mr-1.5 text-2xl">rate_review</span>
                  質性評語與 115 特色表現獎推薦
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="md:col-span-1 space-y-2">
                    <label className="block text-base font-bold text-gray-800">
                      ✨ 特色表現獎推薦 (選填)
                    </label>
                    <select
                      value={currentScore.award || ''}
                      onChange={(e) => updateScoreField('award', e.target.value)}
                      className="w-full p-3.5 text-base sm:text-lg border rounded-xl bg-white font-bold text-gray-900 shadow-2xs"
                    >
                      <option value="">-- 無特別推薦 --</option>
                      <option value="簡報之星">✨ 簡報之星</option>
                      <option value="學習之星">✨ 學習之星</option>
                    </select>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      若該隊伍未獲特優/優等，但表現亮眼或達良好水平，可推薦角逐特色表現獎（供決審評審會議討論之提名建議，不列印於個人評分表）。
                    </p>
                  </div>

                  <div className="md:col-span-2 space-y-2">
                    <label className="block text-base font-bold text-gray-800">
                      💬 評審評語與寶貴建議 <span className="text-gray-600 font-normal">(將完整呈現於評分總表並匿名提供參賽學生參考)</span>
                    </label>
                    <textarea
                      rows="4"
                      value={currentScore.comment || ''}
                      onChange={(e) => updateScoreField('comment', e.target.value)}
                      placeholder="請輸入對參賽學生的鼓勵、作品亮點或具體改進建議..."
                      className={`w-full p-3.5 ${uiScale.commentText} border rounded-xl focus:ring-2 focus:ring-amber-900 focus:outline-none`}
                    />
                  </div>
                </div>

                {/* 底部提交操作列 */}
                <div className="pt-4 border-t flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="text-base space-y-1">
                    {currentScore.status === 'saved' ? (
                      <span className="text-emerald-800 font-bold flex items-center">
                        🟢 此隊伍分數已安全儲存於雲端試算表 (總分：{calculateTotal(currentScore)} 分)
                      </span>
                    ) : (
                      <span className="text-amber-900 font-bold flex items-center">
                        🟡 您已調整評分 (已自動暫存於本機)，請點擊右側按鈕正式寫入雲端試算表！
                      </span>
                    )}
                    <div className="text-sm text-gray-600 font-medium">
                      📌 評審完本組全部隊伍後，請點選網頁最上方「<strong>本組評分總表 (簽名單)</strong>」進行列印與簽名。
                    </div>
                  </div>

                  <button
                    onClick={() => handleSubmitScore(false)}
                    disabled={saving}
                    className="w-full sm:w-auto px-8 py-3.5 rounded-xl text-white font-black text-base sm:text-lg shadow-lg hover:opacity-95 transition flex items-center justify-center cursor-pointer shrink-0"
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
            <div className="flex-1 bg-white rounded-xl border flex items-center justify-center text-gray-500 text-lg font-bold">
              請從左側列表點選參賽隊伍開始評分
            </div>
          )}
        </div>
      </div>

      {/* =========================================================
          4. 115 評分規準側邊抽屜 Modal (標記 no-print)
         ========================================================= */}
      {rubricDrawerOpen && (
        <div className="no-print fixed inset-0 bg-black/60 z-50 flex justify-end">
          <div className="bg-white w-full max-w-4xl h-full flex flex-col shadow-2xl overflow-hidden animate-fade-in">
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

            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-base bg-gray-50">
              <div className="bg-white p-5 rounded-xl border shadow-2xs space-y-3">
                <h3 className="font-black text-gray-900 text-lg border-b pb-2">📌 評分量表級距說明 (5 卓越 ～ 0 未呈現)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-sm sm:text-base">
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

              <div className="bg-white p-5 rounded-xl border shadow-2xs space-y-3">
                <h3 className="font-black text-amber-900 text-lg border-b pb-2">一、簡報內容（最高 40 分）</h3>
                <ul className="space-y-2 text-base text-gray-800 list-disc list-inside">
                  <li><strong>輔助材料完整性 (10分)：</strong>照片、影片等輔助材料展示巧妙、完整深入，有效強化並支持主題論述。</li>
                  <li><strong>資料正確性與考證、結構邏輯 (10分)：</strong>論述邏輯嚴謹、結構化高，對問題展現深度探討。</li>
                  <li><strong>觀點獨特性與創新表現 (10分)：</strong>具備極具巧思的獨創性見解、方法或解決方案，不落俗套。</li>
                  <li><strong>主題切合度 (5分)：</strong>緊密切合所選主題組別，清晰展現學生主動發現問題的能力。</li>
                  <li><strong>心智圖解說運用 (5分)：</strong>Mindomo 心智圖架構極為清晰，解說精準展現思考脈絡（校訂課程組需說明與校訂課程之關連；在地/永續組需說明研究問題發想歷程）。</li>
                </ul>
              </div>

              <div className="bg-white p-5 rounded-xl border shadow-2xs space-y-3">
                <h3 className="font-black text-amber-900 text-lg border-b pb-2">二、表達能力（最高 30 分）</h3>
                <ul className="space-y-2 text-base text-gray-800 list-disc list-inside">
                  <li><strong>內容內化程度與情感渲染力 (10分)：</strong>內容完全內化（非死背或照稿宣讀），講述具情感感染力與吸引力，能引發共鳴。</li>
                  <li><strong>口語流暢度 (10分)：</strong>表達流暢、語速適中、節奏掌握佳，少有停頓或口誤，極具說服力。</li>
                  <li><strong>敘事技巧 (10分)：</strong>善用敘事技巧安排簡報順序，故事性或邏輯堆疊引人入勝，強化聽眾對主題理解。</li>
                </ul>
              </div>

              <div className="bg-white p-5 rounded-xl border shadow-2xs space-y-3">
                <h3 className="font-black text-amber-900 text-lg border-b pb-2">三、台風表現（最高 20 分）</h3>
                <ul className="space-y-2 text-base text-gray-800 list-disc list-inside">
                  <li><strong>自信、眼神交流、肢體語言與團隊默契 (15分)：</strong>展現高度自信與說服力，鏡頭眼神交流自然，肢體語言得體，團隊合作默契無間。</li>
                  <li><strong>時間掌控 (5分)：</strong>
                    <span className="text-emerald-800 font-bold">標準時間為 5:00 ～ 8:00</span>（完全符合且節奏完美得滿分；4:00~4:59 或 8:01~9:00 為輕微不符；低於 4:00 或超過 9:00 為嚴重不符）。
                  </li>
                </ul>
              </div>

              <div className="bg-white p-5 rounded-xl border shadow-2xs space-y-3">
                <h3 className="font-black text-amber-900 text-lg border-b pb-2">四、製作技巧（最高 10 分）</h3>
                <ul className="space-y-2 text-base text-gray-800 list-disc list-inside">
                  <li><strong>鏡頭、剪輯、排版、視覺呈現與授權規範 (10分)：</strong>影片剪輯流暢、鏡頭運用專業，排版精緻易讀；且<strong>完全符合著作權引述出處、創用 CC 授權標示與生成式 AI 輔助標示規範</strong>。</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          5. 本組評分總表 (簽名單) Modal (支援 A4 橫式跨頁列印 & 雲端 Google 試算表)
         ========================================================= */}
      {printSheetOpen && (
        <div
          className="print-sheet-modal-backdrop fixed inset-0 bg-black/80 flex justify-center items-start overflow-y-auto p-4 sm:p-6"
          style={{ zIndex: 9999 }}
        >
          <div className="print-sheet-modal-box bg-white w-full max-w-[1600px] rounded-2xl shadow-2xl border border-gray-300 overflow-hidden my-4 relative">
            
            {/* 頂部操作工具列 (列印時自動隱藏 .no-print) */}
            <div className="no-print bg-amber-950 text-white px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-lg sm:text-xl font-black flex items-center">
                  <span className="material-icons text-amber-400 mr-2">assignment_turned_in</span>
                  【{selectedGroup}】評審評分總表與簽名單
                </h2>
                <p className="text-xs sm:text-sm text-amber-200 mt-0.5">
                  💡 列印說明：點擊「列印 / 另存為 PDF」時，請確認方向為<strong>「橫向 (Landscape)」</strong>並勾選<strong>「背景圖形」</strong>；列印後請於最下方簽名處簽名。
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={handleOpenGoogleSheet}
                  disabled={exportingSheet}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-black flex items-center shadow-sm transition cursor-pointer"
                >
                  <span className={`material-icons text-base mr-1.5 ${exportingSheet ? 'animate-spin' : ''}`}>
                    {exportingSheet ? 'sync' : 'table_chart'}
                  </span>
                  {exportingSheet ? '正在建立 Google 試算表...' : '產生並開啟 Google 試算表 ↗'}
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-amber-950 rounded-xl text-sm font-black flex items-center shadow-sm transition cursor-pointer"
                >
                  <span className="material-icons text-base mr-1.5">print</span>
                  列印 / 另存為 PDF (A4 橫式)
                </button>

                <button
                  type="button"
                  onClick={() => setPrintSheetOpen(false)}
                  className="px-4 py-2.5 bg-red-700 hover:bg-red-800 text-white rounded-xl text-sm font-bold flex items-center transition cursor-pointer"
                >
                  <span className="material-icons text-base mr-1">close</span>
                  返回評分工作台
                </button>
              </div>
            </div>

            {/* 評分表主體 (螢幕預覽與 A4 橫式列印共用結構) */}
            <div className="p-4 sm:p-6 overflow-x-auto bg-white">
              <table className="judge-print-table w-full border-collapse border-2 border-black text-black text-sm">
                {/* 跨頁自動重複之表頭 (thead) */}
                <thead>
                  {/* 表頭第一列：組別大標題與評審資訊 */}
                  <tr style={{ backgroundColor: '#FFFFFF' }}>
                    <th
                      colSpan={isCourseGroup ? 12 : 11}
                      className="p-3 border border-black text-left"
                    >
                      <div className="flex flex-col sm:flex-row justify-between items-baseline gap-2">
                        <span className="text-lg sm:text-xl font-black tracking-wide text-black">
                          【{selectedGroup}】評分表
                        </span>
                        <span className="text-sm font-bold text-black">
                          115學年度 宜蘭縣瘋學習簡報達人擂台賽　｜　評審委員：{judgeName}（代號 {judgeCode}）　｜　已評 {savedCount} / 共 {filteredTeams.length} 隊
                        </span>
                      </div>
                    </th>
                  </tr>

                  {/* 表頭第二列：各欄位名稱 (精簡版面：已移除作品說明欄位，大幅精簡頁數) */}
                  <tr className="text-center font-black text-black">
                    <th className="p-2.5 border border-black w-[24%]" style={{ backgroundColor: '#F3E5AB' }}>
                      隊伍與作品標題
                    </th>
                    {isCourseGroup && (
                      <th className="p-2 border border-black w-[5%]" style={{ backgroundColor: '#F3E5AB' }}>
                        校訂<br />課程
                      </th>
                    )}
                    <th className="p-2 border border-black w-[5%]" style={{ backgroundColor: '#F3E5AB' }}>
                      簡報檔
                    </th>
                    <th className="p-2 border border-black w-[6.5%]" style={{ backgroundColor: '#F3E5AB' }}>
                      Mindomo<br />心智圖
                    </th>
                    <th className="p-2 border border-black w-[5%]" style={{ backgroundColor: '#F3E5AB' }}>
                      影片檔
                    </th>
                    <th className="p-2 border border-black w-[5.5%]" style={{ backgroundColor: '#DCE6F1' }}>
                      內容<br />40%
                    </th>
                    <th className="p-2 border border-black w-[5.5%]" style={{ backgroundColor: '#DCE6F1' }}>
                      表達能力<br />30%
                    </th>
                    <th className="p-2 border border-black w-[5.5%]" style={{ backgroundColor: '#DCE6F1' }}>
                      臺風表現<br />20%
                    </th>
                    <th className="p-2 border border-black w-[5.5%]" style={{ backgroundColor: '#DCE6F1' }}>
                      製作技巧<br />10%
                    </th>
                    <th className="p-2 border border-black w-[5.5%]" style={{ backgroundColor: '#E4DFEC' }}>
                      分數<br />加總
                    </th>
                    <th className="p-2 border border-black w-[5%]" style={{ backgroundColor: '#D8E4BC' }}>
                      序位
                    </th>
                    <th className="p-2.5 border border-black" style={{ backgroundColor: '#F2F2F2' }}>
                      評語
                    </th>
                  </tr>
                </thead>

                {/* 表格內容列 (依參賽隊伍順序排列 + 斑馬紋交替色) */}
                <tbody>
                  {filteredTeams.map((team, idx) => {
                    const tid = team.team_id || team.Team_ID;
                    const sc = scoresMap[tid];
                    const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#FDF8EC';
                    const schoolStr = team.school || team.School || '';
                    const teamNameStr = team.team_name || team.Team_Name || '';
                    const workTitle = team.work_title || team.Work_Title || '';
                    const descStr = String(team.description || team.Description || '').trim();
                    const courseLink = team.Course_Plan_Link || team.course_plan_link || '';
                    const slidesLink = team.Slides_Link || team.slides_link || '';
                    const mindmapLink = team.MindMap_Link || team.mindmap_link || '';
                    const videoLink = team.Video_Link || team.video_link || '';
                    const totalVal = sc ? calculateTotal(sc) : 0;
                    const rankVal = sc ? (rankMap[tid] || '-') : '-';

                    return (
                      <tr key={tid} style={{ backgroundColor: rowBg }}>
                        {/* 1. 隊伍序號 + 學校隊伍名稱 (上) + 作品標題 (下) */}
                        <td className="p-2.5 border border-black align-middle">
                          <div className="text-xs font-bold text-gray-800 mb-1">
                            第 {String(idx + 1).padStart(2, '0')} 隊｜{schoolStr}{teamNameStr ? `【${teamNameStr}】` : ''}
                          </div>
                          <div className="text-sm sm:text-base font-black text-black leading-snug">
                            {workTitle}
                          </div>
                        </td>

                        {/* 2. 校訂課程 (僅校訂課程組顯示) */}
                        {isCourseGroup && (
                          <td className="p-1.5 border border-black text-center align-middle text-xs font-bold">
                            {courseLink ? (
                              <a href={courseLink} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
                                校訂課程
                              </a>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                        )}

                        {/* 4. 簡報檔 */}
                        <td className="p-1.5 border border-black text-center align-middle text-xs font-bold">
                          {slidesLink ? (
                            <a href={slidesLink} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
                              簡報檔
                            </a>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>

                        {/* 5. Mindomo心智圖 */}
                        <td className="p-1.5 border border-black text-center align-middle text-xs font-bold">
                          {mindmapLink ? (
                            <a href={mindmapLink} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
                              Mindomo心智圖
                            </a>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>

                        {/* 6. 影片檔 */}
                        <td className="p-1.5 border border-black text-center align-middle text-xs font-bold">
                          {videoLink ? (
                            <a href={videoLink} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
                              影片檔
                            </a>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>

                        {/* 7~10. 四項配分 */}
                        <td className="p-2 border border-black text-center align-middle font-bold text-sm">
                          {sc ? sc.score_content : ''}
                        </td>
                        <td className="p-2 border border-black text-center align-middle font-bold text-sm">
                          {sc ? sc.score_expression : ''}
                        </td>
                        <td className="p-2 border border-black text-center align-middle font-bold text-sm">
                          {sc ? sc.score_stage : ''}
                        </td>
                        <td className="p-2 border border-black text-center align-middle font-bold text-sm">
                          {sc ? sc.score_technique : ''}
                        </td>

                        {/* 11. 分數加總 */}
                        <td className="p-2 border border-black text-center align-middle font-black text-base">
                          {sc ? totalVal : 0}
                        </td>

                        {/* 12. 序位 */}
                        <td className="p-2 border border-black text-center align-middle font-black text-base">
                          {rankVal}
                        </td>

                        {/* 13. 評語 (純淨評語，不印特色獎推薦) */}
                        <td className="p-2.5 border border-black align-top text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words">
                          {sc && sc.comment ? sc.comment : ''}
                        </td>
                      </tr>
                    );
                  })}

                  {/* 防竄改「以下空白」列 */}
                  <tr style={{ backgroundColor: '#FFFFFF' }}>
                    <td className="p-2.5 border border-black text-center font-black text-sm tracking-widest">
                      以下空白
                    </td>
                    {isCourseGroup && <td className="p-2 border border-black text-center text-gray-400">—</td>}
                    <td className="p-2 border border-black text-center text-gray-400">—</td>
                    <td className="p-2 border border-black text-center text-gray-400">—</td>
                    <td className="p-2 border border-black text-center text-gray-400">—</td>
                    <td className="p-2 border border-black text-center text-gray-400"></td>
                    <td className="p-2 border border-black text-center text-gray-400"></td>
                    <td className="p-2 border border-black text-center text-gray-400"></td>
                    <td className="p-2 border border-black text-center text-gray-400"></td>
                    <td className="p-2 border border-black text-center font-bold text-gray-500">0</td>
                    <td className="p-2 border border-black text-center font-bold text-gray-500">—</td>
                    <td className="p-2 border border-black text-center text-gray-400">—</td>
                  </tr>

                  {/* 最下方：請評審委員簽名 (左側標籤，右側左上簽章/右下日期) */}
                  <tr className="judge-signature-block">
                    <td
                      colSpan={isCourseGroup ? 5 : 4}
                      className="p-5 border border-black text-center align-middle font-black text-base sm:text-lg"
                      style={{ backgroundColor: '#F9EBC8' }}
                    >
                      請評審委員簽名
                    </td>
                    <td
                      colSpan={7}
                      className="p-3 border border-black align-top"
                      style={{ backgroundColor: '#FDF8EC', height: '90px' }}
                    >
                      <div className="h-full flex flex-col justify-between" style={{ minHeight: '70px' }}>
                        <div className="text-xs font-bold text-gray-800 text-left">
                          評審委員簽章：
                        </div>
                        <div className="text-xs font-bold text-gray-800 text-right">
                          日期：中華民國 115 年 　　 月 　　 日
                        </div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* 列印頁尾：左側競賽標註、右側頁碼 (第 1 頁，共 X 頁) */}
              <div className="mt-3 flex justify-between items-center text-xs text-black font-bold px-1 print-page-number">
                <span>115學年度 宜蘭縣瘋學習簡報達人擂台賽 — 【{selectedGroup}】評分總表</span>
                <span>第 1 頁，共 {Math.max(1, Math.ceil((filteredTeams.length + 2) / 8))} 頁</span>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
