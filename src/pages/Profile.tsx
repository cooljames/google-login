import React, { useState } from 'react';
import { useAuth } from '../components/AuthContext';
import { apiFetch } from '../lib/api';

export default function Profile() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  if (!user) {
    return (
      <main className="flex-grow w-full max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop py-xl">
        <div className="max-w-[640px] mx-auto text-center">
          <h1 className="font-headline-md text-headline-md text-on-surface mb-xs">로그인이 필요합니다</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">프로필을 보려면 로그인하세요.</p>
        </div>
      </main>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setMessage({ type: 'error', text: '닉네임을 입력하세요.' });

    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await apiFetch('/api/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) throw new Error('수정에 실패했습니다.');
      setMessage({ type: 'success', text: '프로필이 업데이트되었습니다. 새로고침을 해주세요.' });
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setMessage({ type: 'error', text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex-grow w-full max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop py-xl">
      <div className="max-w-[640px] mx-auto">
        <div className="mb-lg">
          <h1 className="font-headline-lg text-headline-lg text-on-surface mb-xs">프로필 설정</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">플랫폼에서 사용할 기본 정보와 이미지를 관리하세요.</p>
        </div>

        {message.text && (
          <div className={`p-md rounded-xl mb-md ${message.type === 'error' ? 'bg-error-container text-on-error-container' : 'bg-primary-container text-on-primary-container'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md md:p-lg">
          <form onSubmit={handleSave}>
            <div className="flex items-center gap-md mb-lg pb-md border-b border-outline-variant">
              <div className="relative w-24 h-24 rounded-full overflow-hidden border border-outline-variant bg-surface-container">
                <img 
                  alt="Current profile picture" 
                  className="w-full h-full object-cover" 
                  src={user.picture || 'https://via.placeholder.com/96'} 
                />
              </div>
              <div className="flex flex-col gap-xs">
                <button className="font-label-md text-label-md text-on-surface bg-surface-container-lowest border border-outline-variant px-[20px] py-[10px] rounded hover:bg-surface-container-low transition-colors w-fit" type="button">
                  이미지 변경
                </button>
                <p className="font-body-sm text-body-sm text-on-surface-variant">JPG, GIF 또는 PNG. 최대 5MB.</p>
              </div>
            </div>

            <div className="flex flex-col gap-md mb-xl">
              <div className="flex flex-col gap-xs">
                <label className="font-label-md text-label-md text-on-surface" htmlFor="nickname">닉네임</label>
                <input 
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded px-md py-sm font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors" 
                  id="nickname" 
                  name="nickname" 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">플랫폼 내에서 표시될 이름입니다.</p>
              </div>
              
              <div className="flex flex-col gap-xs">
                <label className="font-label-md text-label-md text-on-surface" htmlFor="email">이메일 주소</label>
                <input 
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded px-md py-sm font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors" 
                  id="email" 
                  name="email" 
                  type="email" 
                  defaultValue={user.email} 
                  disabled
                  readOnly
                />
              </div>
            </div>

            <div className="flex justify-end gap-sm pt-md border-t border-outline-variant">
              <button onClick={() => setName(user.name || '')} className="font-label-md text-label-md text-on-surface bg-surface-container-lowest border border-outline-variant px-[20px] py-[12px] rounded hover:bg-surface-container-low transition-colors" type="button">
                취소
              </button>
              <button disabled={loading} className="font-label-md text-label-md text-on-primary bg-primary px-[24px] py-[12px] rounded hover:bg-primary-container transition-colors disabled:opacity-50" type="submit">
                {loading ? '저장 중...' : '변경사항 저장'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
