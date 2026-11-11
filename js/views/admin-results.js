/**
 * 簡報達人評分系統 115學年度 - 共識會議決審與成績總表模組 (js/views/admin-results.js)
 * 核心功能：
 * 1. [ ᴀ 小 ] [ A 中 ] [ 𝐀 大 ] 三段式投影友善字級切換（預設「大」22px~28px+）
 * 2. 右上角「📋 對照評分規準」抽屜（內建 115 四大配分規準表 + 外部規準/簡章連結）
 * 3. 六大組別一鍵切換（頁籤 + 下拉選單）與三位評審完評狀態檢查
 * 4. 三分之一名額自動試算儀表板（ceil(N/3)）與「🪄 帶入系統建議」四層金字塔邏輯
 * 5. 比照去年標準《評分總表》視覺排版：標題（附簡報/影片/心智圖/校訂課程秒開按鈕）、三位評審（總分+序位+四項細分）、平均總分、序位法總分、排名（得獎亮黃底 #FFF200）、三位評審完整評語（免懸停直接顯示+評審推薦標籤）、特色表現獎下拉選單、特色優選獎下拉選單、底部「以下空白」防竄改列
 * 6. 儲存決審結果至後端 Final_Results、產生雲端獨立 Google 試算表總表、下載 Excel (.xlsx)、A4 橫向列印（無簽核欄，供公文附件簽核）
 */

