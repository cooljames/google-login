import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { apiFetch } from '../lib/api';

export default function PostDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorModal, setErrorModal] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    apiFetch(`/api/posts/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setPost(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    try {
      const res = await apiFetch(`/api/posts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('삭제 실패');
      navigate('/board');
    } catch (e) {
      setErrorModal((e as Error).message);
    } finally {
      setShowConfirm(false);
    }
  };

  if (loading) return <div className="p-xl text-center">로딩 중...</div>;
  if (!post) return <div className="p-xl text-center">게시글을 찾을 수 없습니다.</div>;

  const isAuthorOrAdmin = user && (user.id === post.authorId || user.role === 'admin');

  return (
    <main className="flex-grow w-full max-w-[1000px] mx-auto px-margin-mobile md:px-margin-desktop py-lg">
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden p-md md:p-lg flex flex-col gap-md">
        
        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-md">
            <div className="bg-surface-container-lowest p-lg rounded-xl min-w-[320px] max-w-[384px] w-full border border-outline-variant shadow-lg flex flex-col gap-md">
              <p className="font-body-lg text-on-surface text-center break-keep">정말 삭제하시겠습니까?</p>
              <div className="flex justify-center gap-sm mt-xs">
                <button onClick={() => setShowConfirm(false)} className="px-md py-sm rounded bg-surface-container hover:bg-surface-variant text-on-surface transition-colors font-label-md shrink-0">취소</button>
                <button onClick={handleDelete} className="px-md py-sm rounded bg-error text-on-error hover:bg-error-container transition-colors font-label-md shrink-0">삭제</button>
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

        <header className="flex flex-col gap-sm border-b border-outline-variant pb-md">
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-xs">
              <span className="bg-surface-container text-on-surface-variant font-label-sm px-2 py-1 rounded w-fit">
                {post.type}
              </span>
              <h1 className="font-headline-md text-on-surface break-keep">{post.title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-md font-body-sm text-on-surface-variant">
            <span>작성자: {post.author || '알 수 없음'}</span>
            <span>조회수: {post.views}</span>
            <span>작성일: {post.createdAt ? new Date(post.createdAt).toLocaleString() : '-'}</span>
          </div>
        </header>

        <section className="font-body-md text-on-surface whitespace-pre-wrap min-h-[300px]">
          {post.content || '내용이 없습니다.'}
        </section>

        {post.attachmentName && post.attachmentUrl && (
          <section className="mt-md border border-outline-variant bg-surface-container-lowest rounded p-md">
            <h3 className="font-label-md text-on-surface-variant flex items-center gap-xs mb-sm">
              <span className="material-symbols-outlined text-[18px]">attach_file</span>
              첨부파일
            </h3>
            <a 
              href={post.attachmentUrl} 
              download={post.attachmentName}
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-xs font-body-sm text-primary hover:underline"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              {post.attachmentName}
            </a>
          </section>
        )}

        <footer className="border-t border-outline-variant pt-md flex justify-between items-center mt-md">
          <button 
            onClick={() => navigate('/board')}
            className="flex items-center gap-xs px-sm py-2 text-on-surface-variant hover:bg-surface-container-low rounded transition-colors font-label-md"
          >
            <span className="material-symbols-outlined text-[18px]">list</span>
            목록으로
          </button>
          
          {isAuthorOrAdmin && (
            <div className="flex gap-xs">
              <Link 
                to={`/board/edit/${post.id}`}
                className="px-sm py-2 text-primary hover:bg-primary-container rounded transition-colors font-label-md"
              >
                수정
              </Link>
              <button 
                onClick={() => setShowConfirm(true)}
                className="px-sm py-2 text-error hover:bg-error-container rounded transition-colors font-label-md"
              >
                삭제
              </button>
            </div>
          )}
        </footer>
      </div>
    </main>
  );
}
