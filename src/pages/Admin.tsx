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
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [postPage, setPostPage] = useState(1);
  const [postTotalPages, setPostTotalPages] = useState(1);
  const postLimit = 10;

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

  const loadPosts = () => {
    if (user?.role === 'admin' && view === 'posts') {
      apiFetch(`/api/posts?page=${postPage}&limit=${postLimit}`)
        .then(async r => {
          const text = await r.text();
          return text ? JSON.parse(text) : { items: [], pagination: { totalPages: 1 } };
        })
        .then(data => {
          if (Array.isArray(data)) {
            setPosts(data);
            setPostTotalPages(1);
          } else {
            setPosts(data.items || []);
            setPostTotalPages(data.pagination?.totalPages || 1);
          }
        })
        .catch(console.error);
    }
  };

  useEffect(() => {
    loadPosts();
  }, [user, view, postPage]);

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
          loadPosts();
          setStats(s => ({ ...s, postsCount: s.postsCount - 1 }));
          setSelectedPostIds(selectedPostIds.filter(id => id !== postId));
        } catch (e) {
          setErrorModal((e as Error).message);
        } finally {
          setConfirmModal(null);
        }
      }
    });
  };

  const handleBulkDeletePosts = async () => {
    if (selectedPostIds.length === 0) return;
    
    setConfirmModal({
      message: `선택한 ${selectedPostIds.length}개의 게시글을 정말 삭제하시겠습니까?`,
      onConfirm: async () => {
        try {
          const res = await apiFetch(`/api/admin/posts/bulk`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postIds: selectedPostIds })
          });
          
          const text = await res.text();
          if (!res.ok) {
            let errorMsg = '일괄 삭제 실패';
            try {
              if (text) {
                const data = JSON.parse(text);
                errorMsg = data.error || errorMsg;
              }
            } catch (e) {}
            throw new Error(errorMsg);
          }
          
          loadPosts();
          setStats(s => ({ ...s, postsCount: s.postsCount - selectedPostIds.length }));
          setSelectedPostIds([]);
        } catch (e) {
          setErrorModal((e as Error).message);
        } finally {
          setConfirmModal(null);
        }
      }
    });
  };

  const getPostPageNumbers = () => {
    const maxVisiblePages = 5;
    let startPage = Math.max(1, postPage - Math.floor(maxVisiblePages / 2));
    let endPage = startPage + maxVisiblePages - 1;
    if (endPage > postTotalPages) {
      endPage = postTotalPages;
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    const pages = [];
    for (let i = startPage; i <= endPage; i++) pages.push(i);
    return pages;
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
          setSelectedUserIds(selectedUserIds.filter(id => id !== userId));
        } catch (e) {
          setErrorModal((e as Error).message);
        } finally {
          setConfirmModal(null);
        }
      }
    });
  };

  const handleBulkDeleteUsers = async () => {
    if (selectedUserIds.length === 0) return;
    
    setConfirmModal({
      message: `선택한 ${selectedUserIds.length}명의 사용자를 정말 삭제하시겠습니까?\n이들이 작성한 모든 게시글도 함께 삭제됩니다.`,
      onConfirm: async () => {
        try {
          const res = await apiFetch(`/api/admin/users/bulk`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userIds: selectedUserIds })
          });
          
          const text = await res.text();
          if (!res.ok) {
            let errorMsg = '일괄 삭제 실패';
            try {
              if (text) {
                const data = JSON.parse(text);
                errorMsg = data.error || errorMsg;
              }
            } catch (e) {}
            throw new Error(errorMsg);
          }
          
          setUsers(users.filter(u => !selectedUserIds.includes(u.id)));
          setStats(s => ({ ...s, usersCount: s.usersCount - selectedUserIds.length }));
          setSelectedUserIds([]);
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
          <div className="flex flex-col gap-md">
            <div className="flex justify-between items-center bg-surface-container-lowest border border-outline-variant p-sm rounded-xl">
              <span className="font-body-md text-on-surface-variant pl-xs">
                총 {users.length}명 중 {selectedUserIds.length}명 선택됨
              </span>
              <button
                disabled={selectedUserIds.length === 0}
                onClick={handleBulkDeleteUsers}
                className="px-md py-sm rounded bg-error text-on-error hover:bg-error-container disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-label-md shrink-0 flex items-center gap-xs"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
                선택 삭제
              </button>
            </div>

            <section className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden flex flex-col">
              <div className="p-sm bg-surface-container-low border-b border-outline-variant grid grid-cols-12 gap-sm font-label-md text-on-surface-variant items-center">
                <div className="col-span-1 text-center">
                  <input 
                    type="checkbox"
                    checked={users.length > 0 && selectedUserIds.length === users.filter(u => u.id !== user?.id).length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedUserIds(users.filter(u => u.id !== user?.id).map(u => u.id));
                      } else {
                        setSelectedUserIds([]);
                      }
                    }}
                    className="w-4 h-4 cursor-pointer"
                  />
                </div>
                <div className="col-span-3">사용자</div>
                <div className="col-span-4">이메일</div>
                <div className="col-span-2 text-center">권한</div>
                <div className="col-span-2 text-center">관리</div>
              </div>
              {users.map(u => (
                <div key={u.id} className="p-sm border-b border-outline-variant grid grid-cols-12 gap-sm items-center font-body-sm text-on-surface hover:bg-surface-container-low">
                  <div className="col-span-1 text-center">
                    <input 
                      type="checkbox"
                      disabled={u.id === user?.id}
                      checked={selectedUserIds.includes(u.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedUserIds([...selectedUserIds, u.id]);
                        } else {
                          setSelectedUserIds(selectedUserIds.filter(id => id !== u.id));
                        }
                      }}
                      className="w-4 h-4 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div className="col-span-3 flex items-center gap-xs">
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
                      className="text-primary hover:underline text-xs font-semibold"
                    >
                      {u.role === 'admin' ? '해제' : '지정'}
                    </button>
                    <button 
                      onClick={() => handleDeleteUser(u.id, u.name)}
                      disabled={u.id === user?.id}
                      className="text-error hover:underline text-xs disabled:opacity-30 disabled:no-underline font-semibold"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </section>
          </div>
        ) : (
          <div className="flex flex-col gap-md">
            <div className="flex justify-between items-center bg-surface-container-lowest border border-outline-variant p-sm rounded-xl">
              <span className="font-body-md text-on-surface-variant pl-xs">
                총 {stats.postsCount}개의 게시물 중 {selectedPostIds.length}개 선택됨
              </span>
              <div className="flex items-center gap-sm">
                <button
                  disabled={selectedPostIds.length === 0}
                  onClick={handleBulkDeletePosts}
                  className="px-md py-sm rounded bg-error text-on-error hover:bg-error-container disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-label-md shrink-0 flex items-center gap-xs"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                  선택 삭제
                </button>
                <button
                  onClick={() => navigate('/board/new?admin=true')}
                  className="px-md py-sm rounded bg-primary text-on-primary hover:bg-primary-container hover:shadow-md transition-colors font-label-md shrink-0 flex items-center gap-xs"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  새 글 등록
                </button>
              </div>
            </div>

            <section className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden flex flex-col">
              <div className="p-sm bg-surface-container-low border-b border-outline-variant grid grid-cols-12 gap-sm font-label-md text-on-surface-variant items-center">
                <div className="col-span-1 text-center">
                  <input 
                    type="checkbox"
                    checked={posts.length > 0 && selectedPostIds.length === posts.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPostIds(posts.map(p => p.id));
                      } else {
                        setSelectedPostIds([]);
                      }
                    }}
                    className="w-4 h-4 cursor-pointer"
                  />
                </div>
                <div className="col-span-2">카테고리</div>
                <div className="col-span-5">제목</div>
                <div className="col-span-2">작성자</div>
                <div className="col-span-2 text-center">관리</div>
              </div>
              {posts.map(p => (
                <div key={p.id} className="p-sm border-b border-outline-variant grid grid-cols-12 gap-sm items-center font-body-sm text-on-surface hover:bg-surface-container-low">
                  <div className="col-span-1 text-center">
                    <input 
                      type="checkbox"
                      checked={selectedPostIds.includes(p.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPostIds([...selectedPostIds, p.id]);
                        } else {
                          setSelectedPostIds(selectedPostIds.filter(id => id !== p.id));
                        }
                      }}
                      className="w-4 h-4 cursor-pointer"
                    />
                  </div>
                  <div className="col-span-2">
                    <span className="bg-surface-variant text-on-surface font-label-sm text-label-sm px-2 py-1 rounded">{p.type}</span>
                  </div>
                  <div className="col-span-5 truncate flex items-center gap-xs">
                    <a href={`/board/${p.id}`} className="hover:underline text-primary font-semibold">{p.title}</a>
                    {p.attachmentName && <span className="material-symbols-outlined text-[16px] text-outline" title="첨부파일 있음">attachment</span>}
                  </div>
                  <div className="col-span-2 truncate">{p.author || '알 수 없음'}</div>
                  <div className="col-span-2 text-center flex justify-center gap-sm">
                    <button 
                      onClick={() => navigate(`/board/edit/${p.id}?admin=true`)}
                      className="text-primary hover:underline text-xs font-semibold"
                    >
                      수정
                    </button>
                    <button 
                      onClick={() => handleDeletePost(p.id)}
                      className="text-error hover:underline text-xs font-semibold"
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

            {postTotalPages > 1 && (
              <div className="flex justify-center mt-lg gap-xs">
                <button 
                  onClick={() => {
                    if (postPage > 1) setPostPage(postPage - 1);
                  }}
                  disabled={postPage === 1}
                  className="p-xs text-on-surface-variant border border-outline-variant rounded hover:bg-surface-container-low transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                </button>
                
                {getPostPageNumbers().map(pageNum => (
                  <button 
                    key={pageNum}
                    onClick={() => setPostPage(pageNum)}
                    className={`w-[36px] h-[36px] rounded flex items-center justify-center font-label-md text-label-md transition-colors ${pageNum === postPage ? 'bg-primary text-on-primary' : 'text-on-surface border border-transparent hover:bg-surface-container-low'}`}
                  >
                    {pageNum}
                  </button>
                ))}

                <button 
                  onClick={() => {
                    if (postPage < postTotalPages) setPostPage(postPage + 1);
                  }}
                  disabled={postPage === postTotalPages}
                  className="p-xs text-on-surface-variant border border-outline-variant rounded hover:bg-surface-container-low transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
