/**
 * 簡報達人評分系統 115學年度 - 共識會議決審與成績總表模組 (js/views/admin-results.js)
 * v76.7-115 優化更新：
 * 1. 簡報/影片/心智圖/校訂課程：純圖示按鈕 (拿掉文字，滑鼠懸停顯示 tooltip)
 * 2. 評審給分細項 (內/表/台/技)：改為滑鼠懸停浮動卡片呈現，平時只清爽顯示總分與序位
 * 3. 序位法總分：移除「(序位排第X)」贅字，純粹呈現加總數字
 * 4. 按鈕圖示去重：移除雙重 emoji/icon，並移除「下載 .xlsx」按鈕
 * 5. 本機 LocalStorage 自動暫存 + 未存雲端警示提醒 + beforeunload 攔截
 * 6. 移除「晉級原則」文字標註 (改由評審現場口頭說明)
 * 7. 移除右上角重複小標題與「決審共識會議紀錄表」字樣
 * 8. 列印樣式深度優化：table-layout: fixed + 字級自動縮版，100% 完整容納於 A4 橫向無溢出
 */

window.AdminResultsView = function() {
  const { useState, useEffect, useMemo } = React;

  const CATEGORIES = window.APP_CONFIG?.ALL_CATEGORIES || [
    '宜蘭在地國中組', '宜蘭在地國小組',
    '環境永續國中組', '環境永續國小組',
    '校訂課程國中組', '校訂課程國小組'
  ];

  // 組別正式全銜對照表
  const CATEGORY_FULL_TITLE_MAP = {
    '宜蘭在地國中組': '【宜蘭在地自然人文特色—國中組】',
    '宜蘭在地國小組': '【宜蘭在地自然人文特色—國小組】',
    '環境永續國中組': '【環境永續×SDGs及生活裡的永續—國中組】',
    '環境永續國小組': '【環境永續×SDGs及生活裡的永續—國小組】',
    '校訂課程國中組': '【學校校訂課程—國中組】',
    '校訂課程國小組': '【學校校訂課程—國小組】'
  };

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
  const [showRubricDrawer, setShowRubricDrawer] = useState(false);

  // 字體大小切換：'small' (小) | 'medium' (中) | 'large' (大，預設)
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

  // 決審獎項狀態 map: { [team_id]: { feature_award: '', rank_award: '', saved: boolean } }
  const [decisionsMap, setDecisionsMap] = useState({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState('');

  // 監聽 beforeunload，若有未存檔變更提醒使用者
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '尚有決審結果尚未儲存至雲端，確定要離開嗎？';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

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

      // 1. 先讀取雲端已存之 Final_Results
      const cloudMap = {};
      loadedFinals.forEach(fr => {
        const tid = String(fr.team_id || '');
        if (tid) {
          cloudMap[tid] = {
            feature_award: String(fr.feature_award || ''),
            rank_award: String(fr.rank_award || ''),
            saved: true
          };
        }
      });

      // 2. 比對本地 LocalStorage 是否有未寫入雲端之最新暫存
      let localDraftMap = {};
      try {
        const cached = localStorage.getItem(`consensus_decisions_${window.APP_CONFIG.CURRENT_YEAR}`);
        if (cached) {
          localDraftMap = JSON.parse(cached);
        }
      } catch (e) {
        console.warn('讀取本機決審暫存失敗', e);
      }

      // 合併：本地有未存草稿則優先保留，並提示未儲存
      const finalCombined = { ...cloudMap };
      let foundUnsavedDraft = false;
      Object.keys(localDraftMap).forEach(tid => {
        if (localDraftMap[tid] && !localDraftMap[tid].saved) {
          finalCombined[tid] = { ...localDraftMap[tid] };
          foundUnsavedDraft = true;
        }
      });

      setDecisionsMap(finalCombined);
      setHasUnsavedChanges(foundUnsavedDraft);
    } else {
      alert('讀取成績彙整資料失敗：' + (res.message || '未知錯誤'));
    }
    setLoading(false);
  };

  // 本機自動暫存輔助函式
  const saveToLocalDraft = (newMap) => {
    try {
      localStorage.setItem(`consensus_decisions_${window.APP_CONFIG.CURRENT_YEAR}`, JSON.stringify(newMap));
    } catch (e) {
      console.warn('本機儲存失敗', e);
    }
  };

  // 字級樣式對應表（螢幕投影呈現）
  const fontStyles = useMemo(() => {
    if (fontScale === 'small') {
      return {
        tableHeader: 'text-sm',
        workTitle: 'text-base font-extrabold leading-snug',
        schoolText: 'text-xs',
        scoreMain: 'text-lg font-black',
        rankBadge: 'text-xs',
        avgScore: 'text-xl font-black',
        rankNum: 'text-xl font-black',
        commentText: 'text-sm leading-relaxed',
        selectText: 'text-sm py-1.5 px-2'
      };
    }
    if (fontScale === 'medium') {
      return {
        tableHeader: 'text-base',
        workTitle: 'text-xl font-extrabold leading-snug',
        schoolText: 'text-sm',
        scoreMain: 'text-xl font-black',
        rankBadge: 'text-sm',
        avgScore: 'text-2xl font-black',
        rankNum: 'text-2xl font-black',
        commentText: 'text-base leading-relaxed',
        selectText: 'text-base py-2 px-2.5'
      };
    }
    // 'large' (預設：大字體)
    return {
      tableHeader: 'text-lg',
      workTitle: 'text-[22px] font-black leading-snug',
      schoolText: 'text-base font-bold',
      scoreMain: 'text-[24px] font-black',
      rankBadge: 'text-base font-bold',
      avgScore: 'text-[28px] font-black',
      rankNum: 'text-[28px] font-black',
      commentText: 'text-[18px] leading-relaxed font-medium',
      selectText: 'text-[18px] py-2.5 px-3'
    };
  }, [fontScale]);

  // 1. 取得目前選中組別的 3 位負責評審
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

  // 2. 篩選該組別之參賽隊伍並計算每位評審組內序位、平均總分、序位法總分與排名
  // (自動排除「未繳件」隊伍：無簡報連結且無影片連結者視為未繳件，不列入總表與 1/3 名額計算)
  const processedGroupData = useMemo(() => {
    const groupTeams = teams.filter(t => {
      const cat = String(t.category || t.Category || t.group_name || t.Group_Name || '').trim();
      const matchesCat = cat === selectedCategory;
      const slides = (t.slides_link || t.Slides_Link || '').trim();
      const video = (t.video_link || t.Video_Link || '').trim();
      const isSubmitted = !!(slides || video);
      return matchesCat && isSubmitted;
    });

    const judgeRankMap = {};
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

    // 平均總分排名
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

    // 序位法總分排名
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

  // 3. 計算本組 1/3 錄取名額上限與統計
  const quotaStats = useMemo(() => {
    const totalTeams = processedGroupData.length;
    const quotaLimit = totalTeams > 0 ? Math.ceil(totalTeams / 3) : 0;

    let topCount = 0;
    let excellentCount = 0;
    let presStarCount = 0;
    let learnStarCount = 0;

    processedGroupData.forEach(item => {
      const dec = decisionsMap[item.team_id] || { feature_award: '', rank_award: '' };
      if (dec.rank_award === '特優') topCount++;
      if (dec.rank_award === '優等') excellentCount++;
      if (dec.feature_award === '簡報之星') presStarCount++;
      if (dec.feature_award === '學習之星') learnStarCount++;
    });

    const totalTopWinners = topCount + excellentCount;
    const isOverQuota = totalTopWinners > quotaLimit;

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
      judgeProgress
    };
  }, [processedGroupData, decisionsMap, groupJudges]);

  // 4. 單一隊伍下拉選單變更處理 (變更時即刻自動暫存至 LocalStorage)
  const handleDecisionChange = (teamId, field, value) => {
    setDecisionsMap(prev => {
      const current = prev[teamId] || { feature_award: '', rank_award: '', saved: false };
      const updated = { ...current, [field]: value, saved: false };

      if (field === 'rank_award' && (value === '特優' || value === '優等')) {
        updated.feature_award = '簡報之星';
      }
      if (field === 'feature_award' && value !== '簡報之星' && (updated.rank_award === '特優' || updated.rank_award === '優等')) {
        updated.rank_award = '';
      }

      const nextMap = { ...prev, [teamId]: updated };
      saveToLocalDraft(nextMap);
      return nextMap;
    });
    setHasUnsavedChanges(true);
  };

  // 5. 儲存本組決審結果至雲端 Final_Results
  const handleSaveGroupResults = async () => {
    if (processedGroupData.length === 0) return;

    if (quotaStats.isOverQuota) {
      const confirmOver = window.confirm(
        `名額提醒：本組共有 ${quotaStats.totalTeams} 隊，三分之一建議名額上限為 ${quotaStats.quotaLimit} 隊。\n` +
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
      const next = { ...decisionsMap };
      processedGroupData.forEach(item => {
        if (next[item.team_id]) {
          next[item.team_id] = { ...next[item.team_id], saved: true };
        } else {
          next[item.team_id] = { feature_award: '', rank_award: '', saved: true };
        }
      });
      setDecisionsMap(next);
      saveToLocalDraft(next);
      setHasUnsavedChanges(false);
      const nowStr = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastSavedTime(nowStr);
      alert(`【${selectedCategory}】共 ${payloadResults.length} 支隊伍的決審得獎名單已成功儲存至雲端資料庫 (Final_Results)！`);
    } else {
      alert('儲存失敗：' + (res.message || '請稍後再試'));
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
      alert('產生雲端評分總表失敗：' + (res.message || '未知錯誤'));
    }
  };

  const fullCategoryHeading = `${CATEGORY_FULL_TITLE_MAP[selectedCategory] || `【${selectedCategory}】`}評分總表`;

  return (
    <div className="space-y-4">
      {/* ==================== 第 1 層：六大組別頁籤切換與全域工具列 ==================== */}
      <div className="no-print bg-white p-3 rounded-xl border border-amber-200 shadow-sm flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-3">
        {/* 左側：六大組別頁籤按鈕 (直接切換，含已繳件隊數與存檔打勾標註，徹底取代舊有下拉選單) */}
        <div className="flex flex-wrap items-center gap-2">
          {CATEGORIES.map(c => {
            const isSelected = selectedCategory === c;
            const cTeams = teams.filter(t => String(t.category || t.Category || t.group_name || t.Group_Name) === c);
            const cSubmitted = cTeams.filter(t => (t.slides_link || t.Slides_Link || '').trim() || (t.video_link || t.Video_Link || '').trim());
            const savedInCat = cSubmitted.filter(t => decisionsMap[String(t.team_id || t.Team_ID)]?.saved).length;
            const isCatSaved = cSubmitted.length > 0 && savedInCat === cSubmitted.length;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setSelectedCategory(c)}
                className={`px-3.5 py-2 rounded-xl font-black text-sm flex items-center space-x-2 border transition shadow-sm cursor-pointer ${
                  isSelected
                    ? 'bg-amber-900 text-white border-amber-950 ring-2 ring-amber-400'
                    : 'bg-white text-gray-800 border-gray-300 hover:bg-amber-50'
                }`}
              >
                <span>{c}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  isSelected ? 'bg-amber-700 text-amber-100' : 'bg-gray-100 text-gray-600'
                }`}>
                  {cSubmitted.length} 隊
                </span>
                {isCatSaved && (
                  <span className="text-emerald-400 font-black ml-0.5" title="此組別已儲存得獎名單">✔</span>
                )}
              </button>
            );
          })}
        </div>

        {/* 右側：同步最新分數 ｜ 字級縮放 [ A 小 | A 中 | 𝐀 大 ] ｜ 對照評分規準 */}
        <div className="flex flex-wrap items-center gap-2.5 justify-end shrink-0">
          <button
            type="button"
            onClick={loadAllData}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-sm font-bold flex items-center shadow-sm transition cursor-pointer"
            title="從雲端重新同步最新評審分數"
          >
            <span className={`material-icons text-base mr-1 ${loading ? 'animate-spin' : ''}`}>sync</span>
            同步分數
          </button>

          <div className="flex items-center bg-gray-100 p-0.5 rounded-lg border border-gray-300 shadow-inner">
            <button
              type="button"
              onClick={() => handleFontScaleChange('small')}
              className={`px-2.5 py-1 rounded-md font-bold flex items-center space-x-1 transition cursor-pointer ${
                fontScale === 'small'
                  ? 'bg-amber-900 text-white shadow'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              <span className="text-[12px] font-serif leading-none">A</span>
              <span className="text-xs">小</span>
            </button>
            <button
              type="button"
              onClick={() => handleFontScaleChange('medium')}
              className={`px-2.5 py-1 rounded-md font-bold flex items-center space-x-1 transition cursor-pointer ${
                fontScale === 'medium'
                  ? 'bg-amber-900 text-white shadow'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              <span className="text-[15px] font-serif leading-none">A</span>
              <span className="text-sm">中</span>
            </button>
            <button
              type="button"
              onClick={() => handleFontScaleChange('large')}
              className={`px-3 py-1 rounded-md font-black flex items-center space-x-1 transition cursor-pointer ${
                fontScale === 'large'
                  ? 'bg-amber-900 text-white shadow'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              <span className="text-[18px] font-serif leading-none">A</span>
              <span className="text-base">大</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowRubricDrawer(true)}
            className="bg-indigo-700 hover:bg-indigo-800 text-white px-3.5 py-1.5 rounded-lg text-sm font-black flex items-center shadow-sm transition cursor-pointer"
          >
            <span className="material-icons text-base mr-1">fact_check</span>
            評分規準
          </button>
        </div>
      </div>

      {/* ==================== 第 2 層：共識會議儀表板 ＆ 決策操作列 ==================== */}
      <div className="no-print bg-amber-50/90 border-2 border-amber-300 rounded-xl p-3.5 shadow-sm space-y-3">
        {/* 上半部：評審完評進度 ＆ 三分之一名額即時合規指針 */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* 評審完評進度 */}
            <div className="bg-white border border-amber-300 rounded-lg px-3 py-1.5 flex items-center space-x-2.5 shadow-sm">
              <span className="text-xs sm:text-sm font-black text-amber-950">評審完評進度：</span>
              {quotaStats.judgeProgress.map(jp => (
                <span
                  key={jp.code}
                  className={`px-2 py-0.5 rounded-md text-xs font-extrabold flex items-center ${
                    jp.isComplete
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      : 'bg-amber-100 text-amber-900 border border-amber-400'
                  }`}
                >
                  {jp.isComplete ? '🟢' : '🟡'} 評審{jp.code}：{jp.scored}/{jp.total}
                </span>
              ))}
            </div>

            {/* 三分之一名額法定規準指針 */}
            <div className={`rounded-lg px-3.5 py-1.5 border flex flex-wrap items-center gap-2.5 shadow-sm ${
              quotaStats.isOverQuota
                ? 'bg-red-50 border-red-400 text-red-900'
                : 'bg-white border-amber-300 text-gray-900'
            }`}>
              <div className="text-xs sm:text-sm font-black">
                實參 <span className="text-base text-amber-900 underline font-black">{quotaStats.totalTeams}</span> 隊
                ➔ <span className="text-amber-950 font-bold">1/3 上限 (特優+優等)：</span>
                <span className="inline-block bg-amber-900 text-white px-2 py-0.5 rounded text-sm font-black ml-1">
                  {quotaStats.quotaLimit} 隊
                </span>
              </div>
              <div className="h-4 w-px bg-gray-300 hidden sm:block"></div>
              <div className="flex items-center space-x-1.5 text-xs font-bold">
                <span className="px-2 py-0.5 rounded bg-yellow-200 text-yellow-950 font-black border border-yellow-400">
                  特優：{quotaStats.topCount}
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-950 font-black border border-amber-300">
                  優等：{quotaStats.excellentCount}
                </span>
                <span className={`px-2 py-0.5 rounded font-black ${
                  quotaStats.isOverQuota ? 'bg-red-600 text-white animate-pulse' : 'bg-emerald-100 text-emerald-900'
                }`}>
                  合計：{quotaStats.totalTopWinners} / {quotaStats.quotaLimit}
                </span>
                <span className="px-2 py-0.5 rounded bg-teal-100 text-teal-900 font-extrabold border border-teal-300">
                  簡報之星：{quotaStats.presStarCount}
                </span>
                <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-900 font-extrabold border border-orange-300">
                  學習之星：{quotaStats.learnStarCount}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 下半部：排序依據 ＋ 存檔提示 ＋ 操作按鈕 (已徹底移除「帶入系統建議」按鈕) */}
        <div className="pt-2.5 border-t border-amber-200/80 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-white border border-gray-300 rounded-lg px-2.5 py-1 text-xs font-bold text-gray-700 shadow-sm">
              <span className="mr-1.5">排序依據：</span>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value)}
                className="font-black text-amber-950 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="avg_desc">平均總分（高 ➔ 低，預設）</option>
                <option value="rank_sum_asc">序位法總分（小 ➔ 大）</option>
                <option value="team_seq">原出場隊伍序號</option>
              </select>
            </div>

            {hasUnsavedChanges ? (
              <span className="text-xs font-black text-red-700 bg-red-100 border border-red-300 px-2.5 py-1 rounded-lg flex items-center animate-pulse">
                <span className="material-icons text-sm mr-1">warning</span>
                本機已暫存，請記得點擊「儲存本組得獎名單」寫入雲端！
              </span>
            ) : lastSavedTime ? (
              <span className="text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-lg flex items-center">
                <span className="material-icons text-sm mr-1">check_circle</span>
                已於 {lastSavedTime} 成功存入雲端
              </span>
            ) : (
              <span className="text-xs font-medium text-gray-500">
                本機自動即時暫存中
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
            <button
              type="button"
              onClick={handleSaveGroupResults}
              disabled={saving || processedGroupData.length === 0}
              className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-gray-400 text-white px-4 py-2 rounded-xl text-sm font-black flex items-center shadow-md transition cursor-pointer"
            >
              <span className="material-icons text-base mr-1.5">save</span>
              {saving ? '儲存中...' : '儲存本組得獎名單'}
            </button>

            <button
              type="button"
              onClick={handleExportCloudSummarySheet}
              disabled={exportingSheet || processedGroupData.length === 0}
              className="bg-teal-800 hover:bg-teal-900 disabled:bg-gray-400 text-white px-3.5 py-2 rounded-xl text-sm font-black flex items-center shadow-sm transition cursor-pointer"
            >
              <span className="material-icons text-base mr-1.5">open_in_new</span>
              {exportingSheet ? '產生中...' : '雲端評分總表'}
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              disabled={processedGroupData.length === 0}
              className="bg-gray-900 hover:bg-black text-white px-3.5 py-2 rounded-xl text-sm font-black flex items-center shadow-sm transition cursor-pointer"
            >
              <span className="material-icons text-base mr-1.5">print</span>
              列印總表
            </button>
          </div>
        </div>
      </div>

      {/* ==================== 評分總表主體 ==================== */}
      <div className="consensus-print-container bg-white rounded-xl border-2 border-gray-800 shadow-md overflow-x-auto p-2 md:p-4">
        <div className="consensus-print-title mb-3 border-b-2 border-black pb-2">
          <h2 className="text-2xl md:text-3xl font-black text-black tracking-tight">
            {fullCategoryHeading}
          </h2>
        </div>

        {/* 12欄總和嚴格控制在 100%，確保螢幕與 A4 列印右側兩欄絕不被擠壓 */}
        <table className="w-full border-collapse judge-print-table text-black" style={{ border: '2px solid #000' }}>
          <colgroup>
            <col style={{ width: '15%' }} />
            <col style={{ width: '5.5%' }} />
            <col style={{ width: '5.5%' }} />
            <col style={{ width: '5.5%' }} />
            <col style={{ width: '5.5%' }} />
            <col style={{ width: '5.5%' }} />
            <col style={{ width: '4%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '9.5%' }} />
          </colgroup>
          <thead>
            <tr className={`${fontStyles.tableHeader} font-black text-center print-text-base`}>
              <th
                className="p-2 border border-black"
                style={{ backgroundColor: '#F9EBC8' }}
              >
                標題
              </th>
              {groupJudges.map(j => (
                <th
                  key={j.code}
                  className="p-1.5 border border-black"
                  style={{ backgroundColor: '#F9EBC8' }}
                >
                  評審{j.code}
                </th>
              ))}
              <th
                className="p-1.5 border border-black"
                style={{ backgroundColor: '#DCE6F1' }}
              >
                平均<br />總分
              </th>
              <th
                className="p-1.5 border border-black"
                style={{ backgroundColor: '#F2F2F2' }}
              >
                序位法<br />總分
              </th>
              <th
                className="p-1.5 border border-black"
                style={{ backgroundColor: '#D7BDE2' }}
              >
                排名
              </th>
              {groupJudges.map(j => (
                <th
                  key={`comment-${j.code}`}
                  className="p-2 border border-black"
                  style={{ backgroundColor: '#F5D6D6' }}
                >
                  {j.code}評語
                </th>
              ))}
              <th
                className="p-1.5 border border-black min-w-[138px]"
                style={{ backgroundColor: '#F5D6D6' }}
              >
                特色表現獎
              </th>
              <th
                className="p-1.5 border border-black min-w-[115px]"
                style={{ backgroundColor: '#F5D6D6' }}
              >
                特色優選獎
              </th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan="12" className="p-12 text-center text-lg font-bold text-gray-500">
                  正在載入評分與決審資料...
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
                    {/* 1. 標題 + 純圖示按鈕 */}
                    <td className="p-2 border border-black align-middle text-center">
                      <div className={`${fontStyles.workTitle} text-gray-950 mb-0.5 print-text-base`}>
                        {item.work_title || '（未填作品名稱）'}
                      </div>
                      <div className={`${fontStyles.schoolText} text-amber-950 mb-1.5 print-text-sm`}>
                        {item.school}
                        {item.team_name ? `【${item.team_name}】` : ''}
                      </div>

                      {/* 純圖示按鈕列 (無贅字，列印時自動隱藏) */}
                      <div className="no-print flex items-center justify-center gap-1.5 mt-1">
                        {item.slides_link && (
                          <a
                            href={item.slides_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-8 h-8 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-400 flex items-center justify-center text-base shadow-2xs transition"
                            title="開啟簡報檔 ↗"
                          >
                            📊
                          </a>
                        )}
                        {item.video_link && (
                          <a
                            href={item.video_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-8 h-8 rounded-lg bg-red-100 hover:bg-red-200 text-red-900 border border-red-300 flex items-center justify-center text-base shadow-2xs transition"
                            title="開啟影片檔 ↗"
                          >
                            🎬
                          </a>
                        )}
                        {item.mindmap_link && (
                          <a
                            href={item.mindmap_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-8 h-8 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-900 border border-blue-300 flex items-center justify-center text-base shadow-2xs transition"
                            title="開啟 Mindomo 心智圖 ↗"
                          >
                            🧠
                          </a>
                        )}
                        {item.course_link && (
                          <a
                            href={item.course_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-8 h-8 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 flex items-center justify-center text-base shadow-2xs transition"
                            title="開啟校訂課程計畫 ↗"
                          >
                            📑
                          </a>
                        )}
                      </div>
                    </td>

                    {/* 2~4. 三位評審 (清爽呈現，四項細分改為 hover 浮動卡片) */}
                    {item.judgeDetails.map(jd => (
                      <td
                        key={`${item.team_id}-${jd.judge_code}`}
                        className="p-1.5 border border-black text-center align-middle relative group cursor-default"
                      >
                        {jd.has_scored ? (
                          <div className="space-y-1">
                            <div className={`${fontStyles.scoreMain} text-gray-950 leading-none print-text-base`}>
                              {jd.total_score}
                              <span className="text-xs font-bold text-gray-500 ml-0.5 no-print">分</span>
                            </div>
                            <div className={`${fontStyles.rankBadge} inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-950 border border-amber-300 print-text-sm`}>
                              序位 {jd.rank}
                            </div>

                            {/* 滑鼠懸停才浮現的四項細分卡片 (列印時隱藏) */}
                            <div className="no-print hidden group-hover:block absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-44 p-2 bg-gray-900 text-white text-xs rounded-lg shadow-xl border border-gray-700 pointer-events-none text-left">
                              <div className="font-bold text-amber-300 mb-1 border-b border-gray-700 pb-0.5">
                                評審{jd.judge_code} 細項評分：
                              </div>
                              <div className="space-y-0.5 leading-snug">
                                <div className="flex justify-between">
                                  <span>簡報內容(40%)：</span>
                                  <span className="font-bold text-amber-200">{jd.score_content}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>表達能力(30%)：</span>
                                  <span className="font-bold text-blue-200">{jd.score_expression}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>台風表現(20%)：</span>
                                  <span className="font-bold text-emerald-200">{jd.score_stage}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>製作技巧(10%)：</span>
                                  <span className="font-bold text-purple-200">{jd.score_technique}</span>
                                </div>
                              </div>
                              <div className="mt-1 pt-1 border-t border-gray-700 flex justify-between font-black text-white">
                                <span>合計總分：</span>
                                <span className="text-amber-400">{jd.total_score} 分</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-gray-400">未評分</span>
                        )}
                      </td>
                    ))}

                    {/* 5. 平均總分 */}
                    <td className="p-1.5 border border-black text-center align-middle bg-sky-50/40">
                      {item.avg_score !== null ? (
                        <div className={`${fontStyles.avgScore} print-text-base ${
                          item.avg_score >= 90
                            ? 'text-amber-700'
                            : item.avg_score >= 85
                            ? 'text-emerald-800'
                            : 'text-gray-900'
                        }`}>
                          {item.avg_score.toFixed(1)}
                        </div>
                      ) : (
                        <span className="text-gray-400 font-bold">—</span>
                      )}
                    </td>

                    {/* 6. 序位法總分 */}
                    <td className="p-1.5 border border-black text-center align-middle">
                      {item.rank_sum !== null ? (
                        <div>
                          <div className={`${fontStyles.scoreMain} text-gray-800 print-text-base`}>
                            {item.rank_sum}
                          </div>
                          {item.has_rank_discrepancy && (
                            <div
                              className="no-print mt-0.5 inline-block px-1 py-0.2 rounded bg-orange-100 text-orange-900 border border-orange-300 text-[10px] font-bold"
                              title={`總分排第 ${item.avg_rank} 名，序位加總排第 ${item.sum_rank} 名`}
                            >
                              名次不同
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 font-bold">—</span>
                      )}
                    </td>

                    {/* 7. 排名 (特優/優等亮黃底 #FFF200) */}
                    <td
                      className="p-1.5 border border-black text-center align-middle"
                      style={{
                        backgroundColor: isTopWinner ? '#FFF200' : 'transparent'
                      }}
                    >
                      <div className={`${fontStyles.rankNum} text-black print-text-base`}>
                        {item.final_rank ?? (idx + 1)}
                      </div>
                    </td>

                    {/* 8~10. 三位評審評語 */}
                    {item.judgeDetails.map(jd => (
                      <td
                        key={`comment-cell-${item.team_id}-${jd.judge_code}`}
                        className="p-2 border border-black align-middle text-left"
                      >
                        {jd.comment ? (
                          <div className={`${fontStyles.commentText} text-gray-950 whitespace-pre-wrap break-words print-text-sm`}>
                            {jd.comment}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs italic">（無評語）</span>
                        )}
                        {jd.award_rec && (
                          <div className="mt-1">
                            <span className={`inline-block px-1.5 py-0.2 rounded-full text-xs font-bold border print-text-sm ${
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

                    {/* 11. 特色表現獎 (保證寬度充足，文字完整呈現) */}
                    <td className="p-1.5 border border-black text-center align-middle min-w-[138px]">
                      <div className="no-print">
                        <select
                          value={dec.feature_award || ''}
                          onChange={(e) => handleDecisionChange(item.team_id, 'feature_award', e.target.value)}
                          className={`w-full min-w-[124px] rounded-lg font-black border-2 cursor-pointer transition focus:outline-none text-center ${fontStyles.selectText} ${
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
                      </div>

                      <span className="only-print-inline print-text-base font-black whitespace-nowrap">
                        {dec.feature_award || ''}
                      </span>
                    </td>

                    {/* 12. 特色優選獎 (保證寬度充足，文字完整呈現) */}
                    <td className="p-1.5 border border-black text-center align-middle min-w-[115px]">
                      <div className="no-print">
                        <select
                          value={dec.rank_award || ''}
                          onChange={(e) => handleDecisionChange(item.team_id, 'rank_award', e.target.value)}
                          className={`w-full min-w-[100px] rounded-lg font-black border-2 cursor-pointer transition focus:outline-none text-center ${fontStyles.selectText} ${
                            dec.rank_award === '特優'
                              ? 'bg-yellow-300 text-yellow-950 border-yellow-600'
                              : dec.rank_award === '優等'
                              ? 'bg-amber-200 text-amber-950 border-amber-500'
                              : 'bg-gray-50 text-gray-400 border-gray-300'
                          }`}
                        >
                          <option value="">— 無 —</option>
                          <option value="特優">特優</option>
                          <option value="優等">優等</option>
                        </select>
                      </div>

                      <span className="only-print-inline print-text-base font-black whitespace-nowrap">
                        {dec.rank_award || ''}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}

            {/* 以下空白列：第一格為「以下空白」，後面 11 格統一為一條橫槓「—」 */}
            {!loading && processedGroupData.length > 0 && (
              <tr className="border-t-2 border-black font-black text-center bg-white print-text-base">
                <td className={`p-2 border border-black ${fontStyles.workTitle} print-text-base`}>
                  以下空白
                </td>
                <td className="p-1.5 border border-black text-gray-700">—</td>
                <td className="p-1.5 border border-black text-gray-700">—</td>
                <td className="p-1.5 border border-black text-gray-700">—</td>
                <td className="p-1.5 border border-black text-gray-700">—</td>
                <td className="p-1.5 border border-black text-gray-700">—</td>
                <td className="p-1.5 border border-black text-gray-700">—</td>
                <td className="p-1.5 border border-black text-gray-700">—</td>
                <td className="p-1.5 border border-black text-gray-700">—</td>
                <td className="p-1.5 border border-black text-gray-700">—</td>
                <td className="p-1.5 border border-black text-gray-700">—</td>
                <td className="p-1.5 border border-black text-gray-700">—</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* 紙本列印頁尾 */}
        <div className="only-print mt-2 flex justify-between items-center text-xs font-bold text-gray-700">
          <span>{window.APP_CONFIG.CURRENT_YEAR}學年度 宜蘭縣國民中小學簡報達人擂台賽 — {fullCategoryHeading}</span>
          <span>列印日期：中華民國 {window.APP_CONFIG.CURRENT_YEAR} 年 　 月 　 日</span>
        </div>
      </div>

      {/* ==================== 115 評分規準側邊抽屜 (移除晉級原則話語) ==================== */}
      {showRubricDrawer && (
        <div className="no-print fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs">
          <div className="bg-white w-full max-w-2xl h-full shadow-2xl flex flex-col overflow-hidden animate-fade-in">
            <div className="bg-amber-950 text-white px-6 py-4 flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <span className="material-icons text-amber-400">fact_check</span>
                <h3 className="text-xl font-black">
                  評分規準對照表
                </h3>
              </div>
              <button
                onClick={() => setShowRubricDrawer(false)}
                className="bg-white/10 hover:bg-white/20 text-white rounded-lg px-3 py-1.5 text-sm font-bold flex items-center"
              >
                <span className="material-icons text-base mr-1">close</span>關閉
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6 text-gray-900">
              <div className="flex flex-wrap gap-3 bg-amber-50 p-4 rounded-xl border border-amber-200">
                {sysConfig.rubric_link && (
                  <a
                    href={sysConfig.rubric_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-indigo-700 hover:bg-indigo-800 text-white px-4 py-2 rounded-lg text-sm font-black inline-flex items-center shadow-sm"
                  >
                    <span className="material-icons text-base mr-1.5">open_in_new</span>
                    開啟官方評分規準表 (PDF) ↗
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
                    開啟實施計畫簡章 ↗
                  </a>
                )}
              </div>

              {/* 四大評分指標 */}
              <div className="space-y-4">
                <h4 className="text-lg font-black text-gray-900 border-b pb-2">
                  四大評分指標與配分比重（滿分 100 分）
                </h4>

                <div className="grid grid-cols-1 gap-3">
                  <div className="p-3.5 rounded-xl border border-amber-200 bg-white shadow-2xs">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-base font-black text-amber-950">1. 簡報內容（40%）</span>
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-black text-xs">最高 40 分</span>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      主題契合度、問題意識與探究深度、資料正確性、邏輯結構完整性。
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-blue-200 bg-white shadow-2xs">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-base font-black text-blue-950">2. 表達能力（30%）</span>
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-900 font-black text-xs">最高 30 分</span>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      口齒清晰度、語調流暢自然、時間掌控（5~6分鐘）、重點闡述能力。
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-emerald-200 bg-white shadow-2xs">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-base font-black text-emerald-950">3. 台風表現（20%）</span>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-black text-xs">最高 20 分</span>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      肢體語言自然大方、眼神交流、自信心、團隊分工合作與默契。
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-purple-200 bg-white shadow-2xs">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-base font-black text-purple-950">4. 製作技巧（10%）</span>
                      <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-900 font-black text-xs">最高 10 分</span>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      版面視覺美感、圖文排版比例（字體適中）、色彩搭配與多媒體效果。
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
