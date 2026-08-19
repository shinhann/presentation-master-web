/**
 * 簡報達人評分系統 115學年度 - 前端路由與調度核心 (js/app.js)
 */

window.App = function() {
  const { useState, useEffect } = React;

  const [currentUser, setCurrentUser] = useState(null);
  const [adminTab, setAdminTab] = useState('teams'); // 'teams' | 'judges' | 'config' | 'results'

  // 從 LocalStorage 載入登入狀態
  useEffect(() => {
    const saved = localStorage.getItem('currentUser');
    if (saved) {
      try {
        setCurrentUser(JSON.parse(saved));
      } catch (e) {
        localStorage.removeItem('currentUser');
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    setCurrentUser(null);
  };

  // 1. 未登入狀態 -> 顯示 LoginView
  if (!currentUser) {
    return <window.LoginView onLoginSuccess={(userData) => setCurrentUser(userData)} />;
  }

  // 2. 評審身分 -> 顯示 JudgeView
  if (currentUser.role === 'judge') {
    return <window.JudgeView user={currentUser} onLogout={handleLogout} />;
  }

  // 3. 管理員身分 -> 顯示 AdminDashboard (含分頁)
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-light)' }}>
      {/* 管理端 Header */}
      <header className="bg-amber-950 text-white px-6 py-3 shadow flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <span className="material-icons text-amber-400 text-2xl">admin_panel_settings</span>
          <div>
            <h1 className="text-lg font-bold">{window.APP_CONFIG.CURRENT_YEAR}學年度 簡報達人擂台賽 — 系統管理後台</h1>
            <p className="text-xs text-amber-200">最高權限管理員</p>
          </div>
        </div>
        <button onClick={handleLogout} className="bg-red-700 hover:bg-red-800 text-white text-xs px-3 py-1.5 rounded-md flex items-center">
          <span className="material-icons text-sm mr-1">logout</span>登出後台
        </button>
      </header>

      {/* 管理端 Tab 導覽 */}
      <div className="bg-white border-b px-6 shadow-sm">
        <div className="flex space-x-4">
          <button
            onClick={() => setAdminTab('teams')}
            className={`py-3 text-xs font-bold border-b-2 flex items-center transition ${
              adminTab === 'teams' ? 'border-amber-900 text-amber-900' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <span className="material-icons text-base mr-1">groups</span>參賽隊伍管理
          </button>
          <button
            onClick={() => setAdminTab('judges')}
            className={`py-3 text-xs font-bold border-b-2 flex items-center transition ${
              adminTab === 'judges' ? 'border-amber-900 text-amber-900' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <span className="material-icons text-base mr-1">badge</span>評審名單與密碼
          </button>
          <button
            onClick={() => setAdminTab('config')}
            className={`py-3 text-xs font-bold border-b-2 flex items-center transition ${
              adminTab === 'config' ? 'border-amber-900 text-amber-900' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <span className="material-icons text-base mr-1">settings</span>系統與比賽設定
          </button>
          <button
            onClick={() => setAdminTab('results')}
            className={`py-3 text-xs font-bold border-b-2 flex items-center transition ${
              adminTab === 'results' ? 'border-amber-900 text-amber-900' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <span className="material-icons text-base mr-1">assessment</span>成績總表與匯出
          </button>
        </div>
      </div>

      {/* 管理端內容裝載 */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {adminTab === 'teams' && <window.AdminTeamsView />}
        {adminTab === 'judges' && <window.AdminJudgesView />}
        {adminTab === 'config' && <window.AdminConfigView />}
        {adminTab === 'results' && <window.AdminResultsView />}
      </main>
    </div>
  );
};
