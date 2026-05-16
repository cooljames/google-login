import { useState, useEffect } from 'react';
import { useAuth } from '../components/AuthContext';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';

export default function Admin() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ usersCount: 0, postsCount: 0, adminCount: 0 });
  const [users, setUsers] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [view, setView] = useState<'overview' | 'users' | 'posts'>('overview');
  const [confirmModal, setConfirmModal] = useState<{message: string, onConfirm: () => void} | null>(null);
  const [errorModal, setErrorModal] = useState('');

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'admin')) {
      setErrorModal('관리자 권한이 없습니다.');
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user?.role === 'admin') {
      apiFetch('/api/admin/stats')
        .then(async r => {
          const text = await r.text();
          return text ? JSON.parse(text) : { usersCount: 0, postsCount: 0, adminCount: 0 };
        })
        .then(setStats)
        .catch(console.error);
        
      apiFetch('/api/admin/users')
        .then(async r => {
          const text = await r.text();
          return text ? JSON.parse(text) : [];
        })
        .then(setUsers)
        .catch(console.error);
    }
  }, [user]);

  useEffect(() => {
    if (user?.role === 'admin' && view === 'posts') {
      apiFetch('/api/posts')
        .then(async r => {
          const text = await r.text();
          return text ? JSON.parse(text) : [];
        })
        .then(setPosts)
        .catch(console.error);
    }
  }, [user, view]);

  const handleRoleChange = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    setConfirmModal({
      message: `사용자의 권한을 ${newRole}로 변경하시겠습니까?`,
      onConfirm: async () => {
        try {
          const res = await apiFetch(`/api/admin/users/${userId}/role`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: newRole })
          });
          if (!res.ok) throw new Error('변경 실패');
          setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
        } catch (e) {
          setErrorModal((e as Error).message);
        } finally {
          setConfirmModal(null);
        }
      }
    });
  };

  const handleDeletePost = async (postId: string) => {
    setConfirmModal({
      message: '정말 삭제하시겠습니까?',
      onConfirm: async () => {
        try {
          const res = await apiFetch(`/api/posts/${postId}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('삭제 실패');
          setPosts(posts.filter(p => p.id !== postId));
          setStats(s => ({ ...s, postsCount: s.postsCount - 1 }));
        } catch (e) {
          setErrorModal((e as Error).message);
        } finally {
          setConfirmModal(null);
        }
      }
    });
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    setConfirmModal({
      message: `[${userName}] 사용자를 정말 삭제하시겠습니까?\n작성한 모든 게시글도 함께 삭제됩니다.`,
      onConfirm: async () => {
        try {
          const res = await apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
          const text = await res.text();
          
          if (!res.ok) {
            let errorMsg = '삭제 실패';
            try {
              if (text) {
                const data = JSON.parse(text);
                errorMsg = data.error || errorMsg;
              }
            } catch (e) {}
            throw new Error(errorMsg);
          }
          
          setUsers(users.filter(u => u.id !== userId));
          setStats(s => ({ ...s, usersCount: s.usersCount - 1 }));
        } catch (e) {
          setErrorModal((e as Error).message);
        } finally {
          setConfirmModal(null);
        }
      }
    });
  };

  if (authLoading || !user || user.role !== 'admin') return <div className="p-xl text-center">Loading...</div>;

  return (
    <main className="flex-grow flex flex-col md:flex-row w-full max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop py-lg gap-lg relative">
      
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-md">
          <div className="bg-surface-container-lowest p-lg rounded-xl min-w-[320px] max-w-[384px] w-full border border-outline-variant shadow-lg flex flex-col gap-md">
            <p className="font-body-lg text-on-surface text-center break-keep whitespace-pre-line">{confirmModal.message}</p>
            <div className="flex justify-center gap-sm mt-xs">
              <button onClick={() => setConfirmModal(null)} className="px-md py-sm rounded bg-surface-container hover:bg-surface-variant text-on-surface transition-colors font-label-md shrink-0">취소</button>
              <button onClick={confirmModal.onConfirm} className="px-md py-sm rounded bg-error text-on-error hover:bg-error-container transition-colors font-label-md shrink-0">확인</button>
            </div>
          </div>
        </div>
      )}

      {errorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-md">
          <div className="bg-surface-container-lowest p-lg rounded-xl min-w-[320px] max-w-[384px] w-full border border-outline-variant shadow-lg flex flex-col gap-md">
            <p className="font-body-lg text-on-surface text-center text-error break-keep">{errorModal}</p>
            <div className="flex justify-center mt-xs">
              <button onClick={() => setErrorModal('')} className="px-md py-sm rounded bg-primary text-on-primary hover:bg-primary-container transition-colors font-label-md shrink-0">확인</button>
            </div>
          </div>
        </div>
      )}

      <aside className="hidden md:flex flex-col w-64 flex-shrink-0 gap-sm border-r border-outline-variant pr-md min-h-[calc(100vh-200px)]">
        <h2 className="font-label-sm text-label-sm text-outline uppercase tracking-wider mb-xs pl-3">대시보드 메뉴</h2>
        <button 
          onClick={() => setView('overview')}
          className={`flex items-center gap-xs px-3 py-2 rounded-DEFAULT font-label-md text-label-md transition-colors ${view === 'overview' ? 'bg-surface-container-low text-primary' : 'text-on-surface-variant hover:bg-surface-container-lowest hover:text-on-surface'}`}
        >
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: view === 'overview' ? "'FILL' 1" : undefined }}>dashboard</span>
          개요
        </button>
        <button 
          onClick={() => setView('users')}
          className={`flex items-center gap-xs px-3 py-2 rounded-DEFAULT font-label-md text-label-md transition-colors ${view === 'users' ? 'bg-surface-container-low text-primary' : 'text-on-surface-variant hover:bg-surface-container-lowest hover:text-on-surface'}`}
        >
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: view === 'users' ? "'FILL' 1" : undefined }}>group</span>
          사용자 관리
        </button>
        <button 
          onClick={() => setView('posts')}
          className={`flex items-center gap-xs px-3 py-2 rounded-DEFAULT font-label-md text-label-md transition-colors ${view === 'posts' ? 'bg-surface-container-low text-primary' : 'text-on-surface-variant hover:bg-surface-container-lowest hover:text-on-surface'}`}
        >
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: view === 'posts' ? "'FILL' 1" : undefined }}>article</span>
          게시물 관리
        </button>
      </aside>

      <div className="flex-grow flex flex-col gap-lg w-full">
        <header>
          <h1 className="font-headline-lg text-headline-lg text-on-surface mb-xs">
            {view === 'overview' ? '관리자 개요' : view === 'users' ? '사용자 관리' : '게시물 관리'}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">시스템의 주요 지표와 최근 활동을 확인하세요.</p>
        </header>

        {view === 'overview' ? (
          <>
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md">
              <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex flex-col justify-between h-full">
                <div className="flex justify-between items-start mb-md">
                  <div className="p-2 bg-secondary-container rounded-DEFAULT">
                    <span className="material-symbols-outlined text-on-secondary-container">group</span>
                  </div>
                </div>
                <div>
                  <p className="font-label-sm text-label-sm text-on-surface-variant mb-base">총 사용자</p>
                  <p className="font-headline-lg text-headline-lg text-on-surface">{stats.usersCount}</p>
                </div>
              </div>

              <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex flex-col justify-between h-full">
                <div className="flex justify-between items-start mb-md">
                  <div className="p-2 bg-tertiary-fixed rounded-DEFAULT">
                    <span className="material-symbols-outlined text-on-tertiary-fixed">post_add</span>
                  </div>
                </div>
                <div>
                  <p className="font-label-sm text-label-sm text-on-surface-variant mb-base">총 게시물</p>
                  <p className="font-headline-lg text-headline-lg text-on-surface">{stats.postsCount}</p>
                </div>
              </div>

              <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex flex-col justify-between h-full sm:col-span-2 lg:col-span-1">
                <div className="flex justify-between items-start mb-md">
                  <div className="p-2 bg-surface-variant rounded-DEFAULT">
                    <span className="material-symbols-outlined text-on-surface">admin_panel_settings</span>
                  </div>
                </div>
                <div>
                  <p className="font-label-sm text-label-sm text-on-surface-variant mb-base">관리자 계정</p>
                  <p className="font-headline-lg text-headline-lg text-on-surface">{stats.adminCount}</p>
                </div>
              </div>
            </section>
          </>
        ) : view === 'users' ? (
          <section className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden flex flex-col">
            <div className="p-sm bg-surface-container-low border-b border-outline-variant grid grid-cols-12 gap-sm font-label-md text-on-surface-variant">
              <div className="col-span-4">사용자</div>
              <div className="col-span-4">이메일</div>
              <div className="col-span-2 text-center">권한</div>
              <div className="col-span-2 text-center">관리</div>
            </div>
            {users.map(u => (
              <div key={u.id} className="p-sm border-b border-outline-variant grid grid-cols-12 gap-sm items-center font-body-sm text-on-surface hover:bg-surface-container-low">
                <div className="col-span-4 flex items-center gap-xs">
                  {u.picture ? <img src={u.picture} alt="" className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 bg-surface-variant rounded-full" />}
                  {u.name}
                </div>
                <div className="col-span-4 truncate">{u.email}</div>
                <div className="col-span-2 text-center">
                  <span className={`px-2 py-1 rounded font-label-sm ${u.role === 'admin' ? 'bg-error-container text-on-error-container' : 'bg-surface-variant text-on-surface'}`}>
                    {u.role.toUpperCase()}
                  </span>
                </div>
                <div className="col-span-2 text-center flex justify-center gap-sm">
                  <button 
                    onClick={() => handleRoleChange(u.id, u.role)}
                    className="text-primary hover:underline text-xs"
                  >
                    {u.role === 'admin' ? '해제' : '지정'}
                  </button>
                  <button 
                    onClick={() => handleDeleteUser(u.id, u.name)}
                    className="text-error hover:underline text-xs"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </section>
        ) : (
          <section className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden flex flex-col">
            <div className="p-sm bg-surface-container-low border-b border-outline-variant grid grid-cols-12 gap-sm font-label-md text-on-surface-variant">
              <div className="col-span-2">카테고리</div>
              <div className="col-span-5">제목</div>
              <div className="col-span-3">작성자</div>
              <div className="col-span-2 text-center">관리</div>
            </div>
            {posts.map(p => (
              <div key={p.id} className="p-sm border-b border-outline-variant grid grid-cols-12 gap-sm items-center font-body-sm text-on-surface hover:bg-surface-container-low">
                <div className="col-span-2">
                  <span className="bg-surface-variant text-on-surface font-label-sm text-label-sm px-2 py-1 rounded">{p.type}</span>
                </div>
                <div className="col-span-5 truncate">{p.title}</div>
                <div className="col-span-3 truncate">{p.author || '알 수 없음'}</div>
                <div className="col-span-2 text-center">
                  <button 
                    onClick={() => handleDeletePost(p.id)}
                    className="text-error hover:underline"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
            {posts.length === 0 && (
              <div className="p-lg text-center font-body-md text-on-surface-variant">
                게시물이 없습니다.
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