window.AdminResultsView = function() {
  const { useState, useEffect, useMemo } = React;

  const CATEGORIES = window.APP_CONFIG?.ALL_CATEGORIES || [
    '宜蘭在地國中組', '宜蘭在地國小組',
    '環境永續國中組', '環境永續國小組',
    '校訂課程國中組', '校訂課程國小組'
  ];

  // 組別正式全銜對照表（比照去年列印總表頂部大標題）
  const CATEGORY_FULL_TITLE_MAP = {
    '宜蘭在地國中組': '【宜蘭在地自然人文特色—國中組】',
    '宜蘭在地國小組': '【宜蘭在地自然人文特色—國小組】',
    '環境永續國中組': '【環境永續×SDGs及生活裡的永續—國中組】',
    '環境永續國小組': '【環境永續×SDGs及生活裡的永續—國小組】',
    '校訂課程國中組': '【學校校訂課程—國中組】',
    '校訂課程國小組': '【學校校訂課程—國小組】'
  };

  // 預設組別與評審代號對照保底
  const DEFAULT_CATEGORY_JUDGES = {
    '宜蘭在地國中組': ['A', 'B', 'C'],
    '宜蘭在地國小組': ['A', 'B', 'C'],
    '環境永續國中組': ['D', 'E', 'F'],
    '環境永續國小組': ['D', 'E', 'F'],
    '校訂課程國中組': ['G', 'H', 'I'],
    '校訂課程國小組': ['G', 'H', 'I']
  };

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exportingSheet, setExportingSheet] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[1] || '宜蘭在地國小組');
  const [sortMode, setSortMode] = useState('avg_desc'); // 'avg_desc' | 'rank_sum_asc' | 'team_seq'
  const [showSubScores, setShowSubScores] = useState(true);
  const [showRubricDrawer, setShowRubricDrawer] = useState(false);

  // 字體大小切換：'small' (小) | 'medium' (中) | 'large' (大，預設適合投影幕 22px+)
  const [fontScale, setFontScale] = useState(() => {
    return localStorage.getItem('admin_consensus_font_scale') || 'large';
  });

  const handleFontScaleChange = (scale) => {
    setFontScale(scale);
    localStorage.setItem('admin_consensus_font_scale', scale);
  };

  // 從後端載入之原始資料
  const [teams, setTeams] = useState([]);
  const [judges, setJudges] = useState([]);
  const [scores, setScores] = useState([]);
  const [sysConfig, setSysConfig] = useState({});

  // 決審獎項狀態 map: { [team_id]: { feature_award: '簡報之星'|'學習之星'|'', rank_award: '特優'|'優等'|'', saved: boolean } }
  const [decisionsMap, setDecisionsMap] = useState({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState('');

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    const res = await window.ApiService.getAdminResults(window.APP_CONFIG.CURRENT_YEAR);
    if (res.status === 'success' && res.data) {
      const loadedTeams = Array.isArray(res.data.teams) ? res.data.teams : [];
      const loadedJudges = Array.isArray(res.data.judges) ? res.data.judges : [];
      const loadedScores = Array.isArray(res.data.scores) ? res.data.scores : [];
      const loadedFinals = Array.isArray(res.data.final_results) ? res.data.final_results : [];
      setTeams(loadedTeams);
      setJudges(loadedJudges);
      setScores(loadedScores);
      setSysConfig(res.data.config || {});

      // 將已儲存於 Final_Results 的獎項回填至 decisionsMap
      const initMap = {};
      loadedFinals.forEach(fr => {
        const tid = String(fr.team_id || '');
        if (tid) {
          initMap[tid] = {
            feature_award: String(fr.feature_award || ''),
            rank_award: String(fr.rank_award || ''),
            saved: true
          };
        }
      });
      setDecisionsMap(initMap);
      setHasUnsavedChanges(false);
    } else {
      alert('讀取成績彙整資料失敗：' + (res.message || '未知錯誤'));
    }
    setLoading(false);
  };

  // 字級樣式對應表（專為投影幕與會議審閱設計，大字級達 22px ~ 28px+）
  const fontStyles = useMemo(() => {
    if (fontScale === 'small') {
      return {
        tableHeader: 'text-sm',
        workTitle: 'text-base font-extrabold leading-snug',
        schoolText: 'text-xs',
        scoreMain: 'text-lg font-black',
        rankBadge: 'text-xs',
        subScore: 'text-[11px]',
        avgScore: 'text-xl font-black',
        rankNum: 'text-xl font-black',
        commentText: 'text-sm leading-relaxed',
        selectText: 'text-sm py-1.5 px-2',
        fileBtn: 'text-xs px-2 py-0.5'
      };
    }
    if (fontScale === 'medium') {
      return {
        tableHeader: 'text-base',
        workTitle: 'text-xl font-extrabold leading-snug',
        schoolText: 'text-sm',
        scoreMain: 'text-xl font-black',
        rankBadge: 'text-sm',
        subScore: 'text-xs',
        avgScore: 'text-2xl font-black',
        rankNum: 'text-2xl font-black',
        commentText: 'text-base leading-relaxed',
        selectText: 'text-base py-2 px-2.5',
        fileBtn: 'text-xs px-2.5 py-1'
      };
    }
    // 'large' (預設：22px ~ 28px+ 投影大字體)
    return {
      tableHeader: 'text-lg',
      workTitle: 'text-[22px] font-black leading-snug',
      schoolText: 'text-base font-bold',
      scoreMain: 'text-[24px] font-black',
      rankBadge: 'text-base font-bold',
      subScore: 'text-sm font-semibold',
      avgScore: 'text-[28px] font-black',
      rankNum: 'text-[28px] font-black',
      commentText: 'text-[18px] leading-relaxed font-medium',
      selectText: 'text-[18px] py-2.5 px-3',
      fileBtn: 'text-sm px-2.5 py-1 font-bold'
    };
  }, [fontScale]);

  // 1. 取得目前選中組別的 3 位負責評審 (例如 A, B, C)
  const groupJudges = useMemo(() => {
    const matched = judges.filter(j => {
      const code = String(j.judge_code || j.Judge_Code || '').trim();
      const catShort = String(j.category_short || j.Category_Short || '');
      if (!code) return false;
      if (catShort.includes(selectedCategory)) return true;
      if (selectedCategory.includes('宜蘭在地') && catShort.includes('宜蘭在地')) return true;
      if (selectedCategory.includes('環境永續') && catShort.includes('環境永續')) return true;
      if (selectedCategory.includes('校訂課程') && catShort.includes('校訂課程')) return true;
      return false;
    }).sort((a, b) => String(a.judge_code || a.Judge_Code).localeCompare(String(b.judge_code || b.Judge_Code)));

    if (matched.length >= 3) {
      return matched.slice(0, 3).map(j => ({
        code: String(j.judge_code || j.Judge_Code),
        name: String(j.judge_name || j.Judge_Name || `評審${j.judge_code || j.Judge_Code}`)
      }));
    }

    const fallbackCodes = DEFAULT_CATEGORY_JUDGES[selectedCategory] || ['A', 'B', 'C'];
    return fallbackCodes.map(c => {
      const found = judges.find(j => String(j.judge_code || j.Judge_Code) === c);
      return {
        code: c,
        name: found ? String(found.judge_name || found.Judge_Name) : `評審${c}`
      };
    });
  }, [judges, selectedCategory]);

  // 2. 篩選該組別之參賽隊伍並計算每位評審組內序位、平均總分、序位法總分與兩種排名
  const processedGroupData = useMemo(() => {
    const groupTeams = teams.filter(t => {
      const cat = String(t.category || t.Category || t.group_name || t.Group_Name || '').trim();
      return cat === selectedCategory;
    });

    // 先針對 3 位評審各自計算該評審在此組別內的給分序位 (1, 2, 3... 同分並列)
    const judgeRankMap = {}; // { [judgeCode]: { [teamId]: rank } }
    groupJudges.forEach(j => {
      judgeRankMap[j.code] = {};
      const scoredList = [];
      groupTeams.forEach(t => {
        const tid = String(t.team_id || t.Team_ID);
        const rec = scores.find(s => String(s.team_id) === tid && String(s.judge_code) === j.code);
        if (rec && rec.total_score !== undefined && rec.total_score !== '') {
          scoredList.push({ tid, score: Number(rec.total_score) });
        }
      });
      scoredList.sort((a, b) => b.score - a.score);
      let currentRank = 1;
      scoredList.forEach((item, idx) => {
        if (idx > 0 && item.score < scoredList[idx - 1].score) {
          currentRank = idx + 1;
        }
        judgeRankMap[j.code][item.tid] = currentRank;
      });
    });

    // 組合每支隊伍的完整對照資料
    const enriched = groupTeams.map((t, idx) => {
      const tid = String(t.team_id || t.Team_ID);
      const judgeDetails = groupJudges.map(j => {
        const rec = scores.find(s => String(s.team_id) === tid && String(s.judge_code) === j.code);
        const rank = judgeRankMap[j.code]?.[tid] ?? null;
        return {
          judge_code: j.code,
          judge_name: j.name,
          has_scored: !!rec,
          total_score: rec ? Number(rec.total_score) : null,
          score_content: rec ? Number(rec.score_content) : null,
          score_expression: rec ? Number(rec.score_expression) : null,
          score_stage: rec ? Number(rec.score_stage) : null,
          score_technique: rec ? Number(rec.score_technique) : null,
          rank: rank,
          award_rec: rec ? String(rec.award_recommendation || rec.award || '') : '',
          comment: rec ? String(rec.comment || '') : ''
        };
      });

      const validScores = judgeDetails.filter(d => d.has_scored && d.total_score !== null);
      const avgScore = validScores.length > 0
        ? Number((validScores.reduce((acc, cur) => acc + cur.total_score, 0) / validScores.length).toFixed(1))
        : null;

      const validRanks = judgeDetails.filter(d => d.rank !== null);
      const rankSum = validRanks.length > 0
        ? validRanks.reduce((acc, cur) => acc + cur.rank, 0)
        : null;

      // 統計幾位評審推薦「簡報之星」或「學習之星」
      const starPresentationCount = judgeDetails.filter(d => d.award_rec.includes('簡報之星')).length;
      const starLearningCount = judgeDetails.filter(d => d.award_rec.includes('學習之星')).length;
      const recSummaryParts = judgeDetails
        .filter(d => d.award_rec)
        .map(d => `${d.judge_code}:${d.award_rec}`);

      return {
        raw: t,
        seq_index: idx + 1,
        team_id: tid,
        category: selectedCategory,
        school: String(t.school || t.School || ''),
        team_name: String(t.team_name || t.Team_Name || t.memo || t.Memo || ''),
        work_title: String(t.work_title || t.Work_Title || ''),
        description: String(t.description || t.Description || ''),
        mindmap_link: String(t.mindmap_link || t.MindMap_Link || ''),
        slides_link: String(t.slides_link || t.Slides_Link || ''),
        video_link: String(t.video_link || t.Video_Link || ''),
        course_link: String(t.course_plan_link || t.Course_Plan_Link || ''),
        consent_link: String(t.consent_link || t.Consent_Link || ''),
        judgeDetails,
        scored_count: validScores.length,
        avg_score: avgScore,
        rank_sum: rankSum,
        star_presentation_count: starPresentationCount,
        star_learning_count: starLearningCount,
        rec_judge_summary: recSummaryParts.join(' / ')
      };
    });

    // 計算「平均總分排名 (avg_rank)」
    const byAvg = [...enriched].filter(item => item.avg_score !== null).sort((a, b) => {
      if (b.avg_score !== a.avg_score) return b.avg_score - a.avg_score;
      return (a.rank_sum ?? 999) - (b.rank_sum ?? 999);
    });
    const avgRankLookup = {};
    let curAvgRank = 1;
    byAvg.forEach((item, i) => {
      if (i > 0 && item.avg_score < byAvg[i - 1].avg_score) {
        curAvgRank = i + 1;
      }
      avgRankLookup[item.team_id] = curAvgRank;
    });

    // 計算「序位法總分排名 (sum_rank)」
    const byRankSum = [...enriched].filter(item => item.rank_sum !== null).sort((a, b) => {
      if (a.rank_sum !== b.rank_sum) return a.rank_sum - b.rank_sum;
      return (b.avg_score ?? 0) - (a.avg_score ?? 0);
    });
    const sumRankLookup = {};
    let curSumRank = 1;
    byRankSum.forEach((item, i) => {
      if (i > 0 && item.rank_sum > byRankSum[i - 1].rank_sum) {
        curSumRank = i + 1;
      }
      sumRankLookup[item.team_id] = curSumRank;
    });

    const withRanks = enriched.map(item => {
      const avgRank = avgRankLookup[item.team_id] ?? null;
      const sumRank = sumRankLookup[item.team_id] ?? null;
      const activeRank = sortMode === 'rank_sum_asc' ? (sumRank ?? avgRank) : (avgRank ?? sumRank);
      return {
        ...item,
        avg_rank: avgRank,
        sum_rank: sumRank,
        final_rank: activeRank,
        has_rank_discrepancy: avgRank !== null && sumRank !== null && avgRank !== sumRank
      };
    });

    // 依選擇的排序模式排序
    if (sortMode === 'avg_desc') {
      withRanks.sort((a, b) => {
        if (a.avg_score === null && b.avg_score === null) return a.seq_index - b.seq_index;
        if (a.avg_score === null) return 1;
        if (b.avg_score === null) return -1;
        if (b.avg_score !== a.avg_score) return b.avg_score - a.avg_score;
        return (a.rank_sum ?? 999) - (b.rank_sum ?? 999);
      });
    } else if (sortMode === 'rank_sum_asc') {
      withRanks.sort((a, b) => {
        if (a.rank_sum === null && b.rank_sum === null) return a.seq_index - b.seq_index;
        if (a.rank_sum === null) return 1;
        if (b.rank_sum === null) return -1;
        if (a.rank_sum !== b.rank_sum) return a.rank_sum - b.rank_sum;
        return (b.avg_score ?? 0) - (a.avg_score ?? 0);
      });
    } else {
      withRanks.sort((a, b) => a.seq_index - b.seq_index);
    }

    return withRanks;
  }, [teams, scores, groupJudges, selectedCategory, sortMode]);

  // 3. 計算本組 1/3 錄取名額上限與目前已選獎項統計
  const quotaStats = useMemo(() => {
    const totalTeams = processedGroupData.length;
    // 三分之一名額（例如 9隊->3名、10隊->4名、6隊->2名）
    const quotaLimit = totalTeams > 0 ? Math.ceil(totalTeams / 3) : 0;

    let topCount = 0;       // 特優
    let excellentCount = 0; // 優等
    let presStarCount = 0;  // 簡報之星
    let learnStarCount = 0; // 學習之星
    let savedCount = 0;

    processedGroupData.forEach(item => {
      const dec = decisionsMap[item.team_id] || { feature_award: '', rank_award: '' };
      if (dec.rank_award === '特優') topCount++;
      if (dec.rank_award === '優等') excellentCount++;
      if (dec.feature_award === '簡報之星') presStarCount++;
      if (dec.feature_award === '學習之星') learnStarCount++;
      if (dec.saved) savedCount++;
    });

    const totalTopWinners = topCount + excellentCount;
    const isOverQuota = totalTopWinners > quotaLimit;

    // 檢查 3 位評審在此組別的完評進度
    const judgeProgress = groupJudges.map(j => {
      let count = 0;
      processedGroupData.forEach(item => {
        const d = item.judgeDetails.find(jd => jd.judge_code === j.code);
        if (d && d.has_scored) count++;
      });
      return {
        ...j,
        scored: count,
        total: totalTeams,
        isComplete: totalTeams > 0 && count === totalTeams
      };
    });

    return {
      totalTeams,
      quotaLimit,
      topCount,
      excellentCount,
      totalTopWinners,
      presStarCount,
      learnStarCount,
      isOverQuota,
      savedCount,
      allJudgesComplete: judgeProgress.every(jp => jp.isComplete),
      judgeProgress
    };
  }, [processedGroupData, decisionsMap, groupJudges]);

  // 4. 單一隊伍下拉選單變更處理
  const handleDecisionChange = (teamId, field, value) => {
    setDecisionsMap(prev => {
      const current = prev[teamId] || { feature_award: '', rank_award: '', saved: false };
      const updated = { ...current, [field]: value, saved: false };

      // 依四層金字塔原則：若特色優選獎選了「特優」或「優等」，其特色表現獎自動晉級為「簡報之星」
      if (field === 'rank_award' && (value === '特優' || value === '優等')) {
        updated.feature_award = '簡報之星';
      }
      // 若特色表現獎改為「學習之星」或「無」，則無法同時領取特優/優等
      if (field === 'feature_award' && value !== '簡報之星' && (updated.rank_award === '特優' || updated.rank_award === '優等')) {
        updated.rank_award = '';
      }

      return { ...prev, [teamId]: updated };
    });
    setHasUnsavedChanges(true);
  };

  // 5. 「🪄 一鍵帶入系統試算建議」：依四層金字塔與 1/3 名額、85/90 分原則自動試算
  const handleApplySystemRecommendations = () => {
    if (processedGroupData.length === 0) return;

    const quota = quotaStats.quotaLimit;
    // 依平均總分高低排序來分配前 1/3 名額
    const sortedByScore = [...processedGroupData].sort((a, b) => {
      if (a.avg_score === null && b.avg_score === null) return a.seq_index - b.seq_index;
      if (a.avg_score === null) return 1;
      if (b.avg_score === null) return -1;
      if (b.avg_score !== a.avg_score) return b.avg_score - a.avg_score;
      return (a.rank_sum ?? 999) - (b.rank_sum ?? 999);
    });

    const newMap = { ...decisionsMap };
    sortedByScore.forEach((item, index) => {
      const avg = item.avg_score ?? 0;
      const hasAnyScore = item.scored_count > 0;
      let featureAward = '';
      let rankAward = '';

      if (hasAnyScore) {
        // 第一階保底：有交件參賽即為「學習之星」
        featureAward = '學習之星';

        // 第二階佳作角色：若有評審推薦「簡報之星」或平均達 82 分以上，或位於前 1/3 名額內，升為「簡報之星」
        if (item.star_presentation_count >= 1 || avg >= 82 || index < quota) {
          featureAward = '簡報之星';
        }

        // 第三、四階晉級（從簡報之星中擇優錄取前 1/3 名額）：原則 90 分以上特優、85 分以上優等
        if (index < quota) {
          if (avg >= 90) {
            rankAward = '特優';
            featureAward = '簡報之星';
          } else if (avg >= 85 || index < quota) {
            rankAward = '優等';
            featureAward = '簡報之星';
          }
        }
      }

      newMap[item.team_id] = {
        feature_award: featureAward,
        rank_award: rankAward,
        saved: false
      };
    });

    setDecisionsMap(newMap);
    setHasUnsavedChanges(true);
  };

  // 6. 儲存本組決審結果至雲端 Final_Results
  const handleSaveGroupResults = async () => {
    if (processedGroupData.length === 0) return;

    if (quotaStats.isOverQuota) {
      const confirmOver = window.confirm(
        `⚠️ 名額提醒：本組共有 ${quotaStats.totalTeams} 隊，三分之一建議名額上限為 ${quotaStats.quotaLimit} 隊。\n` +
        `目前您勾選了「特優 ${quotaStats.topCount} 隊 + 優等 ${quotaStats.excellentCount} 隊 = 共 ${quotaStats.totalTopWinners} 隊」。\n\n確定要破例儲存嗎？`
      );
      if (!confirmOver) return;
    }

    setSaving(true);
    const payloadResults = processedGroupData.map((item, idx) => {
      const dec = decisionsMap[item.team_id] || { feature_award: '', rank_award: '' };
      return {
        team_id: item.team_id,
        category: selectedCategory,
        group_name: selectedCategory,
        average_score: item.avg_score !== null ? item.avg_score : '',
        rank: item.final_rank !== null ? item.final_rank : (idx + 1),
        rank_award: dec.rank_award || '',
        feature_award: dec.feature_award || '',
        rec_judge_summary: item.rec_judge_summary || ''
      };
    });

    const res = await window.ApiService.saveFinalResults(
      payloadResults,
      selectedCategory,
      window.APP_CONFIG.CURRENT_YEAR
    );
    setSaving(false);

    if (res.status === 'success') {
      setDecisionsMap(prev => {
        const next = { ...prev };
        processedGroupData.forEach(item => {
          if (next[item.team_id]) {
            next[item.team_id] = { ...next[item.team_id], saved: true };
          } else {
            next[item.team_id] = { feature_award: '', rank_award: '', saved: true };
          }
        });
        return next;
      });
      setHasUnsavedChanges(false);
      const nowStr = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastSavedTime(nowStr);
      alert(`✅ 【${selectedCategory}】共 ${payloadResults.length} 支隊伍的決審得獎名單已成功寫入雲端資料庫 (Final_Results)！`);
    } else {
      alert('❌ 儲存失敗：' + (res.message || '請稍後再試'));
    }
  };

  // 7. 產生並開啟雲端格式化 Google 試算表「評分總表」
  const handleExportCloudSummarySheet = async () => {
    if (processedGroupData.length === 0) return;
    setExportingSheet(true);

    const rowsPayload = processedGroupData.map((item, idx) => {
      const dec = decisionsMap[item.team_id] || { feature_award: '', rank_award: '' };
      const j1 = item.judgeDetails[0] || {};
      const j2 = item.judgeDetails[1] || {};
      const j3 = item.judgeDetails[2] || {};

      const fmtComment = (jd) => {
        if (!jd || !jd.comment) return jd?.award_rec ? `（推薦：${jd.award_rec}）` : '';
        return jd.award_rec ? `${jd.comment}\n（${jd.award_rec}）` : jd.comment;
      };

      return {
        work_title: item.work_title,
        school: item.school,
        team_name: item.team_name,
        j1_score: j1.total_score !== null && j1.total_score !== undefined ? j1.total_score : '',
        j1_rank: j1.rank || '',
        j2_score: j2.total_score !== null && j2.total_score !== undefined ? j2.total_score : '',
        j2_rank: j2.rank || '',
        j3_score: j3.total_score !== null && j3.total_score !== undefined ? j3.total_score : '',
        j3_rank: j3.rank || '',
        avg_score: item.avg_score !== null ? item.avg_score : '',
        rank_sum: item.rank_sum !== null ? item.rank_sum : '',
        final_rank: item.final_rank !== null ? item.final_rank : (idx + 1),
        j1_comment: fmtComment(j1),
        j2_comment: fmtComment(j2),
        j3_comment: fmtComment(j3),
        feature_award: dec.feature_award || '',
        rank_award: dec.rank_award || ''
      };
    });

    const res = await window.ApiService.exportGroupSummarySheet({
      year: window.APP_CONFIG.CURRENT_YEAR,
      category: selectedCategory,
      category_title: CATEGORY_FULL_TITLE_MAP[selectedCategory] || `【${selectedCategory}】`,
      judge_headers: groupJudges,
      rows: rowsPayload
    });

    setExportingSheet(false);

    if (res.status === 'success' && res.data?.sheet_url) {
      window.open(res.data.sheet_url, '_blank', 'noopener,noreferrer');
    } else {
      alert('❌ 產生雲端評分總表失敗：' + (res.message || '未知錯誤'));
    }
  };

  // 8. 下載本組或全體 Excel (.xlsx) 評分總表
  const handleDownloadExcel = () => {
    if (!window.XLSX) {
      alert('Excel 匯出套件尚未載入完成，請重新整理頁面。');
      return;
    }
    if (processedGroupData.length === 0) return;

    const j1 = groupJudges[0] || { code: 'A' };
    const j2 = groupJudges[1] || { code: 'B' };
    const j3 = groupJudges[2] || { code: 'C' };

    const fullTitle = `${CATEGORY_FULL_TITLE_MAP[selectedCategory] || `【${selectedCategory}】`}評分總表`;
    const aoa = [
      [fullTitle],
      [
        '標題',
        '學校與隊伍',
        `評審${j1.code} (總分)`,
        `評審${j1.code} (序位)`,
        `評審${j2.code} (總分)`,
        `評審${j2.code} (序位)`,
        `評審${j3.code} (總分)`,
        `評審${j3.code} (序位)`,
        '平均總分',
        '序位法總分',
        '排名',
        `${j1.code}評語`,
        `${j2.code}評語`,
        `${j3.code}評語`,
        '特色表現獎',
        '特色優選獎'
      ]
    ];

    processedGroupData.forEach((item, idx) => {
      const dec = decisionsMap[item.team_id] || { feature_award: '', rank_award: '' };
      const jd1 = item.judgeDetails[0] || {};
      const jd2 = item.judgeDetails[1] || {};
      const jd3 = item.judgeDetails[2] || {};

      aoa.push([
        item.work_title,
        `${item.school}${item.team_name ? ' (' + item.team_name + ')' : ''}`,
        jd1.total_score ?? '',
        jd1.rank ?? '',
        jd2.total_score ?? '',
        jd2.rank ?? '',
        jd3.total_score ?? '',
        jd3.rank ?? '',
        item.avg_score ?? '',
        item.rank_sum ?? '',
        item.final_rank ?? (idx + 1),
        jd1.comment ? (jd1.award_rec ? `${jd1.comment} (${jd1.award_rec})` : jd1.comment) : '',
        jd2.comment ? (jd2.award_rec ? `${jd2.comment} (${jd2.award_rec})` : jd2.comment) : '',
        jd3.comment ? (jd3.award_rec ? `${jd3.comment} (${jd3.award_rec})` : jd3.comment) : '',
        dec.feature_award || '',
        dec.rank_award || ''
      ]);
    });

    // 以下空白列
    const nPlusOne = processedGroupData.length + 1;
    aoa.push([
      '以下空白',
      '—',
      '—',
      nPlusOne,
      '—',
      nPlusOne,
      '—',
      nPlusOne,
      '—',
      nPlusOne * 3,
      nPlusOne,
      '',
      '',
      '',
      '',
      ''
    ]);

    const ws = window.XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 28 }, { wch: 20 },
      { wch: 12 }, { wch: 10 },
      { wch: 12 }, { wch: 10 },
      { wch: 12 }, { wch: 10 },
      { wch: 12 }, { wch: 12 }, { wch: 8 },
      { wch: 36 }, { wch: 36 }, { wch: 36 },
      { wch: 14 }, { wch: 14 }
    ];

    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, `${selectedCategory}_評分總表`.substring(0, 31));
    window.XLSX.writeFile(wb, `${window.APP_CONFIG.CURRENT_YEAR}學年度_${selectedCategory}_評分總表.xlsx`);
  };

  const fullCategoryHeading = `${CATEGORY_FULL_TITLE_MAP[selectedCategory] || `【${selectedCategory}】`}評分總表`;
  const nPlusOne = processedGroupData.length + 1;

  return (
    <div className="space-y-4">
      {/* ==================== 頂部工具列 (投影字級切換、組別選單、規準抽屜、重新整理) ==================== */}
      <div className="no-print bg-white p-4 rounded-xl border border-amber-200 shadow-sm flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-amber-900 text-white px-3.5 py-2 rounded-lg flex items-center shadow-sm">
            <span className="material-icons mr-1.5">gavel</span>
            <span className="font-black text-base tracking-wide">共識會議決審工作台</span>
          </div>

          {/* 組別下拉選單 (快速切換) */}
          <div className="flex items-center space-x-2 bg-amber-50 border border-amber-300 rounded-lg px-3 py-1.5">
            <span className="text-sm font-bold text-amber-950">當前審閱組別：</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-white border border-amber-400 text-amber-950 font-black text-base rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-amber-600 cursor-pointer"
            >
              {CATEGORIES.map(c => {
                const count = teams.filter(t => String(t.category || t.Category || t.group_name || t.Group_Name) === c).length;
                return (
                  <option key={c} value={c}>
                    {c}（{count} 隊）
                  </option>
                );
              })}
            </select>
          </div>

          <button
            onClick={loadAllData}
            disabled={loading}
            className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-sm font-bold flex items-center shadow-sm transition"
            title="從雲端重新同步最新評審分數"
          >
            <span className={`material-icons text-base mr-1 ${loading ? 'animate-spin' : ''}`}>sync</span>
            同步最新分數
          </button>
        </div>

        {/* 右側：字級切換 [ ᴀ 小 ] [ A 中 ] [ 𝐀 大 ] + 📋 對照評分規準 */}
        <div className="flex flex-wrap items-center gap-3 justify-end">
          {/* 圖示階梯式字級切換器：純粹「小、中、大」三字 + 大小 A 視覺圖示 */}
          <div className="flex items-center bg-gray-100 p-1 rounded-xl border border-gray-300 shadow-inner">
            <button
              type="button"
              onClick={() => handleFontScaleChange('small')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1 transition ${
                fontScale === 'small'
                  ? 'bg-amber-900 text-white shadow'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              <span className="text-[13px] font-serif leading-none">A</span>
              <span className="text-sm">小</span>
            </button>
            <button
              type="button"
              onClick={() => handleFontScaleChange('medium')}
              className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center space-x-1 transition ${
                fontScale === 'medium'
                  ? 'bg-amber-900 text-white shadow'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              <span className="text-[17px] font-serif leading-none">A</span>
              <span className="text-base">中</span>
            </button>
            <button
              type="button"
              onClick={() => handleFontScaleChange('large')}
              className={`px-4 py-1.5 rounded-lg font-black flex items-center space-x-1.5 transition ${
                fontScale === 'large'
                  ? 'bg-amber-900 text-white shadow'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              <span className="text-[22px] font-serif leading-none">A</span>
              <span className="text-lg">大</span>
            </button>
          </div>

          {/* 右上角：對照評分規準按鈕 */}
          <button
            type="button"
            onClick={() => setShowRubricDrawer(true)}
            className="bg-indigo-700 hover:bg-indigo-800 text-white px-4 py-2 rounded-xl text-sm font-black flex items-center shadow-sm transition"
          >
            <span className="material-icons text-lg mr-1.5">fact_check</span>
            📋 對照評分規準
          </button>
        </div>
      </div>

      {/* ==================== 六大組別頁籤列 (方便一個組別一個組別點開) ==================== */}
      <div className="no-print flex flex-wrap gap-2">
        {CATEGORIES.map(c => {
          const isSelected = selectedCategory === c;
          const cTeams = teams.filter(t => String(t.category || t.Category || t.group_name || t.Group_Name) === c);
          const savedInCat = cTeams.filter(t => decisionsMap[String(t.team_id || t.Team_ID)]?.saved).length;
          const isCatSaved = cTeams.length > 0 && savedInCat === cTeams.length;
          return (
            <button
              key={c}
              onClick={() => setSelectedCategory(c)}
              className={`px-4 py-2.5 rounded-xl font-black text-sm flex items-center space-x-2 border transition shadow-sm ${
                isSelected
                  ? 'bg-amber-900 text-white border-amber-950 ring-2 ring-amber-400'
                  : 'bg-white text-gray-800 border-gray-300 hover:bg-amber-50'
              }`}
            >
              <span>{c}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                isSelected ? 'bg-amber-700 text-amber-100' : 'bg-gray-100 text-gray-600'
              }`}>
                {cTeams.length}隊
              </span>
              {isCatSaved && (
                <span className="text-emerald-400" title="此組別已儲存得獎名單">✔</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ==================== 共識會議名額與評審完評狀態儀表板 ==================== */}
      <div className="no-print bg-amber-50/90 border-2 border-amber-300 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          {/* 左側：3位評審完評進度與三分之一名額計算 */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-white border border-amber-300 rounded-lg px-3.5 py-2 flex items-center space-x-3 shadow-sm">
              <span className="text-sm font-black text-amber-950">評審完評進度：</span>
              {quotaStats.judgeProgress.map(jp => (
                <span
                  key={jp.code}
                  className={`px-2.5 py-1 rounded-md text-xs font-extrabold flex items-center ${
                    jp.isComplete
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      : 'bg-amber-100 text-amber-900 border border-amber-400'
                  }`}
                >
                  {jp.isComplete ? '🟢' : '🟡'} 評審{jp.code} ({jp.name})：{jp.scored}/{jp.total}
                </span>
              ))}
            </div>

            {/* 三分之一名額上限與目前勾選統計 */}
            <div className={`rounded-lg px-4 py-2 border flex flex-wrap items-center gap-3 shadow-sm ${
              quotaStats.isOverQuota
                ? 'bg-red-50 border-red-400 text-red-900'
                : 'bg-white border-amber-300 text-gray-900'
            }`}>
              <div className="text-sm font-black">
                本組共 <span className="text-lg text-amber-900 underline">{quotaStats.totalTeams}</span> 隊
                ➔ 三分之一名額上限（特優＋優等）：
                <span className="inline-block bg-amber-900 text-white px-2.5 py-0.5 rounded-md text-base font-black ml-1">
                  {quotaStats.quotaLimit} 隊
                </span>
              </div>
              <div className="h-5 w-px bg-gray-300 hidden sm:block"></div>
              <div className="flex items-center space-x-2 text-sm font-bold">
                <span className="px-2.5 py-1 rounded bg-yellow-200 text-yellow-950 font-black border border-yellow-400">
                  🥇 特優：{quotaStats.topCount}
                </span>
                <span className="px-2.5 py-1 rounded bg-amber-100 text-amber-950 font-black border border-amber-300">
                  🥈 優等：{quotaStats.excellentCount}
                </span>
                <span className={`px-2.5 py-1 rounded font-black ${
                  quotaStats.isOverQuota ? 'bg-red-600 text-white animate-pulse' : 'bg-emerald-100 text-emerald-900'
                }`}>
                  合計：{quotaStats.totalTopWinners} / {quotaStats.quotaLimit}
                </span>
                <span className="px-2.5 py-1 rounded bg-teal-100 text-teal-900 font-extrabold border border-teal-300">
                  ✨ 簡報之星：{quotaStats.presStarCount}
                </span>
                <span className="px-2.5 py-1 rounded bg-orange-100 text-orange-900 font-extrabold border border-orange-300">
                  ✨ 學習之星：{quotaStats.learnStarCount}
                </span>
              </div>
            </div>
          </div>

          {/* 右側：一鍵帶入系統試算建議 & 排序切換 */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSubScores(!showSubScores)}
              className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 text-gray-800 text-xs font-bold flex items-center shadow-sm"
            >
              <span className="material-icons text-sm mr-1">
                {showSubScores ? 'visibility' : 'visibility_off'}
              </span>
              {showSubScores ? '隱藏四項細分' : '顯示四項細分'}
            </button>

            <div className="flex items-center bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-gray-700 shadow-sm">
              <span className="mr-1.5">排序依據：</span>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value)}
                className="font-black text-amber-950 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="avg_desc">📊 平均總分（高 ➔ 低，預設）</option>
                <option value="rank_sum_asc">🔢 序位法總分（小 ➔ 大）</option>
                <option value="team_seq">📋 原出場隊伍序號</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleApplySystemRecommendations}
              className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-black flex items-center shadow-sm transition"
              title="依 90分特優、85分優等、前1/3名額與簡報之星/學習之星原則自動試算"
            >
              <span className="material-icons text-base mr-1">auto_fix_high</span>
              🪄 帶入系統試算建議
            </button>
          </div>
        </div>

        {/* 原則小叮嚀與操作按鈕列 */}
        <div className="pt-2 border-t border-amber-200/80 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div className="text-xs text-amber-950 font-semibold space-y-0.5">
            <div>
              💡 <strong>決審晉級原則</strong>：① 完賽保底為「<strong>學習之星</strong>」 ➔ ② 表現佳者選為「<strong>簡報之星</strong>」（相當於佳作，無名額限制） ➔ ③ 再從簡報之星中晉級前 1/3 名額為「<strong>優等</strong>」（原則 ≥85 分）與「<strong>特優</strong>」（原則 ≥90 分）。
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
            {hasUnsavedChanges && (
              <span className="text-xs font-black text-red-700 bg-red-100 border border-red-300 px-2.5 py-1 rounded-full animate-pulse">
                ● 尚有變更未儲存
              </span>
            )}
            {lastSavedTime && !hasUnsavedChanges && (
              <span className="text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-full">
                ✔ 已於 {lastSavedTime} 儲存至 Final_Results
              </span>
            )}

            <button
              type="button"
              onClick={handleSaveGroupResults}
              disabled={saving || processedGroupData.length === 0}
              className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-gray-400 text-white px-5 py-2.5 rounded-xl text-sm font-black flex items-center shadow-md transition"
            >
              <span className="material-icons text-base mr-1.5">save</span>
              {saving ? '儲存雲端中...' : '💾 儲存本組得獎名單'}
            </button>

            <button
              type="button"
              onClick={handleExportCloudSummarySheet}
              disabled={exportingSheet || processedGroupData.length === 0}
              className="bg-teal-800 hover:bg-teal-900 disabled:bg-gray-400 text-white px-4 py-2.5 rounded-xl text-sm font-black flex items-center shadow-sm transition"
            >
              <span className="material-icons text-base mr-1.5">table_view</span>
              {exportingSheet ? '產生試算表中...' : '☁️ 產生雲端評分總表 ↗'}
            </button>

            <button
              type="button"
              onClick={handleDownloadExcel}
              disabled={processedGroupData.length === 0}
              className="bg-slate-700 hover:bg-slate-800 text-white px-3.5 py-2.5 rounded-xl text-sm font-bold flex items-center shadow-sm transition"
            >
              <span className="material-icons text-base mr-1">download</span>
              下載 .xlsx
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              disabled={processedGroupData.length === 0}
              className="bg-gray-900 hover:bg-black text-white px-4 py-2.5 rounded-xl text-sm font-black flex items-center shadow-sm transition"
            >
              <span className="material-icons text-base mr-1.5">print</span>
              🖨️ 列印總表 (公文附件)
            </button>
          </div>
        </div>
      </div>

      {/* ==================== 評分總表主體 (比照去年評分總表結構與底色，支援大字體投影與 A4 橫式列印) ==================== */}
      <div className="bg-white rounded-xl border-2 border-gray-800 shadow-md overflow-x-auto p-2 md:p-4">
        {/* 總表頂部大標題 (螢幕與列印皆顯示) */}
        <div className="mb-3 flex flex-col sm:flex-row justify-between items-start sm:items-end border-b-2 border-black pb-2">
          <h2 className="text-2xl md:text-3xl font-black text-black tracking-tight">
            {fullCategoryHeading}
          </h2>
          <div className="text-xs md:text-sm font-bold text-gray-700">
            {window.APP_CONFIG.CURRENT_YEAR}學年度 簡報達人擂台賽 決審共識會議紀錄表
          </div>
        </div>

        <table className="w-full border-collapse judge-print-table text-black" style={{ border: '2px solid #000' }}>
          <thead>
            <tr className={`${fontStyles.tableHeader} font-black text-center`}>
              {/* 1. 標題 (暖米黃 #F9EBC8) */}
              <th
                className="p-2.5 border border-black"
                style={{ backgroundColor: '#F9EBC8', minWidth: '220px', width: '17%' }}
              >
                標題
              </th>
              {/* 2~4. 三位評審 (暖米黃 #F9EBC8) */}
              {groupJudges.map(j => (
                <th
                  key={j.code}
                  className="p-2 border border-black"
                  style={{ backgroundColor: '#F9EBC8', minWidth: '105px', width: '7.5%' }}
                >
                  <div>評審{j.code}</div>
                  <div className="text-xs font-bold text-gray-700 no-print">({j.name})</div>
                </th>
              ))}
              {/* 5. 平均總分 (淺粉藍 #DCE6F1) */}
              <th
                className="p-2 border border-black"
                style={{ backgroundColor: '#DCE6F1', minWidth: '85px', width: '6%' }}
              >
                平均<br />總分
              </th>
              {/* 6. 序位法總分 (淺灰 #F2F2F2) */}
              <th
                className="p-2 border border-black"
                style={{ backgroundColor: '#F2F2F2', minWidth: '80px', width: '5.5%' }}
              >
                序位法<br />總分
              </th>
              {/* 7. 排名 (淺紫 #D7BDE2) */}
              <th
                className="p-2 border border-black"
                style={{ backgroundColor: '#D7BDE2', minWidth: '65px', width: '4.5%' }}
              >
                排名
              </th>
              {/* 8~10. 三位評審評語 (淺粉紅 #F5D6D6) */}
              {groupJudges.map(j => (
                <th
                  key={`comment-${j.code}`}
                  className="p-2.5 border border-black"
                  style={{ backgroundColor: '#F5D6D6', minWidth: '200px', width: '12.5%' }}
                >
                  {j.code}評語
                </th>
              ))}
              {/* 11. 特色表現獎 (淺粉紅 #F5D6D6) */}
              <th
                className="p-2 border border-black"
                style={{ backgroundColor: '#F5D6D6', minWidth: '135px', width: '7.5%' }}
              >
                特色表現獎
              </th>
              {/* 12. 特色優選獎 (淺粉紅 #F5D6D6) */}
              <th
                className="p-2 border border-black"
                style={{ backgroundColor: '#F5D6D6', minWidth: '120px', width: '7%' }}
              >
                特色優選獎
              </th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan="12" className="p-12 text-center text-lg font-bold text-gray-500">
                  正在從雲端載入評審評分與決審資料...
                </td>
              </tr>
            ) : processedGroupData.length === 0 ? (
              <tr>
                <td colSpan="12" className="p-12 text-center text-lg font-bold text-gray-500">
                  本組別（{selectedCategory}）目前尚無參賽隊伍資料
                </td>
              </tr>
            ) : (
              processedGroupData.map((item, idx) => {
                const dec = decisionsMap[item.team_id] || { feature_award: '', rank_award: '' };
                const isTopWinner = dec.rank_award === '特優' || dec.rank_award === '優等';

                return (
                  <tr
                    key={item.team_id}
                    className="border-b border-black hover:bg-amber-50/40 transition"
                  >
                    {/* 1. 標題 + 學校隊伍 + 作品檔案快速點開按鈕 */}
                    <td className="p-3 border border-black align-middle text-center">
                      <div className={`${fontStyles.workTitle} text-gray-950 mb-1`}>
                        {item.work_title || '（未填作品名稱）'}
                      </div>
                      <div className={`${fontStyles.schoolText} text-amber-950 mb-2`}>
                        {item.school}
                        {item.team_name ? `【${item.team_name}】` : ''}
                      </div>

                      {/* 會議即時調閱作品按鈕列 (列印時自動隱藏 .no-print) */}
                      <div className="no-print flex flex-wrap justify-center gap-1.5 mt-1.5">
                        {item.slides_link && (
                          <a
                            href={item.slides_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${fontStyles.fileBtn} rounded-md bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-400 inline-flex items-center transition`}
                            title="新分頁開啟簡報檔"
                          >
                            📊 簡報 ↗
                          </a>
                        )}
                        {item.video_link && (
                          <a
                            href={item.video_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${fontStyles.fileBtn} rounded-md bg-red-100 hover:bg-red-200 text-red-900 border border-red-300 inline-flex items-center transition`}
                            title="新分頁開啟影片檔"
                          >
                            🎬 影片 ↗
                          </a>
                        )}
                        {item.mindmap_link && (
                          <a
                            href={item.mindmap_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${fontStyles.fileBtn} rounded-md bg-blue-100 hover:bg-blue-200 text-blue-900 border border-blue-300 inline-flex items-center transition`}
                            title="新分頁開啟心智圖"
                          >
                            🧠 心智圖 ↗
                          </a>
                        )}
                        {item.course_link && (
                          <a
                            href={item.course_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${fontStyles.fileBtn} rounded-md bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 inline-flex items-center transition`}
                            title="新分頁開啟校訂課程資料"
                          >
                            📑 校訂課程 ↗
                          </a>
                        )}
                      </div>
                    </td>

                    {/* 2~4. 三位評審分數、組內序位与四項細分 */}
                    {item.judgeDetails.map(jd => (
                      <td
                        key={`${item.team_id}-${jd.judge_code}`}
                        className="p-2.5 border border-black text-center align-middle"
                      >
                        {jd.has_scored ? (
                          <div className="space-y-1">
                            {/* 評審給分總分 */}
                            <div className={`${fontStyles.scoreMain} text-gray-950 leading-none`}>
                              {jd.total_score}
                              <span className="text-xs font-bold text-gray-500 ml-0.5">分</span>
                            </div>
                            {/* 該評審給的序位 */}
                            <div className={`${fontStyles.rankBadge} inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-950 border border-amber-300`}>
                              序位 {jd.rank}
                            </div>
                            {/* 四項細分 (40/30/20/10) 直接顯示免懸停 */}
                            {showSubScores && (
                              <div className={`no-print ${fontStyles.subScore} text-gray-600 bg-gray-50 rounded px-1.5 py-1 border border-gray-200 leading-tight`}>
                                <div>內{jd.score_content} / 表{jd.score_expression}</div>
                                <div>台{jd.score_stage} / 技{jd.score_technique}</div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm font-bold text-gray-400">未評分</span>
                        )}
                      </td>
                    ))}

                    {/* 5. 平均總分 */}
                    <td className="p-2.5 border border-black text-center align-middle bg-sky-50/40">
                      {item.avg_score !== null ? (
                        <div>
                          <div className={`${fontStyles.avgScore} ${
                            item.avg_score >= 90
                              ? 'text-amber-700'
                              : item.avg_score >= 85
                              ? 'text-emerald-800'
                              : 'text-gray-900'
                          }`}>
                            {item.avg_score.toFixed(1)}
                          </div>
                          {item.avg_score >= 90 && (
                            <span className="no-print inline-block text-xs font-black px-1.5 py-0.5 rounded bg-yellow-200 text-yellow-950">
                              ≥90 特優線
                            </span>
                          )}
                          {item.avg_score >= 85 && item.avg_score < 90 && (
                            <span className="no-print inline-block text-xs font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900">
                              ≥85 優等線
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 font-bold">—</span>
                      )}
                    </td>

                    {/* 6. 序位法總分 */}
                    <td className="p-2.5 border border-black text-center align-middle">
                      {item.rank_sum !== null ? (
                        <div>
                          <div className={`${fontStyles.scoreMain} text-gray-800`}>
                            {item.rank_sum}
                          </div>
                          <div className="no-print text-xs font-bold text-gray-500">
                            (序位排第 {item.sum_rank})
                          </div>
                          {item.has_rank_discrepancy && (
                            <div
                              className="no-print mt-1 inline-block px-1.5 py-0.5 rounded bg-orange-100 text-orange-900 border border-orange-300 text-[11px] font-black"
                              title={`總分平均排第 ${item.avg_rank} 名，但序位加總排第 ${item.sum_rank} 名，可於共識會議討論`}
                            >
                              ⚠️ 與總分名次不同
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 font-bold">—</span>
                      )}
                    </td>

                    {/* 7. 排名 (獲選特優/優等時亮黃底 #FFF200，完全比照去年總表視覺) */}
                    <td
                      className="p-2.5 border border-black text-center align-middle"
                      style={{
                        backgroundColor: isTopWinner ? '#FFF200' : 'transparent'
                      }}
                    >
                      <div className={`${fontStyles.rankNum} text-black`}>
                        {item.final_rank ?? (idx + 1)}
                      </div>
                    </td>

                    {/* 8~10. 三位評審完整評語 (免滑鼠懸停，直接完整呈現 + 顯示評審初步推薦標籤) */}
                    {item.judgeDetails.map(jd => (
                      <td
                        key={`comment-cell-${item.team_id}-${jd.judge_code}`}
                        className="p-3 border border-black align-middle text-left"
                      >
                        {jd.comment ? (
                          <div className={`${fontStyles.commentText} text-gray-950 whitespace-pre-wrap break-words`}>
                            {jd.comment}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm italic">（無評語）</span>
                        )}
                        {jd.award_rec && (
                          <div className="mt-1.5">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-black border ${
                              jd.award_rec.includes('簡報之星')
                                ? 'bg-teal-100 text-teal-950 border-teal-400'
                                : 'bg-amber-100 text-amber-950 border-amber-400'
                            }`}>
                              （推薦：{jd.award_rec}）
                            </span>
                          </div>
                        )}
                      </td>
                    ))}

                    {/* 11. 特色表現獎 (先決定：簡報之星 / 學習之星) */}
                    <td className="p-2.5 border border-black text-center align-middle">
                      {/* 網頁互動下拉選單 (列印時隱藏) */}
                      <div className="no-print space-y-1.5">
                        <select
                          value={dec.feature_award || ''}
                          onChange={(e) => handleDecisionChange(item.team_id, 'feature_award', e.target.value)}
                          className={`w-full rounded-xl font-black border-2 cursor-pointer transition focus:outline-none ${fontStyles.selectText} ${
                            dec.feature_award === '簡報之星'
                              ? 'bg-teal-100 text-teal-950 border-teal-500'
                              : dec.feature_award === '學習之星'
                              ? 'bg-amber-100 text-amber-950 border-amber-400'
                              : 'bg-gray-50 text-gray-500 border-gray-300'
                          }`}
                        >
                          <option value="">— 未選 —</option>
                          <option value="簡報之星">簡報之星</option>
                          <option value="學習之星">學習之星</option>
                        </select>

                        {/* 顯示三位評審的推薦票數提示 */}
                        {(item.star_presentation_count > 0 || item.star_learning_count > 0) && (
                          <div className="text-[11px] font-bold text-gray-600 leading-tight">
                            評審建議：
                            {item.star_presentation_count > 0 && (
                              <span className="text-teal-800 mr-1">簡報×{item.star_presentation_count}</span>
                            )}
                            {item.star_learning_count > 0 && (
                              <span className="text-amber-800">學習×{item.star_learning_count}</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 紙本列印時顯示之純文字 */}
                      <span className={`only-print-inline ${fontStyles.workTitle} font-black`}>
                        {dec.feature_award || ''}
                      </span>
                    </td>

                    {/* 12. 特色優選獎 (從簡報之星晉級：特優 / 優等) */}
                    <td className="p-2.5 border border-black text-center align-middle">
                      {/* 網頁互動下拉選單 (列印時隱藏) */}
                      <div className="no-print space-y-1">
                        <select
                          value={dec.rank_award || ''}
                          onChange={(e) => handleDecisionChange(item.team_id, 'rank_award', e.target.value)}
                          className={`w-full rounded-xl font-black border-2 cursor-pointer transition focus:outline-none ${fontStyles.selectText} ${
                            dec.rank_award === '特優'
                              ? 'bg-yellow-300 text-yellow-950 border-yellow-600 shadow-sm'
                              : dec.rank_award === '優等'
                              ? 'bg-amber-200 text-amber-950 border-amber-500 shadow-sm'
                              : 'bg-gray-50 text-gray-400 border-gray-300'
                          }`}
                        >
                          <option value="">— 無 —</option>
                          <option value="特優">特優</option>
                          <option value="優等">優等</option>
                        </select>
                      </div>

                      {/* 紙本列印時顯示之純文字 */}
                      <span className={`only-print-inline ${fontStyles.workTitle} font-black`}>
                        {dec.rank_award || ''}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}

            {/* 最末列：「以下空白」防竄改列 (比照去年總表：標題=以下空白、評審A/B/C=N+1、平均總分=—、序位總分=(N+1)*3、排名=N+1) */}
            {!loading && processedGroupData.length > 0 && (
              <tr className="border-t-2 border-black font-black text-center bg-white">
                <td className={`p-2.5 border border-black ${fontStyles.workTitle}`}>
                  以下空白
                </td>
                <td className={`p-2.5 border border-black ${fontStyles.scoreMain}`}>
                  {nPlusOne}
                </td>
                <td className={`p-2.5 border border-black ${fontStyles.scoreMain}`}>
                  {nPlusOne}
                </td>
                <td className={`p-2.5 border border-black ${fontStyles.scoreMain}`}>
                  {nPlusOne}
                </td>
                <td className={`p-2.5 border border-black ${fontStyles.scoreMain}`}>
                  —
                </td>
                <td className={`p-2.5 border border-black ${fontStyles.scoreMain}`}>
                  {nPlusOne * 3}
                </td>
                <td className={`p-2.5 border border-black ${fontStyles.scoreMain}`}>
                  {nPlusOne}
                </td>
                <td className="p-2.5 border border-black"></td>
                <td className="p-2.5 border border-black"></td>
                <td className="p-2.5 border border-black"></td>
                <td className="p-2.5 border border-black"></td>
                <td className="p-2.5 border border-black"></td>
              </tr>
            )}
          </tbody>
        </table>

        {/* 紙本列印頁尾說明 (無簽核欄，直接供公文系統簽核附件使用) */}
        <div className="only-print mt-2 flex justify-between items-center text-xs font-bold text-gray-700">
          <span>{window.APP_CONFIG.CURRENT_YEAR}學年度 宜蘭縣國民中小學簡報達人擂台賽 — {fullCategoryHeading}</span>
          <span>列印日期：中華民國 {window.APP_CONFIG.CURRENT_YEAR} 年 　 月 　 日</span>
        </div>
      </div>

      {/* ==================== 115 評分規準側邊對照抽屜 (Rubric Drawer) ==================== */}
      {showRubricDrawer && (
        <div className="no-print fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs">
          <div className="bg-white w-full max-w-3xl h-full shadow-2xl flex flex-col overflow-hidden animate-fade-in">
            {/* 抽屜標題列 */}
            <div className="bg-amber-950 text-white px-6 py-4 flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <span className="material-icons text-amber-400">fact_check</span>
                <h3 className="text-xl font-black">
                  115學年度 簡報達人擂台賽 — 評分規準與獎項原則對照表
                </h3>
              </div>
              <button
                onClick={() => setShowRubricDrawer(false)}
                className="bg-white/10 hover:bg-white/20 text-white rounded-lg px-3 py-1.5 text-sm font-bold flex items-center"
              >
                <span className="material-icons text-base mr-1">close</span>關閉
              </button>
            </div>

            {/* 抽屜內容區 */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6 text-gray-900">
              {/* 外部官方檔案連結 */}
              <div className="flex flex-wrap gap-3 bg-amber-50 p-4 rounded-xl border border-amber-200">
                {sysConfig.rubric_link && (
                  <a
                    href={sysConfig.rubric_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-indigo-700 hover:bg-indigo-800 text-white px-4 py-2 rounded-lg text-sm font-black inline-flex items-center shadow-sm"
                  >
                    <span className="material-icons text-base mr-1.5">open_in_new</span>
                    開啟完整官方評分規準表 (PDF) ↗
                  </a>
                )}
                {sysConfig.rules_link && (
                  <a
                    href={sysConfig.rules_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-amber-800 hover:bg-amber-900 text-white px-4 py-2 rounded-lg text-sm font-black inline-flex items-center shadow-sm"
                  >
                    <span className="material-icons text-base mr-1.5">description</span>
                    開啟 115 實施計畫簡章 ↗
                  </a>
                )}
              </div>

              {/* 獎項晉級金字塔與配額原則 */}
              <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-4 space-y-2">
                <h4 className="text-lg font-black text-emerald-950 flex items-center">
                  <span className="material-icons mr-1.5 text-emerald-700">emoji_events</span>
                  共識會議得獎決定與晉級原則
                </h4>
                <ul className="list-disc pl-5 space-y-1.5 text-base font-bold text-gray-800">
                  <li>
                    <span className="text-amber-900 font-black">【學習之星】（參加表現獎）</span>：只要有交件、具相應表現且無擺爛情形，原則上皆給予「學習之星」肯定。
                  </li>
                  <li>
                    <span className="text-teal-900 font-black">【簡報之星】（佳作角色，無名額限制）</span>：整體表現良好之隊伍可評定為「簡報之星」。
                  </li>
                  <li>
                    <span className="text-yellow-900 font-black">【優等 / 特優】（由簡報之星晉級，合計以該組參賽隊數 1/3 四捨五入為上限）</span>：
                    <ul className="list-circle pl-5 mt-1 space-y-1 text-sm font-bold text-gray-700">
                      <li>原則上平均總分 <strong>85 分以上</strong> 建議給「<strong>優等</strong>」</li>
                      <li>原則上平均總分 <strong>90 分以上</strong> 建議給「<strong>特優</strong>」</li>
                    </ul>
                  </li>
                </ul>
              </div>

              {/* 四大評分項目與比重 */}
              <div className="space-y-4">
                <h4 className="text-lg font-black text-gray-900 border-b pb-2">
                  四大評分指標與配分比重（滿分 100 分）
                </h4>

                <div className="grid grid-cols-1 gap-4">
                  <div className="p-4 rounded-xl border-2 border-amber-200 bg-white shadow-xs">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-lg font-black text-amber-950">1. 簡報內容（40%）</span>
                      <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-900 font-black text-sm">最高 40 分</span>
                    </div>
                    <p className="text-base text-gray-700 font-medium leading-relaxed">
                      主題契合度、問題意識與探究深度、資料正確性、邏輯結構完整性（含 Mindomo 心智圖架構對照、校訂課程組之課程脈絡連結）。
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border-2 border-blue-200 bg-white shadow-xs">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-lg font-black text-blue-950">2. 表達能力（30%）</span>
                      <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-900 font-black text-sm">最高 30 分</span>
                    </div>
                    <p className="text-base text-gray-700 font-medium leading-relaxed">
                      口齒清晰度、語調流暢自然、時間掌控（5~6分鐘）、重點闡述能力，能以自己的話清楚傳達核心觀點而非照稿唸誦。
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border-2 border-emerald-200 bg-white shadow-xs">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-lg font-black text-emerald-950">3. 台風表現（20%）</span>
                      <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 font-black text-sm">最高 20 分</span>
                    </div>
                    <p className="text-base text-gray-700 font-medium leading-relaxed">
                      肢體語言自然大方、眼神交流、自信心與情緒感染力、團隊成員分工合作與互動默契。
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border-2 border-purple-200 bg-white shadow-xs">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-lg font-black text-purple-950">4. 製作技巧（10%）</span>
                      <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-900 font-black text-sm">最高 10 分</span>
                    </div>
                    <p className="text-base text-gray-700 font-medium leading-relaxed">
                      版面視覺美感、圖文排版比例恰當（字體清晰不過小）、色彩搭配、轉場與多媒體輔助效果有助於理解。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
