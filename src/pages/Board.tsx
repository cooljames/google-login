import { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';

export default function Board() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/posts?page=${currentPage}&limit=${limit}&q=${encodeURIComponent(searchQuery)}`)
      .then(async r => {
        const text = await r.text();
        return text ? JSON.parse(text) : { items: [], pagination: { totalPages: 1 } };
      })
      .then(data => {
        if (Array.isArray(data)) {
          setPosts(data);
        } else {
          setPosts(data.items || []);
          setTotalPages(data.pagination?.totalPages || 1);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Board fetch error:', err);
        setLoading(false);
      });
  }, [currentPage, limit, searchQuery]);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const getPageNumbers = () => {
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = startPage + maxVisiblePages - 1;
    if (endPage > totalPages) {
      endPage = totalPages;
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    const pages = [];
    for (let i = startPage; i <= endPage; i++) pages.push(i);
    return pages;
  };

  return (
    <main className="flex-grow w-full max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop py-lg">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-lg gap-sm">
        <div>
          <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface mb-base">공지사항 및 게시판</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">새로운 소식과 다양한 정보를 확인하세요.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-sm w-full md:w-auto">
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              setSearchQuery(searchInput);
              setCurrentPage(1);
            }}
            className="relative w-full sm:w-auto"
          >
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">search</span>
            <input 
              type="text" 
              placeholder="게시물 검색..." 
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10 pr-4 h-[42px] bg-surface-container-lowest border border-outline-variant rounded focus:border-primary focus:ring-1 focus:ring-primary font-body-sm text-body-sm text-on-surface w-full sm:w-48 placeholder:text-outline transition-colors outline-none" 
            />
          </form>
          <div className="flex flex-row items-center gap-sm w-full sm:w-auto">
            <select 
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-surface-container-lowest text-on-surface border border-outline-variant font-label-md text-label-md px-3 h-[42px] rounded focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary flex-grow sm:flex-grow-0"
            >
              <option value={10}>10개씩 보기</option>
              <option value={20}>20개씩 보기</option>
              <option value={30}>30개씩 보기</option>
              <option value={9999}>전체 보기</option>
            </select>
            <button 
              className="bg-primary text-on-primary font-label-md text-label-md px-md h-[42px] rounded hover:bg-primary-container transition-colors flex-grow sm:flex-grow-0 flex items-center justify-center gap-xs"
              onClick={() => {
                if (user) {
                  navigate('/board/new');
                } else {
                  navigate('/auth');
                }
              }}
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              새 글 쓰기
            </button>
          </div>
        </div>
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
                {post.attachmentName && <span className="material-symbols-outlined text-[16px] text-outline" title="첨부파일 있음">attachment</span>}
              </div>
              <div className="col-span-1 md:col-span-2 flex justify-between md:justify-center items-center mt-xs md:mt-0 font-body-sm text-body-sm text-on-surface-variant">
                <span className="md:hidden">작성자: </span>
                {post.author}
              </div>
              <div className="col-span-1 md:col-span-2 flex justify-between md:justify-center items-center font-body-sm text-body-sm text-on-surface-variant">
                <span className="md:hidden">작성일: </span>
                {post.createdAt ? new Date(post.createdAt).toLocaleDateString() : '-'}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {totalPages > 1 && (
        <div className="flex justify-center mt-lg gap-xs">
          <button 
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-xs text-on-surface-variant border border-outline-variant rounded hover:bg-surface-container-low transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_left</span>
          </button>
          
          {getPageNumbers().map(pageNum => (
            <button 
              key={pageNum}
              onClick={() => goToPage(pageNum)}
              className={`w-[36px] h-[36px] rounded flex items-center justify-center font-label-md text-label-md transition-colors ${pageNum === currentPage ? 'bg-primary text-on-primary' : 'text-on-surface border border-transparent hover:bg-surface-container-low'}`}
            >
              {pageNum}
            </button>
          ))}

          <button 
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="p-xs text-on-surface-variant border border-outline-variant rounded hover:bg-surface-container-low transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_right</span>
          </button>
        </div>
      )}
    </main>
  );
}
