import { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';

export default function Board() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/posts')
      .then(r => r.json())
      .then(data => {
        setPosts(data);
        setLoading(false);
      })
      .catch(console.error);
  }, []);

  return (
    <main className="flex-grow w-full max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop py-lg">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-lg gap-sm">
        <div>
          <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface mb-base">공지사항 및 게시판</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">새로운 소식과 다양한 정보를 확인하세요.</p>
        </div>
        <button 
          className="bg-primary text-on-primary font-label-md text-label-md px-md py-[12px] rounded hover:bg-primary-container transition-colors w-full md:w-auto flex items-center justify-center gap-xs"
          onClick={() => {
            if (user) {
              navigate('/board/new');
            } else {
              alert('로그인이 필요합니다.');
            }
          }}
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          새 글 쓰기
        </button>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
        <div className="hidden md:grid grid-cols-12 gap-sm p-sm bg-surface-container-low border-b border-outline-variant font-label-md text-label-md text-on-surface-variant">
          <div className="col-span-1 text-center">번호</div>
          <div className="col-span-7">제목</div>
          <div className="col-span-2 text-center">작성자</div>
          <div className="col-span-2 text-center">작성일</div>
        </div>

        <div className="flex flex-col">
          {loading ? (
            <div className="p-md text-center">로딩 중...</div>
          ) : posts.length === 0 ? (
            <div className="p-md text-center">게시글이 없습니다.</div>
          ) : posts.map((post) => (
            <div key={post.id} className="grid grid-cols-1 md:grid-cols-12 gap-xs md:gap-sm p-sm md:p-sm border-b border-outline-variant hover:bg-surface-container-low transition-colors items-center">
              <div className="hidden md:block col-span-1 text-center font-body-sm text-body-sm text-on-surface-variant">{post.id}</div>
              <div className="col-span-1 md:col-span-7 flex flex-col md:flex-row md:items-center gap-xs">
                {post.type !== '일반' && (
                  <span className="bg-surface-container text-on-surface-variant font-label-sm text-label-sm px-2 py-1 rounded w-fit">{post.type}</span>
                )}
                <Link to={`/board/${post.id}`} className="font-body-md text-body-md text-on-surface hover:text-primary transition-colors line-clamp-1">{post.title}</Link>
                {post.attachment_name && <span className="material-symbols-outlined text-[16px] text-outline" title="첨부파일 있음">attachment</span>}
              </div>
              <div className="col-span-1 md:col-span-2 flex justify-between md:justify-center items-center mt-xs md:mt-0 font-body-sm text-body-sm text-on-surface-variant">
                <span className="md:hidden">작성자: </span>
                {post.author}
              </div>
              <div className="col-span-1 md:col-span-2 flex justify-between md:justify-center items-center font-body-sm text-body-sm text-on-surface-variant">
                <span className="md:hidden">작성일: </span>
                {post.createdAt}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="flex justify-center mt-lg gap-xs">
        <button className="p-xs text-on-surface-variant border border-outline-variant rounded hover:bg-surface-container-low transition-colors flex items-center justify-center">
          <span className="material-symbols-outlined text-[20px]">chevron_left</span>
        </button>
        <button className="w-[36px] h-[36px] bg-primary text-on-primary font-label-md text-label-md rounded flex items-center justify-center">1</button>
        <button className="w-[36px] h-[36px] text-on-surface border border-transparent hover:bg-surface-container-low font-label-md text-label-md rounded flex items-center justify-center transition-colors">2</button>
        <button className="w-[36px] h-[36px] text-on-surface border border-transparent hover:bg-surface-container-low font-label-md text-label-md rounded flex items-center justify-center transition-colors">3</button>
        <button className="p-xs text-on-surface-variant border border-outline-variant rounded hover:bg-surface-container-low transition-colors flex items-center justify-center">
          <span className="material-symbols-outlined text-[20px]">chevron_right</span>
        </button>
      </div>
    </main>
  );
}
