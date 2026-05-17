import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { apiFetch } from '../lib/api';

export default function PostEditor() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isAdminView = searchParams.get('admin') === 'true';
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState('일반');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [existingAttachment, setExistingAttachment] = useState<{name: string, url: string} | null>(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);

  useEffect(() => {
    if (id) {
      setLoading(true);
      apiFetch(`/api/posts/${id}`)
        .then(r => r.json())
        .then(data => {
          if (data.error) throw new Error(data.error);
          setTitle(data.title);
          setContent(data.content || '');
          setType(data.type);
          if (data.attachment_name && data.attachment_url) {
            setExistingAttachment({ name: data.attachment_name, url: data.attachment_url });
          }
        })
        .catch(err => {
          setErrorMsg('게시글을 불러올 수 없습니다.');
          setTimeout(() => navigate('/board'), 2000);
        })
        .finally(() => setLoading(false));
    }
  }, [id, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setErrorMsg('제목을 입력해주세요.');

    setLoading(true);
    setErrorMsg('');
    try {
      const url = id ? `/api/posts/${id}` : '/api/posts';
      const method = id ? 'PUT' : 'POST';
      
      const formData = new FormData();
      formData.append('title', title);
      formData.append('content', content);
      formData.append('type', type);
      
      if (attachment) {
        formData.append('attachment', attachment);
      } else if (removeAttachment) {
        formData.append('remove_attachment', 'true');
      }
      
      const res = await apiFetch(url, {
        method,
        body: formData
      });
      
      if (!res.ok) throw new Error('저장에 실패했습니다.');
      
      const data = await res.json();
      navigate(isAdminView ? '/admin' : `/board/${data.id || id}`);
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return <div className="p-lg text-center font-body-md">로그인이 필요합니다.</div>;
  }

  return (
    <main className="flex-grow w-full max-w-[800px] mx-auto px-margin-mobile md:px-margin-desktop py-lg text-on-surface">
      <h1 className="font-headline-md text-headline-md mb-md">{id ? '게시글 수정' : '새 글 쓰기'}</h1>
      
      {errorMsg && (
        <div className="bg-error-container text-on-error-container p-sm rounded mb-md font-body-sm">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-md">
        <div className="flex flex-col gap-xs">
          <label className="font-label-md text-label-md">카테고리</label>
          <select 
            value={type} 
            onChange={(e) => setType(e.target.value)}
            className="p-sm bg-surface-container border border-outline-variant rounded font-body-md"
          >
            <option value="일반">일반</option>
            {user?.role === 'admin' && <option value="공지">공지</option>}
            <option value="질문">질문</option>
          </select>
        </div>

        <div className="flex flex-col gap-xs">
          <label className="font-label-md text-label-md">제목</label>
          <input 
            type="text" 
            value={title} 
            onChange={(e) => setTitle(e.target.value)} 
            placeholder="제목을 입력하세요"
            className="p-sm bg-surface-container border border-outline-variant rounded font-body-md outline-none focus:border-primary transition-colors"
            required
          />
        </div>

        <div className="flex flex-col gap-xs">
          <label className="font-label-md text-label-md">본문</label>
          <textarea 
            value={content} 
            onChange={(e) => setContent(e.target.value)} 
            placeholder="내용을 입력하세요"
            rows={10}
            className="p-sm bg-surface-container border border-outline-variant rounded font-body-md outline-none focus:border-primary transition-colors resize-y"
          />
        </div>

        <div className="flex flex-col gap-xs">
          <label className="font-label-md text-label-md">첨부파일</label>
          <div className="flex items-center gap-sm">
            <input 
              type="file" 
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setAttachment(file);
                if (file) setRemoveAttachment(false);
              }}
              className="text-body-sm font-body-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-surface-variant file:text-on-surface hover:file:bg-surface-container-high transition-colors"
            />
          </div>
          {existingAttachment && !removeAttachment && !attachment && (
            <div className="flex items-center gap-xs mt-xs text-body-sm text-on-surface-variant bg-surface-container-low p-sm rounded w-fit">
              <span className="material-symbols-outlined text-[18px]">attachment</span>
              <span>{existingAttachment.name}</span>
              <button 
                type="button" 
                onClick={() => setRemoveAttachment(true)}
                className="ml-sm text-error hover:underline"
              >
                삭제
              </button>
            </div>
          )}
          {removeAttachment && existingAttachment && (
            <p className="text-body-sm text-error mt-xs">기존 파일이 삭제됩니다.</p>
          )}
        </div>

        <div className="flex justify-end gap-sm mt-sm">
          <button 
            type="button" 
            onClick={() => navigate(isAdminView ? '/admin' : '/board')}
            className="px-md py-sm bg-surface-container-low border border-outline-variant text-on-surface rounded font-label-md transition-colors hover:bg-surface-container"
          >
            취소
          </button>
          <button 
            type="submit" 
            disabled={loading}
            className="px-md py-sm bg-primary text-on-primary rounded font-label-md transition-colors hover:bg-primary-container hover:shadow-md active:scale-95 disabled:opacity-50"
          >
            {loading ? '저장 중...' : '저장'}
          </button>
        </div>
      </form>
    </main>
  );
}
